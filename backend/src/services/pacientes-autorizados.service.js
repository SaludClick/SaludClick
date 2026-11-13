const pacientesRepository = require("../repositories/pacientes-autorizados.repository");
const {
    validarCrearPaciente,
    validarActualizarPaciente,
    validarId,
    validarPacienteId,
    validarPaginacion
} = require("../validators/pacientes-autorizados.validator");

function errorPaciente(mensaje, code) {
    const error = new Error(mensaje);
    error.code = code;
    return error;
}

function convertirErrorPersistencia(error) {
    if (error.code === "P2002") {
        return errorPaciente(
            "Ya existe un paciente autorizado con ese número de documento.",
            "CEDULA_DUPLICADA"
        );
    }

    if (error.code === "P2034") {
        return errorPaciente(
            "El registro tuvo cambios simultáneos. Inténtalo nuevamente.",
            "CAMBIO_CONCURRENTE"
        );
    }

    return error;
}

async function listarPacientes(consulta) {
    return pacientesRepository.listar(validarPaginacion(consulta));
}

async function buscarPaciente(idEntrada) {
    const id = validarPacienteId(idEntrada);
    return pacientesRepository.buscarPorId(id);
}

async function crearPaciente(entrada, administradorEntrada) {
    const paciente = validarCrearPaciente(entrada);
    const administradorId = validarId(
        administradorEntrada,
        "El identificador del administrador"
    );

    try {
        return await pacientesRepository.crear(paciente, administradorId);
    } catch (error) {
        throw convertirErrorPersistencia(error);
    }
}

async function actualizarPaciente(idEntrada, entrada, administradorEntrada) {
    const id = validarPacienteId(idEntrada);
    const datos = validarActualizarPaciente(entrada);
    const administradorId = validarId(
        administradorEntrada,
        "El identificador del administrador"
    );

    try {
        return await pacientesRepository.actualizar(id, datos, administradorId);
    } catch (error) {
        throw convertirErrorPersistencia(error);
    }
}

module.exports = {
    listarPacientes,
    buscarPaciente,
    crearPaciente,
    actualizarPaciente
};
