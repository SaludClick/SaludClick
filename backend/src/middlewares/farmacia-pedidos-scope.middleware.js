// No hay relación Solicitud–Farmacia en el esquema vigente. Ni el rol ni
// una afiliación EPS acreditan titularidad de un pedido. Sin bypass por entorno.
function requirePedidoScope(req, res) {
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({
        ok: false, codigo: 'FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE',
        mensaje: 'Consulta y cambios de entregas no disponibles: falta una relación verificable entre el pedido y tu farmacia. No se muestran pedidos globales ni se registran entregas.'
    });
}
module.exports = { requirePedidoScope };
