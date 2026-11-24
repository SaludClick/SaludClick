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

function operacionConPagoReal(pedido, subtotales) {
    const condiciones = operacion(pedido);
    const centavos = value => Math.round(Number(value) * 100);
    const total = subtotales.reduce((sum, value) => sum + centavos(value), 0);
    const pagado = pedido.pagos
        .filter(pago => pago.estado === 'APROBADO' && pago.simulacion === false)
        .reduce((sum, pago) => sum + centavos(pago.monto), 0);
    if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(pagado) || pagado < total) {
        condiciones.bloqueos.push('PAGO_REAL_INSUFICIENTE');
        condiciones.siguienteEstado = null;
    }
    return condiciones;
}
module.exports = { operacion, operacionConPagoReal };
