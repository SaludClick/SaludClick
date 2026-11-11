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

module.exports = { verificarAcceso, dashboard };
