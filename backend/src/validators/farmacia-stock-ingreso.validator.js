const v=require('./farmacia-operacion.validator');
function ingreso(body){
    v.objeto(body,['clave','referencia','items']);
    if(typeof body.clave!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.clave)||!Array.isArray(body.items)||!body.items.length||body.items.length>100)throw require('../config/farmacia-operacion').fallo(400,'INGRESO_INVALIDO');
    const items=body.items.map(item=>{v.objeto(item,['medicamentoId','cantidad']);return {medicamentoId:v.entero(item.medicamentoId),cantidad:v.entero(item.cantidad)};}).sort((a,b)=>a.medicamentoId-b.medicamentoId);
    if(new Set(items.map(i=>i.medicamentoId)).size!==items.length)throw require('../config/farmacia-operacion').fallo(400,'MEDICAMENTO_REPETIDO');
    return {clave:body.clave.toLowerCase(),referencia:v.texto(body.referencia,200,true),items};
}
module.exports={ingreso};
