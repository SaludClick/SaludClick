// Las rutas protegidas usan el repositorio de asignaciones cuando se activa.
// El vínculo con una EPS por sí solo no acredita titularidad.
function requirePedidoScope(req, res, next) {
    if (require('../config/farmacia-solicitudes').habilitadas()) return next();
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({
        ok: false, codigo: 'FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE',
        mensaje: 'La consulta de solicitudes está pendiente de activar la verificación de asignaciones por farmacia.'
    });
}
module.exports = { requirePedidoScope };
