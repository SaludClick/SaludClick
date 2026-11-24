const { registrarEvento } = require('./farmacia-notificacion-eventos.repository');
const { createHash } = require('node:crypto');
const { fallo } = require('../config/farmacia-operacion');
const { operacionConPagoReal } = require('../services/farmacia-operacion.rules');
// El ámbito depende de asignación persistente Y vínculo EPS vigente Y afiliación
// verificada a la cuenta del paciente. Nunca se deduce de un parámetro del cliente.
const AMBITO = `fa.farmacia_id=$1 AND fa.activa=true AND EXISTS (
 SELECT 1 FROM eps_farmacias ef JOIN eps_entidades ee ON ee.id=ef.eps_id AND ee.activa=true
 JOIN afiliado_cuentas_origen af ON af.eps_id=ef.eps_id AND af.usuario_id=s.usuario_id
 WHERE ef.farmacia_id=fa.farmacia_id AND ef.activa=true
 AND af.verificado_at IS NOT NULL
 AND af.afiliado_id IN (SELECT jsonb_array_elements_text(coalesce(nullif(current_setting('saludclick.afiliados',true),''),'[]')::jsonb)))
 AND (SELECT count(*) FROM eps_farmacias WHERE farmacia_id=fa.farmacia_id AND activa=true)=1`;
function createRepository(db = require('../config/database'), notificationsEnabled = require('../config/farmacia-notificaciones').habilitadas, origen = require('./afiliados-origen.repository')) {
    async function tx(actorId, role, write, operation) {
        const c=await db.connect();
        try {
            await c.query(write?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const {rows}=await c.query(`SELECT id,rol_id,estado FROM usuarios WHERE id=$1${write?' FOR SHARE':''}`,[actorId]);
            if(rows[0]?.rol_id!==role||rows[0]?.estado!=='ACTIVO')throw fallo(403,'CUENTA_NO_VIGENTE');
            const result=await operation(c);await c.query('COMMIT');return result;
        }catch(e){try{await c.query('ROLLBACK');}catch{}if(['40001','40P01','23505'].includes(e.code))throw fallo(409,'FARMACIA_CONFLICTO','Los datos cambiaron o ya existen. Actualiza y reintenta.');throw e;}
        finally{c.release();}
    }
    async function aviso(c,farmaciaId,solicitudId,tipo,evento) {
        if(!notificationsEnabled())return [];
        const inserted=await registrarEvento(c,farmaciaId,tipo,
            tipo==='NUEVA_SOLICITUD'?'Nueva solicitud asignada':'Solicitud actualizada',
            'Consulta el detalle de la solicitud asignada.',`solicitud:${solicitudId}:${evento}`);
        return inserted?[farmaciaId]:[];
    }
    async function sourceScope(c,farmaciaId) {
        const links=(await c.query(`SELECT ef.eps_id FROM eps_farmacias ef JOIN eps_entidades e ON e.id=ef.eps_id AND e.activa=true WHERE ef.farmacia_id=$1 AND ef.activa=true`,[farmaciaId])).rows;
        if(links.length!==1)throw fallo(403,'FARMACIA_EPS_NO_VIGENTE','Se requiere una sola EPS vinculada y vigente.');
        const original=await origen.leerAutorizados(String(links[0].eps_id),{take:50001,pagina:1,buscar:''});
        if(original.total>50000)throw fallo(503,'EPS_AMBITO_DEMASIADO_GRANDE');
        const cuentas=(await c.query(`SELECT a.afiliado_id,u.cedula,u.tipo_documento FROM afiliado_cuentas_origen a JOIN usuarios u ON u.id=a.usuario_id WHERE a.eps_id=$1 AND a.verificado_at IS NOT NULL AND u.rol_id=2 AND u.estado='ACTIVO'`,[String(links[0].eps_id)])).rows;
        const ids=require('../services/farmacia-identidad.rules').autorizados(original.pacientes,cuentas);
        await c.query("SELECT set_config('saludclick.afiliados',$1,true)",[JSON.stringify(ids)]);
    }
    const scoped=(id,write,operation)=>tx(id,3,write,async c=>{await sourceScope(c,id);return operation(c);});
    async function pedido(c,farmaciaId,id,lock=false) {
        const {rows}=await c.query(`SELECT s.id,s.fecha AT TIME ZONE 'UTC' AS fecha,s.estado,s.tipo_entrega,s.observaciones,
          s.updated_at AT TIME ZONE 'UTC' AS updated_at,
          fa.version,u.nombre,u.apellido,u.tipo_documento,u.cedula,af.eps_id,ee.nombre AS eps
          FROM solicitudes s JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id
          JOIN usuarios u ON u.id=s.usuario_id
          JOIN afiliado_cuentas_origen af ON af.usuario_id=u.id
          JOIN eps_entidades ee ON ee.id=af.eps_id
          WHERE ${AMBITO} AND s.id=$2 ${lock?'FOR UPDATE OF s,fa':''}`,[farmaciaId,id]);
        if(!rows[0])throw fallo(404,'SOLICITUD_NO_DISPONIBLE','Solicitud no encontrada en tu ámbito autorizado.');
        const order=rows[0];
        const details=await c.query(`SELECT d.cantidad,d.subtotal,m.id,m.nombre,m.descripcion,m.presentacion,m.requiere_formula,m.estado
          FROM detalle_solicitud d JOIN medicamentos m ON m.id=d.medicamento_id
          WHERE d.solicitud_id=$1 ORDER BY d.id${lock?' FOR SHARE OF d,m':''}`,[id]);
        const pagos=await c.query(`SELECT estado,simulacion,monto FROM pagos WHERE solicitud_id=$1${lock?' FOR SHARE':''}`,[id]);
        const formulas=await c.query(`SELECT f.id,f.nombre_original AS nombre,f.nombre_archivo,f.tipo_mime,g.permite_descarga
          FROM farmacia_formulas_autorizadas g JOIN formulas_medicas f ON f.id=g.formula_id
          JOIN solicitudes s ON s.id=g.solicitud_id AND s.usuario_id=f.usuario_id AND g.autorizado_por=s.usuario_id
          WHERE g.solicitud_id=$1 AND g.activa=true AND f.estado<>'ELIMINADA'`,[id]);
        const historial=await c.query(`SELECT e.id,e.estado_anterior,e.estado,e.created_at,e.observaciones,
          concat_ws(' ',u.nombre,u.apellido) AS responsable
          FROM farmacia_solicitud_eventos e JOIN usuarios u ON u.id=e.actor_id
          WHERE e.solicitud_id=$1 AND e.farmacia_id=$2 ORDER BY e.id`,[id,farmaciaId]);
        const detalles=details.rows.map(({cantidad,subtotal,...medicamento})=>({cantidad,medicamento}));
        const condiciones=operacionConPagoReal({...order,detalles,pagos:pagos.rows},details.rows.map(d=>d.subtotal));
        if(require('../config/farmacia-stock').habilitado()&&order.estado==='APROBADA'&&detalles.some(d=>d.medicamento.estado!=='DISPONIBLE')){condiciones.bloqueos.push('MEDICAMENTO_NO_DISPONIBLE');condiciones.siguienteEstado=null;}
        if(detalles.some(d=>!Number.isSafeInteger(d.cantidad)||d.cantidad<1)){condiciones.bloqueos.push('CANTIDADES_INVALIDAS');condiciones.siguienteEstado=null;}
        return {id:order.id,fecha:order.fecha,estado:order.estado,tipo_entrega:order.tipo_entrega,
          version:order.version,observaciones:order.observaciones,updated_at:order.updated_at,
          usuario:{nombre:order.nombre,apellido:order.apellido,tipo_documento:order.tipo_documento,cedula:order.cedula},eps:order.eps,
          detalles,formulas:formulas.rows,historial:historial.rows,
          operacion:condiciones};
    }
    function filtro(o,values) {
        const add=v=>{values.push(v);return `$${values.length}`;};
        let sql='';
        if(o.estado!=='todas')sql+=` AND s.estado::text=ANY(${add(o.estado==='activas'?['PENDIENTE','APROBADA','PREPARANDO','LISTA']:[o.estado])}::text[])`;
        if(o.id)sql+=` AND s.id=${add(o.id)}`;
        if(o.paciente)sql+=` AND strpos(lower(concat_ws(' ',u.nombre,u.apellido)),lower(${add(o.paciente)}))>0`;
        if(o.documento)sql+=` AND upper(btrim(u.cedula))=upper(${add(o.documento)})`;
        if(o.desde)sql+=` AND s.fecha>=(${add(o.desde)}::date::timestamp AT TIME ZONE 'America/Bogota' AT TIME ZONE 'UTC')`;
        if(o.hasta)sql+=` AND s.fecha<((${add(o.hasta)}::date+interval '1 day') AT TIME ZONE 'America/Bogota' AT TIME ZONE 'UTC')`;
        return sql;
    }
    async function autorizarFormulaEn(c, pacienteId, solicitudId, formulaId, permiteDescarga, { pdfRequerido = false } = {}) {
        const { rows: [formula] } = await c.query(`SELECT f.nombre_archivo,f.tipo_mime FROM formulas_medicas f
          JOIN solicitudes s ON s.usuario_id=f.usuario_id
          JOIN usuarios u ON u.id=s.usuario_id AND u.rol_id=2 AND u.estado='ACTIVO'
          WHERE s.id=$1 AND f.id=$2 AND f.usuario_id=$3 AND f.estado<>'ELIMINADA' FOR SHARE OF f,s,u`,
        [solicitudId,formulaId,pacienteId]);
        if (!formula || (pdfRequerido && (formula.tipo_mime !== 'application/pdf' ||
            !await require('../services/farmacia-formula-archivo.service').archivoPrivado(formula)))) {
            throw pdfRequerido
                ? fallo(400,'FORMULA_NO_DISPONIBLE','La fórmula PDF seleccionada no está disponible en tu cuenta o falta el archivo original.')
                : fallo(404,'FORMULA_NO_DISPONIBLE');
        }
        await c.query(`INSERT INTO farmacia_formulas_autorizadas(solicitud_id,formula_id,autorizado_por,permite_descarga) VALUES($1,$2,$3,$4)
          ON CONFLICT(solicitud_id,formula_id) DO UPDATE SET activa=true,permite_descarga=EXCLUDED.permite_descarga,
            autorizado_por=EXCLUDED.autorizado_por`,[solicitudId,formulaId,pacienteId,permiteDescarga]);
        return { vinculada: true };
    }
    return {
        tx, pedido, scoped, autorizarFormulaEn,
        contextoNotificaciones(farmaciaId,ids){return scoped(farmaciaId,false,async c=>{
            if(!ids.length)return [];
            return (await c.query(`SELECT s.id,s.fecha,concat_ws(' ',u.nombre,u.apellido) AS paciente FROM solicitudes s
              JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id JOIN usuarios u ON u.id=s.usuario_id
              WHERE ${AMBITO} AND s.id=ANY($2::int[])`,[farmaciaId,ids])).rows;
        });},
        vincularIdentidad(actorId,farmaciaId,usuarioId,afiliadoId){return tx(actorId,1,true,async c=>{
            await sourceScope(c,farmaciaId);
            const link=(await c.query('SELECT eps_id FROM eps_farmacias WHERE farmacia_id=$1 AND activa=true',[farmaciaId])).rows;
            const user=(await c.query("SELECT cedula,tipo_documento FROM usuarios WHERE id=$1 AND rol_id=2 AND estado='ACTIVO' FOR SHARE",[usuarioId])).rows[0];
            if(link.length!==1||!user?.cedula||!await origen.cuentaAutorizada(String(link[0].eps_id),afiliadoId,user.cedula,user.tipo_documento))throw fallo(403,'IDENTIDAD_NO_VERIFICADA','No se pudo verificar de forma única el tipo y número de documento en la fuente original de la EPS vinculada.');
            const previous=(await c.query('SELECT afiliado_id FROM afiliado_cuentas_origen WHERE usuario_id=$1 FOR UPDATE',[usuarioId])).rows[0];
            if(previous&&previous.afiliado_id!==afiliadoId)throw fallo(409,'IDENTIDAD_EXISTENTE','La cuenta ya tiene otra identidad verificada. Se requiere revisión.');
            await c.query(`INSERT INTO afiliado_cuentas_origen(usuario_id,afiliado_id,eps_id,verificado_por) VALUES($1,$2,$3,$4)
              ON CONFLICT(usuario_id) DO UPDATE SET eps_id=$3,verificado_por=$4,verificado_at=now()`,[usuarioId,afiliadoId,String(link[0].eps_id),actorId]);
            await c.query(`INSERT INTO farmacia_autorizacion_eventos(actor_id,farmacia_id,tipo,detalle) VALUES($1,$2,'IDENTIDAD_VERIFICADA',$3::jsonb)`,[actorId,farmaciaId,JSON.stringify({usuarioId,afiliadoId,epsId:String(link[0].eps_id)})]);
            return {verificada:true,usuarioId};
        });},
        configurarRuta(actorId,epsId,farmaciaId){return tx(actorId,1,true,async c=>{
            await sourceScope(c,farmaciaId);
            const link=(await c.query('SELECT eps_id FROM eps_farmacias WHERE farmacia_id=$1 AND activa=true',[farmaciaId])).rows;
            if(link.length!==1||String(link[0].eps_id)!==epsId)throw fallo(403,'RUTA_EPS_NO_AUTORIZADA');
            const f=(await c.query("SELECT id FROM usuarios WHERE id=$1 AND rol_id=3 AND estado='ACTIVO' FOR SHARE",[farmaciaId])).rows[0];
            if(!f)throw fallo(403,'FARMACIA_NO_VIGENTE');
            const current=(await c.query('SELECT farmacia_id FROM farmacia_rutas_eps WHERE eps_id=$1 FOR UPDATE',[epsId])).rows[0];
            if(current&&current.farmacia_id!==farmaciaId)throw fallo(409,'RUTA_EXISTENTE','Ya hay una política de enrutamiento. Requiere revisión antes de cambiar de farmacia.');
            await c.query(`INSERT INTO farmacia_rutas_eps(eps_id,farmacia_id,autorizado_por) VALUES($1,$2,$3)
              ON CONFLICT(eps_id) DO NOTHING`,[epsId,farmaciaId,actorId]);
            await c.query(`INSERT INTO farmacia_autorizacion_eventos(actor_id,farmacia_id,tipo,detalle) VALUES($1,$2,'RUTA_EPS',$3::jsonb)`,[actorId,farmaciaId,JSON.stringify({epsId})]);
            return {epsId,farmaciaId};
        });},
        async asignarNuevaEn(c,solicitudId,pacienteId) {
            const rutas=(await c.query(`SELECT r.farmacia_id,r.autorizado_por FROM farmacia_rutas_eps r
              JOIN afiliado_cuentas_origen a ON a.eps_id=r.eps_id AND a.usuario_id=$1 AND a.verificado_at IS NOT NULL
              JOIN usuarios admin ON admin.id=r.autorizado_por AND admin.rol_id=1 AND admin.estado='ACTIVO'
              JOIN usuarios f ON f.id=r.farmacia_id AND f.rol_id=3 AND f.estado='ACTIVO'
              JOIN eps_farmacias ef ON ef.farmacia_id=r.farmacia_id AND ef.eps_id=r.eps_id AND ef.activa=true
              JOIN eps_entidades ee ON ee.id=r.eps_id AND ee.activa=true
              WHERE r.activa=true FOR SHARE OF r,a,admin,f,ef,ee`,[pacienteId])).rows;
            if(rutas.length!==1)return {asignacionPendiente:true,destinatarios:[]};
            const r=rutas[0];
            try { await sourceScope(c,r.farmacia_id); }
            catch(error) {
                if([403,503].includes(error.status) || /^P(?:10|20)\d\d$/.test(error.code || '')) {
                    return {asignacionPendiente:true,destinatarios:[]};
                }
                throw error;
            }
            const permitido=(await c.query(`SELECT afiliado_id FROM afiliado_cuentas_origen WHERE usuario_id=$1 AND afiliado_id IN (SELECT jsonb_array_elements_text(current_setting('saludclick.afiliados')::jsonb))`,[pacienteId])).rows;
            if(permitido.length!==1)return {asignacionPendiente:true,destinatarios:[]};
            await c.query('INSERT INTO farmacia_asignaciones(solicitud_id,farmacia_id,asignado_por) VALUES($1,$2,$3)',[solicitudId,r.farmacia_id,r.autorizado_por]);
            return {asignacionPendiente:false,destinatarios:await aviso(c,r.farmacia_id,solicitudId,'NUEVA_SOLICITUD','asignada')};
        },
        listar(farmaciaId,o) {return scoped(farmaciaId,false,async c=>{
            const values=[farmaciaId],where=filtro(o,values);
            const from=`FROM solicitudes s JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id JOIN usuarios u ON u.id=s.usuario_id WHERE ${AMBITO}`;
            const total=(await c.query(`SELECT count(*)::int AS n ${from}${where}`,values)).rows[0].n;
            const ids=(await c.query(`SELECT s.id ${from}${where} ORDER BY s.fecha,s.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,o.take,o.skip])).rows;
            const groups=(await c.query(`SELECT s.estado,count(*)::int AS n ${from} GROUP BY s.estado`,[farmaciaId])).rows;
            const count=Object.fromEntries(groups.map(g=>[g.estado,g.n]));
            const pedidos=[];for(const {id} of ids)pedidos.push(await pedido(c,farmaciaId,id));
            return {pedidos,resumen:{pendientes:count.APROBADA||0,preparando:count.PREPARANDO||0,listas:count.LISTA||0,entregadas:count.ENTREGADA||0},paginacion:{pagina:o.pagina,tamano:o.take,total,paginas:Math.ceil(total/o.take)}};
        });},
        detalle:(farmaciaId,id)=>scoped(farmaciaId,false,async c=>({pedido:await pedido(c,farmaciaId,id)})),
        avanzar(farmaciaId,id,input,{ requiereAutorizacionEps = false } = {}){return scoped(farmaciaId,true,async c=>{
            let p;
            if (!requiereAutorizacionEps) p=await pedido(c,farmaciaId,id,true);
            const {rows: autorizaciones} = await c.query(`
                SELECT a.estado, a.responsable_id, (
                    f.farmacia_id=$2 AND f.activa AND f.eps_id=a.eps_id AND
                    af.eps_id=a.eps_id AND af.afiliado_id=a.afiliado_id AND af.verificado_at IS NOT NULL AND
                    af.afiliado_id IN (SELECT jsonb_array_elements_text(current_setting('saludclick.afiliados')::jsonb))
                ) AS corresponde
                FROM eps_autorizaciones a
                JOIN solicitudes s ON s.id=a.solicitud_id
                LEFT JOIN eps_farmacias f ON f.id=a.farmacia_vinculo_id
                LEFT JOIN afiliado_cuentas_origen af ON af.usuario_id=s.usuario_id
                WHERE a.solicitud_id=$1
                FOR SHARE OF a`, [id,farmaciaId]);
            const autorizacion = autorizaciones.find(a => a.estado === 'APROBADA' && a.corresponde);
            if ((requiereAutorizacionEps || autorizaciones.length) && !autorizacion) {
                throw fallo(409,'AUTORIZACION_EPS_NO_VIGENTE','Se requiere una autorizacion EPS aprobada para esta farmacia.');
            }
            let asignada = false;
            if (requiereAutorizacionEps) {
                const {rows} = await c.query(`
                    INSERT INTO farmacia_asignaciones(solicitud_id,farmacia_id,asignado_por)
                    SELECT id,$2,$3 FROM solicitudes WHERE id=$1 AND estado='APROBADA'
                    ON CONFLICT(solicitud_id) DO NOTHING RETURNING solicitud_id`,
                    [id,farmaciaId,autorizacion.responsable_id]);
                asignada = rows.length > 0;
                p=await pedido(c,farmaciaId,id,true);
            }
            const huella=createHash('sha256').update(JSON.stringify({id,...input})).digest('hex');
            const old=(await c.query('SELECT * FROM farmacia_solicitud_eventos WHERE farmacia_id=$1 AND clave=$2',[farmaciaId,input.clave])).rows[0];
            if(old){if(old.huella!==huella)throw fallo(409,'CLAVE_REUTILIZADA');return {pedido:{id,estado:old.estado},repetido:true,destinatarios:[]};}
            if((input.version!==null&&p.version!==input.version)||p.estado!==input.estadoActual||p.operacion.siguienteEstado!==input.estado)throw fallo(409,'SOLICITUD_CONFLICTO','El estado o las condiciones cambiaron. Actualiza la solicitud.');
            const avisoStock=require('../config/farmacia-stock').habilitado()
                && await require('./farmacia-stock.repository').mover(c,farmaciaId,p,input);
            await c.query('UPDATE solicitudes SET estado=$2,updated_at=now() WHERE id=$1',[id,input.estado]);
            await c.query('UPDATE farmacia_asignaciones SET version=version+1 WHERE solicitud_id=$1',[id]);
            const cantidades=input.estado==='ENTREGADA'?p.detalles.map(d=>({medicamentoId:d.medicamento.id,nombre:d.medicamento.nombre,cantidad:d.cantidad})):[];
            await c.query(`INSERT INTO farmacia_solicitud_eventos(solicitud_id,farmacia_id,actor_id,estado_anterior,estado,clave,huella,recepcion,observaciones,cantidades)
              VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[id,farmaciaId,p.estado,input.estado,input.clave,huella,input.recepcion||null,input.observaciones||null,JSON.stringify(cantidades)]);
            // Stock propio solo tras activación explícita; stock global intacto.
            const avisoAsignacion=asignada ? await aviso(c,farmaciaId,id,'NUEVA_SOLICITUD','asignada') : [];
            const destinatarios=await aviso(c,farmaciaId,id,'SOLICITUD_ESTADO',`estado:${input.estado}`);
            return {pedido:{id,estado:input.estado},repetido:false,destinatarios:(avisoStock||avisoAsignacion.length)?[farmaciaId]:destinatarios};
        });},
        asignar(actorId,id,farmaciaId){return tx(actorId,1,true,async c=>{
            await sourceScope(c,farmaciaId);
            const valid=(await c.query(`SELECT s.id FROM solicitudes s JOIN usuarios u ON u.id=$2 AND u.rol_id=3 AND u.estado='ACTIVO'
              JOIN eps_farmacias ef ON ef.farmacia_id=u.id AND ef.activa=true
              JOIN eps_entidades ee ON ee.id=ef.eps_id AND ee.activa=true
              JOIN afiliado_cuentas_origen a ON a.usuario_id=s.usuario_id AND a.eps_id=ef.eps_id AND a.verificado_at IS NOT NULL
              WHERE s.id=$1
              AND a.afiliado_id IN (SELECT jsonb_array_elements_text(current_setting('saludclick.afiliados')::jsonb))
              AND (SELECT count(*) FROM eps_farmacias WHERE farmacia_id=u.id AND activa=true)=1 FOR UPDATE OF s`,[id,farmaciaId])).rows;
            if(valid.length!==1)throw fallo(403,'ASIGNACION_NO_AUTORIZADA');
            const result=await c.query(`INSERT INTO farmacia_asignaciones(solicitud_id,farmacia_id,asignado_por) VALUES($1,$2,$3)
              ON CONFLICT(solicitud_id) DO NOTHING RETURNING solicitud_id`,[id,farmaciaId,actorId]);
            if(!result.rows.length){const current=(await c.query('SELECT farmacia_id,activa FROM farmacia_asignaciones WHERE solicitud_id=$1',[id])).rows[0];if(current?.farmacia_id!==farmaciaId||!current.activa)throw fallo(409,'ASIGNACION_EXISTENTE');}
            return {solicitudId:id,farmaciaId,destinatarios:await aviso(c,farmaciaId,id,'NUEVA_SOLICITUD','asignada')};
        });},
        autorizarFormula(pacienteId,solicitudId,formulaId,permiteDescarga=false){
            return tx(pacienteId,2,true,c=>autorizarFormulaEn(c,pacienteId,solicitudId,formulaId,permiteDescarga));
        },
        formula(farmaciaId,solicitudId,formulaId){return scoped(farmaciaId,false,async c=>{
            await pedido(c,farmaciaId,solicitudId);
            const {rows}=await c.query(`SELECT f.nombre_archivo,f.nombre_original,f.tipo_mime,f.tamano,g.permite_descarga
              FROM farmacia_formulas_autorizadas g JOIN formulas_medicas f ON f.id=g.formula_id
              JOIN solicitudes s ON s.id=g.solicitud_id AND s.usuario_id=f.usuario_id AND g.autorizado_por=s.usuario_id
              WHERE g.solicitud_id=$1 AND g.formula_id=$2 AND g.activa=true AND f.estado<>'ELIMINADA'`,[solicitudId,formulaId]);
            if(!rows[0])throw fallo(404,'FORMULA_NO_DISPONIBLE');return rows[0];
        });},
        estadisticas(farmaciaId,{desde,hasta}){return scoped(farmaciaId,false,async c=>{
            const base=`FROM solicitudes s JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id WHERE ${AMBITO}`;
            const intervalo=`e.created_at >= $2::date AND e.created_at < ($3::date+interval '1 day')`;
            const eventosPeriodo=`FROM farmacia_solicitud_eventos e JOIN solicitudes s ON s.id=e.solicitud_id JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id WHERE ${AMBITO} AND e.farmacia_id=$1 AND ${intervalo}`;
            const completadas=`${eventosPeriodo} AND e.estado='ENTREGADA'`;
            const summary=(await c.query(`SELECT
              count(DISTINCT s.usuario_id) FILTER (WHERE e.estado='ENTREGADA')::int AS pacientes,
              count(*) FILTER (WHERE e.estado='ENTREGADA')::int AS completadas,
              count(DISTINCT s.id) FILTER (WHERE e.estado='LISTA')::int AS preparadas
              ${eventosPeriodo}`,[farmaciaId,desde,hasta])).rows[0];
            const unidades=(await c.query(`SELECT coalesce(sum((item->>'cantidad')::int),0)::int AS n FROM farmacia_solicitud_eventos e JOIN solicitudes s ON s.id=e.solicitud_id JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id CROSS JOIN LATERAL jsonb_array_elements(e.cantidades) item WHERE ${AMBITO} AND e.farmacia_id=$1 AND e.estado='ENTREGADA' AND ${intervalo}`,[farmaciaId,desde,hasta])).rows[0].n;
            const period=` AND s.fecha >= $2::date AND s.fecha < ($3::date+interval '1 day')`;
            const estados=(await c.query(`SELECT s.estado,count(*)::int AS total ${base}${period} GROUP BY s.estado ORDER BY s.estado`,[farmaciaId,desde,hasta])).rows;
            const meses=(await c.query(`SELECT to_char(s.fecha,'YYYY-MM') AS mes,count(*)::int AS total ${base}${period} GROUP BY 1 ORDER BY 1`,[farmaciaId,desde,hasta])).rows;
            const evolucion=(await c.query(`SELECT to_char(s.fecha,'YYYY-MM') AS mes,count(*)::int AS total ${base}
              AND s.fecha >= date_trunc('month',$2::date::timestamp) - interval '11 months'
              AND s.fecha < ($2::date + interval '1 day') GROUP BY 1 ORDER BY 1`,[farmaciaId,hasta])).rows;
            const pendientesMes=(await c.query(`SELECT to_char(s.fecha,'YYYY-MM') AS mes,count(*)::int AS total ${base}${period} AND s.estado IN ('PENDIENTE','APROBADA','PREPARANDO','LISTA') GROUP BY 1 ORDER BY 1`,[farmaciaId,desde,hasta])).rows;
            const completadasMes=(await c.query(`SELECT to_char(e.created_at,'YYYY-MM') AS mes,count(*)::int AS total ${completadas} GROUP BY 1 ORDER BY 1`,[farmaciaId,desde,hasta])).rows;
            let existencias=null,alertasStock=[],destacados=null;
            if(require('../config/farmacia-stock').habilitado()){
                existencias=await require('./farmacia-stock.repository').resumen(c,farmaciaId);
                destacados=(await c.query(`SELECT m.id,m.nombre,m.estado,x.cantidad::int AS stock,
                  (x.cantidad-x.reservado)::int AS disponibles
                  FROM farmacia_existencias x JOIN medicamentos m ON m.id=x.medicamento_id
                  WHERE x.farmacia_id=$1
                  ORDER BY (m.estado IS NOT NULL AND m.estado<>'INACTIVO') DESC,
                  x.cantidad-x.reservado DESC,m.nombre,m.id LIMIT 8`,[farmaciaId])).rows;
                alertasStock=(await c.query(`SELECT m.id,m.nombre,m.presentacion,(x.cantidad-x.reservado)::int AS disponibles FROM farmacia_existencias x JOIN medicamentos m ON m.id=x.medicamento_id WHERE x.farmacia_id=$1 AND m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad-x.reservado BETWEEN 1 AND 5 ORDER BY disponibles,m.nombre,m.id LIMIT 10`,[farmaciaId])).rows;
            }
            const pacientes=(await c.query(`SELECT to_char(e.created_at,'YYYY-MM') AS mes,count(DISTINCT s.usuario_id)::int AS total ${completadas} GROUP BY 1 ORDER BY 1`,[farmaciaId,desde,hasta])).rows;
            const medicamentos=(await c.query(`SELECT m.id,m.nombre,sum(d.cantidad)::int AS total FROM detalle_solicitud d JOIN medicamentos m ON m.id=d.medicamento_id JOIN solicitudes s ON s.id=d.solicitud_id JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id WHERE ${AMBITO}${period} GROUP BY m.id,m.nombre ORDER BY total DESC,m.id LIMIT 10`,[farmaciaId,desde,hasta])).rows;
            const actividad=(await c.query(`SELECT s.id,s.estado,s.fecha,concat_ws(' ',u.nombre,u.apellido) AS paciente FROM solicitudes s JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id JOIN usuarios u ON u.id=s.usuario_id WHERE ${AMBITO}${period} ORDER BY s.fecha DESC,s.id DESC LIMIT 8`,[farmaciaId,desde,hasta])).rows;
            const anteriores=(await c.query(`SELECT count(*)::int AS n ${base} AND s.fecha>=($2::date-(($3::date-$2::date)+1)) AND s.fecha<$2::date`,[farmaciaId,desde,hasta])).rows[0].n;
            const recibidas=estados.reduce((n,g)=>n+g.total,0);
            const tendencia=anteriores>0?{metrica:'SOLICITUDES_RECIBIDAS',actual:recibidas,anterior:anteriores,variacionPorcentual:Math.round((recibidas/anteriores-1)*1000)/10}:null;
            return {periodo:{desde,hasta},indicadores:{solicitudesRecibidas:recibidas,pacientesAtendidos:summary.pacientes,solicitudesPendientes:estados.filter(g=>['PENDIENTE','APROBADA','PREPARANDO','LISTA'].includes(g.estado)).reduce((n,g)=>n+g.total,0),solicitudesPreparadas:summary.preparadas,solicitudesCompletadas:summary.completadas,medicamentosEntregados:unidades,medicamentosDisponibles:existencias?.disponibles??null},graficos:{evolucion,meses,pendientesMes,completadasMes,estados,pacientes,medicamentos},actividad,existencias,alertasStock,destacados,alcance:'ASIGNACIONES_VERIFICADAS',tendencia};
        });}
    };
}
module.exports={createRepository,AMBITO};
