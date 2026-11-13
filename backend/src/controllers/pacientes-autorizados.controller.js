const pacientesService = require("../services/pacientes-autorizados.service");

function responderError(res, error, contexto) {
    if (error.code === "VALIDACION_PACIENTE") {
        return res.status(400).json({ ok: false, mensaje: error.message });
    }

    if (error.code === "CEDULA_DUPLICADA") {
        return res.status(409).json({ ok: false, mensaje: error.message });
    }

    if (error.code === "CAMBIO_CONCURRENTE") {
        return res.status(409).json({ ok: false, mensaje: error.message });
    }

    console.error(contexto, error.code || "INTERNO");
    return res.status(500).json({
        ok: false,
        mensaje: "No se pudo completar la operación de pacientes."
    });
}

async function listar(req, res) {
    try {
        const resultado = await pacientesService.listarPacientes(req.query);
        return res.json({ ok: true, ...resultado });
    } catch (error) {
        return responderError(res, error, "Error al listar pacientes autorizados:");
    }
}

async function consultar(req, res) {
    try {
        const paciente = await pacientesService.buscarPaciente(req.params.id);
        if (!paciente) {
            return res.status(404).json({
                ok: false,
                mensaje: "No se encontró el paciente autorizado."
            });
        }

        return res.json({ ok: true, paciente });
    } catch (error) {
        return responderError(res, error, "Error al consultar paciente autorizado:");
    }
}

async function crear(req, res) {
    try {
        const paciente = await pacientesService.crearPaciente(
            req.body,
            req.usuario?.id
        );

        return res.status(201).json({
            ok: true,
            mensaje: "Paciente autorizado registrado correctamente.",
            paciente
        });
    } catch (error) {
        return responderError(res, error, "Error al crear paciente autorizado:");
    }
}

async function actualizar(req, res) {
    try {
        const paciente = await pacientesService.actualizarPaciente(
            req.params.id,
            req.body,
            req.usuario?.id
        );

        if (!paciente) {
            return res.status(404).json({
                ok: false,
                mensaje: "No se encontró el paciente autorizado."
            });
        }

        return res.json({
            ok: true,
            mensaje: "Paciente autorizado actualizado correctamente.",
            paciente
        });
    } catch (error) {
        return responderError(res, error, "Error al actualizar paciente autorizado:");
    }
}

module.exports = { listar, consultar, crear, actualizar };
