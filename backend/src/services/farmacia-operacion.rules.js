const { SIGUIENTE } = require('../config/farmacia-solicitudes');
const { habilitados: pedidosSimulados } = require('../config/pedidos-simulados');

function operacion(pedido) {
    const bloqueos = [];
    const pagoReal = pedido.pagos.some(pago => pago.estado === 'APROBADO' && pago.simulacion === false);
    const pagoSimulado = !pagoReal && pedido.pagos.some(pago => pago.estado === 'APROBADO' && pago.simulacion === true);
    if (!pagoReal && !(pedidosSimulados() && pagoSimulado)) bloqueos.push('PAGO_REAL_NO_APROBADO');
    if (!pedido.detalles.length) bloqueos.push('SIN_MEDICAMENTOS');
    if (pedido.detalles.some(item => item.medicamento.requiere_formula === true)) bloqueos.push('VALIDACION_FARMACEUTICA_PENDIENTE');
    if (pedido.detalles.some(item => item.medicamento.requiere_formula !== true && item.medicamento.requiere_formula !== false)) bloqueos.push('REQUISITO_FORMULA_DESCONOCIDO');
    return { siguienteEstado: bloqueos.length ? null : SIGUIENTE[pedido.estado] || null, bloqueos, ...(pagoSimulado ? { simulacion: true } : {}) };
}

module.exports = { operacion };
