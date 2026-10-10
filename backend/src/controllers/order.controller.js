const orderService = require("../services/order.service");

// =================================================
// CREAR PEDIDO
// =================================================

async function crearPedido(req, res) {
    try {
        const resultado = await orderService.crearPedido(
            req.usuario.id,
            req.body
        );

        res.status(201).json({
            ok: true,
            mensaje: "Pedido creado y pago simulado aprobado.",
            ...resultado
        });

    } catch (error) {
        console.error("Error al crear pedido:", error);

        res.status(400).json({
            ok: false,
            mensaje: error.message
        });
    }
}

// =================================================
// LISTAR PEDIDOS
// =================================================

async function listarPedidos(req, res) {
    try {
        const pedidos = await orderService.listarPedidos(
            req.usuario.id
        );

        res.json({
            ok: true,
            pedidos
        });

    } catch (error) {
        console.error("Error al listar pedidos:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo consultar el historial."
        });
    }
}

// =================================================
// DETALLE DEL PEDIDO
// =================================================

async function detallePedido(req, res) {
    try {
        const pedidoId = Number(req.params.id);

        if (
            !Number.isInteger(pedidoId) ||
            pedidoId < 1
        ) {
            return res.status(400).json({
                ok: false,
                mensaje: "Pedido inválido."
            });
        }

        const detalle = await orderService.detallePedido(
            req.usuario.id,
            pedidoId
        );

        if (!detalle.length) {
            return res.status(404).json({
                ok: false,
                mensaje: "Pedido no encontrado."
            });
        }

        res.json({
            ok: true,
            pedido: detalle
        });

    } catch (error) {
        console.error("Error al consultar pedido:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo consultar el pedido."
        });
    }
}

// =================================================
// ELIMINAR PEDIDO
// =================================================

async function eliminarPedido(req, res) {
    try {
        const pedidoId = Number(req.params.id);

        if (
            !Number.isInteger(pedidoId) ||
            pedidoId < 1
        ) {
            return res.status(400).json({
                ok: false,
                mensaje: "Pedido inválido."
            });
        }

        await orderService.eliminarPedido(
            req.usuario.id,
            pedidoId
        );

        res.json({
            ok: true,
            mensaje: "Pedido eliminado correctamente."
        });

    } catch (error) {
        console.error("Error al eliminar pedido:", error);

        if (error.message === "Pedido no encontrado.") {
            return res.status(404).json({
                ok: false,
                mensaje: error.message
            });
        }

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo eliminar el pedido."
        });
    }
}

// =================================================
// EXPORTAR
// =================================================

module.exports = {
    crearPedido,
    listarPedidos,
    detallePedido,
    eliminarPedido
};