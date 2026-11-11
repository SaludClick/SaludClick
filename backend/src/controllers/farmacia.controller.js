const service = require('../services/farmacia.service');
function handle(operation, message) {
    return async (req, res) => {
        try { res.json({ ok: true, ...await operation(req.query) }); }
        catch (error) {
            res.status(error.status === 400 ? 400 : 500).json({
                ok: false, mensaje: error.status === 400 ? error.message : message
            });
        }
    };
}
module.exports = {
    pedidos: handle(service.listarPedidos, 'No se pudieron cargar los pedidos de farmacia.'),
    inventario: handle(service.listarInventario, 'No se pudo cargar el inventario.')
};
