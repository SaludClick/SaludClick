
const adminService = require("../services/admin.service");

async function pedidos(req, res) {
    try {
        const pedidos = await adminService.listarPedidos();
        res.json({ ok: true, pedidos });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: "No se pudieron cargar los pedidos."
        });
    }
}

async function estadoPedido(req, res) {
    try {
        const actualizado = await adminService.actualizarEstadoPedido(
            req.params.id,
            req.body.estado
        );

        if (!actualizado) {
            return res.status(404).json({
                ok: false,
                mensaje: "Pedido no encontrado."
            });
        }

        res.json({
            ok: true,
            mensaje: "Estado del pedido actualizado."
        });
    } catch (error) {
        res.status(400).json({ ok: false, mensaje: error.message });
    }
}

// Listar cuentas para el panel administrativo.
async function cuentas(req, res) {
    try {
        const cuentas = await adminService.listarCuentas();
        res.json({ ok: true, cuentas });
    } catch (error) {
        console.error("Error al listar cuentas:", error);
        res.status(500).json({
            ok: false,
            mensaje: "No se pudieron cargar las cuentas."
        });
    }
}

// Solicitar la eliminación permanente de una cuenta.

async function eliminarCuenta(req, res) {
    try {
        const resultado = await adminService.eliminarCuenta(
            req.params.id,
            req.usuario?.id
        );

        return res.json({
            ok: true,
            mensaje: "La cuenta se eliminó correctamente.",
            cuentaId: resultado.id
        });
    } catch (error) {
        console.error("Error al eliminar cuenta:", error);

        if (error.code === "CUENTA_PROPIA") {
            return res.status(403).json({
                ok: false,
                mensaje: error.message
            });
        }

        if (error.code === "CUENTA_NO_ENCONTRADA") {
            return res.status(404).json({
                ok: false,
                mensaje: error.message
            });
        }

        if (error.code === "CUENTA_NO_PERMITIDA") {
            return res.status(403).json({
                ok: false,
                mensaje: error.message
            });
        }

        if (error.code === "CUENTA_CON_HISTORIAL") {
            return res.status(409).json({
                ok: false,
                mensaje: error.message
            });
        }

        if (error.code === "P2034") {
            return res.status(409).json({
                ok: false,
                mensaje: "La cuenta tuvo cambios simultáneos. Inténtalo nuevamente."
            });
        }

        return res.status(500).json({
            ok: false,
            mensaje: "No se pudo eliminar la cuenta."
        });
    }
}

module.exports = {
    pedidos,
    estadoPedido,
    cuentas,
    eliminarCuenta
};

