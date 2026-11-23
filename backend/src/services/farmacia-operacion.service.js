const {formulasDisponibles}=require('./farmacia-formula-archivo.service');
async function conArchivos(pedido) {
    const formulas = await formulasDisponibles(pedido.formulas);
    return {
        ...pedido, formulas,
        ...(!formulas.length && {
            motivoFormula: pedido.formulas.length
                ? 'El archivo original autorizado no está disponible en el almacenamiento privado.'
                : 'No hay una fórmula adjunta con autorización de consulta para esta solicitud.'
        })
    };
}
const v=require('../validators/farmacia-operacion.validator');
const {disponible}=require('../config/farmacia-operacion');
function createService(repo=require('../repositories/farmacia-operacion.repository').createRepository(),catalogo=require('../repositories/farmacia-catalogo.repository').createCatalogoRepository(),available=disponible,catalogoDisponible=available===disponible?require('../config/farmacia-catalogo').disponible:available) {
    const solicitudesDisponibles=available===disponible?require('../config/farmacia-solicitudes').disponibles:available;
    return {
        identidad(user,farmaciaId,usuarioId,q,body){v.objeto(q,[]);v.objeto(body,['afiliadoId']);farmaciaId=v.entero(farmaciaId);usuarioId=v.entero(usuarioId);const afiliadoId=v.texto(body.afiliadoId,256,true);solicitudesDisponibles();return repo.vincularIdentidad(user.id,farmaciaId,usuarioId,afiliadoId);},
        autorizarCatalogo(user,id,q,body){v.objeto(q,[]);v.objeto(body,['puedeCrear','medicamentos']);id=v.entero(id);if(typeof body.puedeCrear!=='boolean'||!Array.isArray(body.medicamentos)||body.medicamentos.length>100)throw require('../config/farmacia-operacion').fallo(400,'PERMISOS_INVALIDOS');const ids=body.medicamentos.map(v.entero);if(new Set(ids).size!==ids.length)throw require('../config/farmacia-operacion').fallo(400,'PERMISOS_DUPLICADOS');catalogoDisponible();return catalogo.autorizar(user.id,id,{puedeCrear:body.puedeCrear,medicamentos:ids});},
        ruta(user,epsId,q,body){v.objeto(q,[]);v.objeto(body,['farmaciaId']);epsId=v.texto(epsId,80,true);const farmaciaId=v.entero(body.farmaciaId);solicitudesDisponibles();return repo.configurarRuta(user.id,epsId,farmaciaId);},
        async listar(user,q){
            const options=v.listado(q);solicitudesDisponibles();
            const result=await repo.listar(user.id,options);
            return {...result,pedidos:await Promise.all(result.pedidos.map(conArchivos))};
        },
        async detalle(user,id,q){
            v.objeto(q,[]);id=v.entero(id);solicitudesDisponibles();
            const {pedido}=await repo.detalle(user.id,id);
            return {pedido:await conArchivos(pedido)};
        },
        async avanzar(user,id,q,body,notify){v.objeto(q,[]);id=v.entero(id);const input=v.transicion(body);solicitudesDisponibles();const result=await repo.avanzar(user.id,id,input);if(result.destinatarios.length&&notify)try{await notify(result.destinatarios);}catch{}const {destinatarios,...data}=result;return data;},
        async asignar(user,id,q,body,notify){v.objeto(q,[]);v.objeto(body,['farmaciaId']);const pharmacy=v.entero(body.farmaciaId);id=v.entero(id);solicitudesDisponibles();const result=await repo.asignar(user.id,id,pharmacy);if(result.destinatarios.length&&notify)try{await notify(result.destinatarios);}catch{}return {solicitudId:id,farmaciaId:pharmacy};},
        estadisticas(user,q){const period=v.periodo(q);available();return repo.estadisticas(user.id,period);},
        permisos(user,q){v.objeto(q,[]);catalogoDisponible();return catalogo.permisos(user.id);},
        guardar(user,id,q,body){v.objeto(q,[]);const input=v.medicamento(body,!!id);if(id)id=v.entero(id);catalogoDisponible();return catalogo.guardar(user.id,input,id);},
        retirar(user,id,q,body){
            v.objeto(q,[]);
            v.objeto(body,['version']);
            const version=v.entero(body.version);
            const medicamentoId=v.entero(id);
            catalogoDisponible();
            return catalogo.retirar(user.id,medicamentoId,version);
        },
        formula(user,id,formulaId,q){v.objeto(q,['descarga']);if(q.descarga!==undefined&&q.descarga!=='1')throw require('../config/farmacia-operacion').fallo(400,'DESCARGA_INVALIDA');id=v.entero(id);formulaId=v.entero(formulaId);solicitudesDisponibles();return repo.formula(user.id,id,formulaId);},
        vincularFormula(user,id,formulaId,q,body){v.objeto(q,[]);v.objeto(body||{},['permiteDescarga']);if(body?.permiteDescarga!==undefined&&typeof body.permiteDescarga!=='boolean')throw require('../config/farmacia-operacion').fallo(400,'CONSENTIMIENTO_INVALIDO');id=v.entero(id);formulaId=v.entero(formulaId);solicitudesDisponibles();return repo.autorizarFormula(user.id,id,formulaId,body?.permiteDescarga===true);}
    };
}
module.exports={createService};
