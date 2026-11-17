const medicationService = require("../services/medication.service");

const verificarAcceso = (req, res) => {
    res.json({
        ok: true,
        mensaje: "Acceso autorizado al panel de farmacia."
    });
};

async function dashboard(req, res) {
    try {
        const medicamentos = await medicationService.listar();
        const disponibles = medicamentos.filter(
            medicamento => medicamento.estado === "DISPONIBLE"
        ).length;

        res.json({
            ok: true,
            medicamentos,
            estadisticas: {
                totalMedicamentos: medicamentos.length,
                medicamentosDisponibles: disponibles
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: "No se pudo cargar el dashboard de farmacia."
        });
    }
}

const service = require('../services/farmacia.service');
function handle(operation, message) {
    return async (req, res) => {
        try { res.json({ ok: true, ...await operation(req.query, Number(req.usuario?.id)) }); }
        catch (error) {
            res.status([400,403].includes(error.status) ? error.status : 500).json({
                ok: false, mensaje: [400,403].includes(error.status) ? error.message : message
            });
        }
    };
}
module.exports = {
    verificarAcceso, dashboard,
    async avanzarPedido(req, res) {
        try { res.json({ ok: true, pedido: await service.avanzarPedido(req.params.id, req.body, Number(req.usuario?.id)) }); }
        catch (error) {
            const status = [400, 403, 409].includes(error.status) ? error.status : 500;
            res.status(status).json({ ok: false, mensaje: status === 500 ? 'No se pudo actualizar el pedido.' : error.message });
        }
    },
    pedidos: handle(service.listarPedidos, 'No se pudieron cargar los pedidos de farmacia.'),
    inventario: handle(service.listarInventario, 'No se pudo cargar el inventario.')
};
