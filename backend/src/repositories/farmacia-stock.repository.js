const {registrarStock}=require('./farmacia-notificacion-eventos.repository');
const {createHash}=require('node:crypto');
const {fallo}=require('../config/farmacia-operacion');
const {UMBRAL_BAJO}=require('../config/farmacia-inventario');
const stockFields=`id,nombre,COALESCE((to_jsonb(m)->>'stock_minimo')::int,0) AS stock_minimo`;
const columns=`m.id,m.nombre,m.descripcion,m.presentacion,m.codigo_fuente,m.imagen,m.requiere_formula,
 (x.cantidad-x.reservado)::int AS stock,x.cantidad AS fisico,x.reservado,
 CASE WHEN m.estado IS NULL THEN NULL WHEN m.estado='INACTIVO' THEN 'INACTIVO' WHEN x.cantidad-x.reservado=0 THEN 'AGOTADO' ELSE 'DISPONIBLE' END AS estado,
 coalesce((SELECT sum(e.cantidad)::int FROM farmacia_stock_eventos e WHERE e.farmacia_id=x.farmacia_id AND e.medicamento_id=m.id AND e.tipo='ENTREGA'),0)::int AS entregados`;
function filtro(o,values){
    const add=value=>{values.push(value);return `$${values.length}`;};
    let sql='';
    if(o.buscar)sql+=` AND strpos(lower(concat_ws(' ',m.nombre,m.descripcion,m.presentacion,m.codigo_fuente)),lower(${add(o.buscar)}))>0`;
    if(o.formula!=='todas')sql+=o.formula==='desconocido'?' AND m.requiere_formula IS NULL':` AND m.requiere_formula=${add(o.formula==='requiere')}`;
    const filters={disponibles:"m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad>x.reservado",bajos:`m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad-x.reservado BETWEEN 1 AND ${UMBRAL_BAJO}`,agotados:"m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad=x.reservado",inactivos:"m.estado='INACTIVO'",inconsistentes:'false',desconocidos:'m.estado IS NULL'};
    if(o.disponibilidad!=='todas')sql+=` AND (${filters[o.disponibilidad]})`;
    return sql;
}
async function resumen(c,id){
    const {rows}=await c.query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad>x.reservado)::int AS disponibles,
      count(*) FILTER(WHERE m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad=x.reservado)::int AS agotados,
      count(*) FILTER(WHERE m.estado='INACTIVO')::int AS inactivos,
      count(*) FILTER(WHERE m.estado IS NULL)::int AS desconocidos,
      count(*) FILTER(WHERE m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad-x.reservado BETWEEN 1 AND $2)::int AS bajos,
      coalesce(sum(x.cantidad-x.reservado) FILTER(WHERE m.estado IS NOT NULL AND m.estado<>'INACTIVO'),0)::int AS unidades
      FROM farmacia_existencias x JOIN medicamentos m ON m.id=x.medicamento_id WHERE x.farmacia_id=$1`,[id,UMBRAL_BAJO]);
    return {...rows[0],inconsistentes:0};
}
// Dentro de la misma transacción serializable de la solicitud. Orden estable de
// bloqueos y agrupación de renglones repetidos; nunca modifica medicamentos.stock.
async function mover(c,farmaciaId,pedido,input){
    if(!['PREPARANDO','ENTREGADA'].includes(input.estado))return;
    let notificada=false;
    const items=new Map();for(const d of pedido.detalles)items.set(d.medicamento.id,(items.get(d.medicamento.id)||0)+d.cantidad);
    for(const [medicamentoId,cantidad] of [...items].sort((a,b)=>a[0]-b[0])){
        if(!Number.isSafeInteger(cantidad)||cantidad<1||cantidad>2147483647)throw fallo(409,'CANTIDADES_INVALIDAS');
        const row=(await c.query('SELECT cantidad,reservado FROM farmacia_existencias WHERE farmacia_id=$1 AND medicamento_id=$2 FOR UPDATE',[farmaciaId,medicamentoId])).rows[0];
        if(!row)throw fallo(409,'STOCK_PROPIO_NO_ACREDITADO','No existen existencias acreditadas para todos los medicamentos.');
        const entrega=input.estado==='ENTREGADA';
        if(entrega){
            const reserva=(await c.query("SELECT cantidad FROM farmacia_stock_eventos WHERE farmacia_id=$1 AND solicitud_id=$2 AND medicamento_id=$3 AND tipo='RESERVA'",[farmaciaId,pedido.id,medicamentoId])).rows[0];
            if(reserva?.cantidad!==cantidad||row.reservado<cantidad)throw fallo(409,'RESERVA_NO_VERIFICADA','La reserva no coincide con los medicamentos de la solicitud.');
        }else if(row.cantidad-row.reservado<cantidad)throw fallo(409,'STOCK_PROPIO_INSUFICIENTE','No hay unidades libres suficientes para preparar esta solicitud.');
        await c.query(entrega?'UPDATE farmacia_existencias SET cantidad=cantidad-$3,reservado=reservado-$3,updated_at=now() WHERE farmacia_id=$1 AND medicamento_id=$2':'UPDATE farmacia_existencias SET reservado=reservado+$3,updated_at=now() WHERE farmacia_id=$1 AND medicamento_id=$2',[farmaciaId,medicamentoId,cantidad]);
        const huella=createHash('sha256').update(JSON.stringify({id:pedido.id,...input})).digest('hex');
        const {rows:[event]}=await c.query(`INSERT INTO farmacia_stock_eventos(farmacia_id,medicamento_id,solicitud_id,actor_id,tipo,cantidad,clave,huella,referencia)
          VALUES($1,$2,$3,$1,$4,$5,$6,$7,$8) RETURNING id`,[farmaciaId,medicamentoId,pedido.id,entrega?'ENTREGA':'RESERVA',cantidad,input.clave,huella,`Solicitud #${pedido.id}`]);
        if(!entrega){
            const {rows:[med]}=await c.query(`SELECT ${stockFields} FROM medicamentos m WHERE id=$1`,[medicamentoId]);
            const stock=row.cantidad-row.reservado;
            if(await registrarStock(c,farmaciaId,'inventario',event.id,{...med,stock},{...med,stock:stock-cantidad}))notificada=true;
        }
    }
    return notificada;
}
function createRepository(db,origen){
    const {tx,scoped}=require('./farmacia-operacion.repository').createRepository(db,undefined,origen);
    return {
        listar(id,o,exportar=false){return scoped(id,false,async c=>{
            const values=[id],where=filtro(o,values),from=`FROM farmacia_existencias x JOIN medicamentos m ON m.id=x.medicamento_id WHERE x.farmacia_id=$1${where}`;
            const total=(await c.query(`SELECT count(*)::int AS n ${from}`,values)).rows[0].n;
            if(exportar&&total>50000)throw fallo(413,'REPORTE_DEMASIADO_GRANDE','Reduce los filtros: el reporte admite hasta 50.000 registros.');
            const limit=exportar?50000:o.take,offset=exportar?0:o.skip;
            const medicamentos=(await c.query(`SELECT ${columns} ${from} ORDER BY m.nombre,m.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,offset])).rows;
            return {medicamentos,resumen:await resumen(c,id),paginacion:{pagina:o.pagina,tamano:o.take,total,paginas:Math.ceil(total/o.take)},alcance:{tipo:'FARMACIA_PROPIA',titularidadVerificada:true,movimientosHabilitados:false,umbralOrientativo:UMBRAL_BAJO}};
        });},
        detalle(id,medicamentoId){return scoped(id,false,async c=>{const medicamento=(await c.query(`SELECT ${columns} FROM farmacia_existencias x JOIN medicamentos m ON m.id=x.medicamento_id WHERE x.farmacia_id=$1 AND m.id=$2`,[id,medicamentoId])).rows[0];if(!medicamento)throw fallo(404,'EXISTENCIAS_NO_DISPONIBLES');return {medicamento};});},
        ingresar(actorId,farmaciaId,input){return tx(actorId,1,true,async c=>{
            const f=(await c.query("SELECT id FROM usuarios WHERE id=$1 AND rol_id=3 AND estado='ACTIVO' FOR SHARE",[farmaciaId])).rows[0];
            if(!f)throw fallo(403,'FARMACIA_NO_VIGENTE');
            const huella=createHash('sha256').update(JSON.stringify({farmaciaId,...input})).digest('hex');
            // Serializa reintentos de la misma clave incluso si aún no hay saldo.
            await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${farmaciaId}:${input.clave}`]);
            const old=(await c.query('SELECT huella FROM farmacia_stock_eventos WHERE farmacia_id=$1 AND clave=$2',[farmaciaId,input.clave])).rows;
            if(old.length){if(old.some(e=>e.huella!==huella))throw fallo(409,'CLAVE_REUTILIZADA');return {repetido:true};}
            await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${farmaciaId}:referencia:${input.referencia.trim().toLowerCase()}`]);
            const receipt=await c.query("SELECT id FROM farmacia_stock_eventos WHERE farmacia_id=$1 AND tipo='INGRESO' AND lower(btrim(referencia))=lower(btrim($2)) LIMIT 1",[farmaciaId,input.referencia]);
            if(receipt.rows.length)throw fallo(409,'INGRESO_REFERENCIA_EXISTENTE','La recepción documental ya fue registrada. Reutiliza la clave y el cuerpo originales para reintentar.');
            let notificada=false;
            for(const item of input.items){
                const {rows:[med]}=await c.query(`SELECT ${stockFields} FROM medicamentos m WHERE id=$1 FOR SHARE`,[item.medicamentoId]);
                if(!med)throw fallo(404,'MEDICAMENTO_NO_ENCONTRADO');
                const {rows:[saldo]}=await c.query(`INSERT INTO farmacia_existencias(farmacia_id,medicamento_id,cantidad) VALUES($1,$2,$3)
                  ON CONFLICT(farmacia_id,medicamento_id) DO UPDATE SET cantidad=farmacia_existencias.cantidad+$3,updated_at=now()
                  RETURNING (cantidad-reservado)::int AS stock`,[farmaciaId,item.medicamentoId,item.cantidad]);
                const {rows:[event]}=await c.query(`INSERT INTO farmacia_stock_eventos(farmacia_id,medicamento_id,actor_id,tipo,cantidad,clave,huella,referencia) VALUES($1,$2,$3,'INGRESO',$4,$5,$6,$7) RETURNING id`,[farmaciaId,item.medicamentoId,actorId,item.cantidad,input.clave,huella,input.referencia]);
                const anterior={...med,stock:saldo.stock-item.cantidad};
                if(await registrarStock(c,farmaciaId,'inventario',event.id,anterior,{...med,stock:saldo.stock}))notificada=true;
            }
            return {repetido:false,...(notificada?{destinatarios:[farmaciaId]}:{})};
        });}
    };
}
module.exports={createRepository,mover,resumen};
