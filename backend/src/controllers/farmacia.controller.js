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
    async avanzarPedido(req, res) {
        try { res.json({ ok: true, pedido: await service.avanzarPedido(req.params.id, req.body) }); }
        catch (error) {
            const status = [400, 409].includes(error.status) ? error.status : 500;
            res.status(status).json({ ok: false, mensaje: status === 500 ? 'No se pudo actualizar el pedido.' : error.message });
        }
    },
    pedidos: handle(service.listarPedidos, 'No se pudieron cargar los pedidos de farmacia.'),
    inventario: handle(service.listarInventario, 'No se pudo cargar el inventario.')
};
