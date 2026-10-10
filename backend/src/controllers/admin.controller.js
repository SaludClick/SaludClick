const adminService = require("../services/admin.service");

async function pedidos(req, res) {
    try {
        const pedidos = await adminService.listarPedidos();
        res.json({ ok: true, pedidos });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, mensaje: "No se pudieron cargar los pedidos." });
    }
}

async function estadoPedido(req, res) {
    try {
        const actualizado = await adminService.actualizarEstadoPedido(
            req.params.id,
            req.body.estado
        );

        if (!actualizado) {
            return res.status(404).json({ ok: false, mensaje: "Pedido no encontrado." });
        }

        res.json({ ok: true, mensaje: "Estado del pedido actualizado." });
    } catch (error) {
        res.status(400).json({ ok: false, mensaje: error.message });
    }
}

module.exports = { pedidos, estadoPedido };
