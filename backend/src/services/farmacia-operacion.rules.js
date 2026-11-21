const {SIGUIENTE}=require('../config/farmacia-solicitudes');
function operacion(pedido) {
    const bloqueos=[];
    if(!pedido.pagos.some(p=>p.estado==='APROBADO'&&p.simulacion===false))bloqueos.push('PAGO_REAL_NO_APROBADO');
    if(!pedido.detalles.length)bloqueos.push('SIN_MEDICAMENTOS');
    if(pedido.detalles.some(d=>d.medicamento.requiere_formula===true))bloqueos.push('VALIDACION_FARMACEUTICA_PENDIENTE');
    if(pedido.detalles.some(d=>![true,false].includes(d.medicamento.requiere_formula)))bloqueos.push('REQUISITO_FORMULA_DESCONOCIDO');
    return {bloqueos,siguienteEstado:bloqueos.length?null:SIGUIENTE[pedido.estado]||null};
}
module.exports={operacion};
