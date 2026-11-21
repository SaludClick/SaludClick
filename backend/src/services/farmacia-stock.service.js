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
        ingresar(user,id,q,body){v.objeto(q,[]);id=v.entero(id);const input=ingreso(body);available();return repo.ingresar(user.id,id,input);}
    };
}
module.exports={createService,ingreso};
