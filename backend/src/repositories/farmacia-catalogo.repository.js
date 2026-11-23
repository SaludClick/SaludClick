const {registrarStock}=require('./farmacia-notificacion-eventos.repository');
const {fallo}=require('../config/farmacia-operacion');
const {createRepository}=require('./farmacia-operacion.repository');
const fotos = require('../services/farmacia-foto.service');
function createCatalogoRepository(db) {
    const {tx}=createRepository(db);
    async function permiso(c,id) {
        const p=(await c.query('SELECT * FROM farmacia_catalogo_autorizaciones WHERE farmacia_id=$1 AND activa=true FOR SHARE',[id])).rows[0];
        if(!p)throw fallo(403,'CATALOGO_NO_AUTORIZADO','No tienes autorización vigente para gestionar medicamentos.');return p;
    }
    async function verificarEdicion(c,farmaciaId,medicamentoId,version) {
        const scope=(await c.query('SELECT version FROM farmacia_catalogo_ambitos WHERE farmacia_id=$1 AND medicamento_id=$2 AND activa=true FOR UPDATE',[farmaciaId,medicamentoId])).rows[0];
        if(!scope)throw fallo(404,'MEDICAMENTO_NO_AUTORIZADO','No tienes permiso para gestionar ese medicamento.');
        if(scope.version!==version)throw fallo(409,'CATALOGO_CONFLICTO','El medicamento cambió. Vuelve a cargarlo antes de editar.');
    }
    return {
        autorizar(actorId,farmaciaId,input){return tx(actorId,1,true,async c=>{
            const pharmacy=(await c.query("SELECT id FROM usuarios WHERE id=$1 AND rol_id=3 AND estado='ACTIVO' FOR SHARE",[farmaciaId])).rows[0];
            if(!pharmacy)throw fallo(403,'FARMACIA_NO_VIGENTE');
            await c.query(`INSERT INTO farmacia_catalogo_autorizaciones(farmacia_id,autorizado_por,puede_crear,activa) VALUES($1,$2,$3,true)
              ON CONFLICT(farmacia_id) DO UPDATE SET autorizado_por=$2,puede_crear=$3,activa=true`,[farmaciaId,actorId,input.puedeCrear]);
            // PUT representa el conjunto completo vigente, no permisos acumulativos.
            // Revocar incrementa la versión y conserva el ámbito y su historial.
            await c.query(`UPDATE farmacia_catalogo_ambitos SET activa=false,version=version+1
              WHERE farmacia_id=$1 AND activa=true AND NOT(medicamento_id=ANY($2::int[]))`,[farmaciaId,input.medicamentos]);
            for(const id of input.medicamentos){
                if(!(await c.query('SELECT id FROM medicamentos WHERE id=$1 FOR SHARE',[id])).rows.length)throw fallo(404,'MEDICAMENTO_NO_ENCONTRADO');
                const old=(await c.query('SELECT farmacia_id FROM farmacia_catalogo_ambitos WHERE medicamento_id=$1 FOR UPDATE',[id])).rows[0];
                if(old&&old.farmacia_id!==farmaciaId)throw fallo(409,'MEDICAMENTO_OTRA_FARMACIA');
                await c.query(`INSERT INTO farmacia_catalogo_ambitos(medicamento_id,farmacia_id,autorizado_por) VALUES($1,$2,$3)
                  ON CONFLICT(medicamento_id) DO UPDATE SET activa=true,autorizado_por=$3,version=farmacia_catalogo_ambitos.version+1`,[id,farmaciaId,actorId]);
            }
            await c.query(`INSERT INTO farmacia_autorizacion_eventos(actor_id,farmacia_id,tipo,detalle) VALUES($1,$2,'CATALOGO',$3::jsonb)`,[actorId,farmaciaId,JSON.stringify(input)]);
            return {autorizada:true,farmaciaId};
        });},
        permisos(id){return tx(id,3,false,async c=>{
            const p=(await c.query('SELECT puede_crear FROM farmacia_catalogo_autorizaciones WHERE farmacia_id=$1 AND activa=true',[id])).rows[0];
            const ambitos=p?(await c.query('SELECT medicamento_id,version FROM farmacia_catalogo_ambitos WHERE farmacia_id=$1 AND activa=true',[id])).rows:[];
            const categorias=(await c.query('SELECT id,nombre FROM categorias ORDER BY nombre,id')).rows;
            return {puedeCrear:p?.puede_crear===true,ambitos,categorias};
        });},
        guardar(actorId,input,id=null){return tx(actorId,3,true,async c=>{
            const p=await permiso(c,actorId);
            if(!id&&!p.puede_crear)throw fallo(403,'CATALOGO_ALTA_NO_AUTORIZADA');
            if(id)await verificarEdicion(c,actorId,id,input.version);
            if(!(await c.query('SELECT id FROM categorias WHERE id=$1',[input.categoria_id])).rows.length)throw fallo(400,'CATEGORIA_INVALIDA');
            const actual=id?(await c.query(`SELECT imagen,stock,presentacion,COALESCE((to_jsonb(m)->>'stock_minimo')::int,0) AS stock_minimo FROM medicamentos m WHERE id=$1 FOR UPDATE`,[id])).rows[0]:null;
            if(input.presentacion===null&&actual?.presentacion!==null){
                throw fallo(400,'PRESENTACION_REQUERIDA','Indica la presentación del medicamento.');
            }
            // Serializa altas y cambios con la misma identidad normalizada.
            await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${input.nombre.toLowerCase()}|${(input.presentacion ?? '').toLowerCase()}`]);
            const dup=await c.query(`SELECT id FROM medicamentos WHERE lower(btrim(nombre))=lower($1) AND lower(btrim(coalesce(presentacion,'')))=lower($2) AND ($3::integer IS NULL OR id<>$3) LIMIT 1`,[input.nombre,input.presentacion ?? '',id]);
            if(dup.rows.length)throw fallo(409,'MEDICAMENTO_DUPLICADO','Ya existe un medicamento con ese nombre y presentación.');
            if(Object.hasOwn(input,'stock')){
                if(require('../config/farmacia-stock').habilitado())throw fallo(409,'STOCK_GESTIONADO_EN_INVENTARIO','La cantidad se gestiona desde Inventario propio.');
                if(actual&&input.stockEsperado!==actual.stock)throw fallo(409,'CATALOGO_STOCK_CONFLICTO','Las existencias cambiaron. Vuelve a abrir el medicamento antes de actualizar la cantidad.');
            }
            const stock=input.stock??actual?.stock??0;
            const estado=input.estado==='DISPONIBLE'||input.estado==='AGOTADO'&&Object.hasOwn(input,'stock')
                ? (stock===0?'AGOTADO':'DISPONIBLE') : input.estado;
            const cambiarImagen=Object.hasOwn(input,'imagen')||Object.hasOwn(input,'foto');
            const imagen=Object.hasOwn(input,'foto') ? await fotos.guardar(c,await fotos.normalizar(input.foto)) : input.imagen??null;
            const tieneMinimo=Object.hasOwn(input,'stock_minimo');
            const values=[input.nombre,input.descripcion,input.presentacion,imagen,input.categoria_id,input.precio??null,estado,stock];
            const returning=`RETURNING id,nombre,descripcion,presentacion,imagen,stock,estado,categoria_id,precio,
                COALESCE((to_jsonb(m)->>'stock_minimo')::int,0) AS stock_minimo`;
            let med;
            if(id){
                med=(await c.query(`UPDATE medicamentos m SET nombre=$1,descripcion=$2,presentacion=$3,
                    imagen=CASE WHEN $10 THEN $4 ELSE imagen END,categoria_id=$5,precio=COALESCE($6,precio),
                    estado=$7,stock=$8,updated_at=now() ${tieneMinimo?',stock_minimo=$11':''} WHERE id=$9 ${returning}`,
                [...values,id,cambiarImagen,...(tieneMinimo?[input.stock_minimo]:[])])).rows[0];
                if(cambiarImagen&&actual?.imagen)await fotos.retirarReemplazada(c,actual.imagen);
                await c.query('UPDATE farmacia_catalogo_ambitos SET version=version+1 WHERE medicamento_id=$1',[id]);
            }else{
                med=(await c.query(`INSERT INTO medicamentos AS m
                    (nombre,descripcion,presentacion,imagen,categoria_id,precio,estado,stock${tieneMinimo?',stock_minimo':''})
                    VALUES($1,$2,$3,$4,$5,COALESCE($6::numeric,0),$7,$8${tieneMinimo?',$9':''}) ${returning}`,
                [...values,...(tieneMinimo?[input.stock_minimo]:[])])).rows[0];
                await c.query('INSERT INTO farmacia_catalogo_ambitos(medicamento_id,farmacia_id,autorizado_por) VALUES($1,$2,$3)',[med.id,actorId,p.autorizado_por]);
            }
            await c.query(`INSERT INTO farmacia_catalogo_auditoria(farmacia_id,medicamento_id,accion,campos) VALUES($1,$2,$3,$4)`,[actorId,med.id,id?'EDITAR':'CREAR',Object.keys(input).filter(k=>k!=='version'&&k!=='stockEsperado')]);
            const notificada=id && await registrarStock(c,actorId,'catalogo',input.version+1,actual,med);
            return {medicamento:med,...(notificada?{destinatarios:[actorId]}:{})};
        }).catch(error=>{
            if(error.code==='42703'&&Object.hasOwn(input,'stock_minimo'))throw fallo(503,'STOCK_MINIMO_PENDIENTE','El stock mínimo requiere activar la migración del catálogo.');
            throw error;
        });},
        retirar(actorId,id,version){return tx(actorId,3,true,async c=>{
            await permiso(c,actorId);
            await verificarEdicion(c,actorId,id,version);
            const {rows}=await c.query(`UPDATE medicamentos SET estado='INACTIVO',updated_at=now()
              WHERE id=$1 AND estado IS DISTINCT FROM 'INACTIVO' RETURNING id,estado`,[id]);
            if(!rows.length)return {medicamento:{id,estado:'INACTIVO'}};
            await c.query('UPDATE farmacia_catalogo_ambitos SET version=version+1 WHERE medicamento_id=$1',[id]);
            await c.query(`INSERT INTO farmacia_catalogo_auditoria(farmacia_id,medicamento_id,accion,campos)
              VALUES($1,$2,'EDITAR',ARRAY['estado'])`,[actorId,id]);
            return {medicamento:rows[0]};
        });}
    };
}
module.exports={createCatalogoRepository};
