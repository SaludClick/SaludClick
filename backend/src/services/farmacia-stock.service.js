const config=require('../config/farmacia-stock');
const validator=require('../validators/farmacia-existencias.validator');
const v=require('../validators/farmacia-operacion.validator');
const {presentar}=require('./farmacia-existencias.service');
const {ingreso}=require('../validators/farmacia-stock-ingreso.validator');
function createService(repo=require('../repositories/farmacia-stock.repository').createRepository(),available=config.disponible){
    return {
        async listar(user,q){const o=validator.listado(q);available();const r=await repo.listar(user.id,o);return {...r,medicamentos:r.medicamentos.map(presentar)};},
        async detalle(user,id,q){validator.sinQuery(q);id=validator.id(id);available();const r=await repo.detalle(user.id,id);return {medicamento:presentar(r.medicamento)};},
        async exportar(user,q){const o=validator.listado(q);available();const r=await repo.listar(user.id,o,true);return require('./farmacia-excel.service').generar(r.medicamentos,new Date(),o,{tipo:'FARMACIA_PROPIA',farmaciaId:user.id});},
        movimientoManual(user,id,q,body){
            v.objeto(q,[]);
            v.objeto(body,['tipo','medicamentoId','cantidad','clave','referencia','motivo']);
            const {tipo,medicamentoId,cantidad,clave,referencia,motivo}=body;
            if(!['SALIDA','AJUSTE_MAS','AJUSTE_MENOS'].includes(tipo))throw require('../config/farmacia-operacion').fallo(400,'MOVIMIENTO_INVALIDO');
            const validado=ingreso({clave,referencia,items:[{medicamentoId,cantidad}]});
            const input={tipo,...validado.items[0],clave:validado.clave,referencia:validado.referencia,motivo:v.texto(motivo,500,true)};
            id=v.entero(id);
            available();
            return repo.movimientoManual(user.id,id,input);
        },
        ingresar(user,id,q,body){v.objeto(q,[]);id=v.entero(id);const input=ingreso(body);available();return repo.ingresar(user.id,id,input);}
    };
}
module.exports={createService,ingreso};
