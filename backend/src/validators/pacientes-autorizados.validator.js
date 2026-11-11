const ESTADOS_AUTORIZACION = new Set(["AUTORIZADO", "REVOCADO"]);
const CAMPOS_IDENTIDAD = new Set([
    "nombres",
    "apellidos",
    "tipo_documento",
    "cedula"
]);

function errorValidacion(mensaje) {
    const error = new Error(mensaje);
    error.code = "VALIDACION_PACIENTE";
    return error;
}

function validarObjeto(entrada, camposPermitidos) {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
        throw errorValidacion("Los datos del paciente no son válidos.");
    }

    const campoDesconocido = Object.keys(entrada).find(
        (campo) => !camposPermitidos.has(campo)
    );

    if (campoDesconocido) {
        throw errorValidacion(`El campo ${campoDesconocido} no está permitido.`);
    }
}

function normalizarTexto(valor, campo, maximo) {
    if (typeof valor !== "string") {
        throw errorValidacion(`${campo} es obligatorio.`);
    }

    const texto = valor.normalize("NFC").trim().replace(/\s+/gu, " ");
    if (
        !texto ||
        texto.length > maximo ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(texto)
    ) {
        throw errorValidacion(`${campo} no es válido.`);
    }

    return texto;
}

function normalizarTipoDocumento(valor) {
    return normalizarTexto(valor, "El tipo de documento", 10).toUpperCase();
}

function normalizarCedula(valor) {
    const cedula = normalizarTexto(valor, "La cédula", 30);

    if (/[\u0000-\u001f\u007f]/u.test(cedula)) {
        throw errorValidacion("La cédula no es válida.");
    }

    return cedula;
}

function validarCrearPaciente(entrada) {
    validarObjeto(entrada, CAMPOS_IDENTIDAD);

    return {
        nombres: normalizarTexto(entrada.nombres, "Los nombres", 100),
        apellidos: normalizarTexto(entrada.apellidos, "Los apellidos", 100),
        tipo_documento: normalizarTipoDocumento(entrada.tipo_documento),
        cedula: normalizarCedula(entrada.cedula)
    };
}

function validarActualizarPaciente(entrada) {
    const camposPermitidos = new Set([...CAMPOS_IDENTIDAD, "estado"]);
    validarObjeto(entrada, camposPermitidos);

    const datos = {};
    for (const campo of CAMPOS_IDENTIDAD) {
        if (!Object.hasOwn(entrada, campo)) continue;

        if (campo === "tipo_documento") {
            datos[campo] = normalizarTipoDocumento(entrada[campo]);
        } else if (campo === "cedula") {
            datos[campo] = normalizarCedula(entrada[campo]);
        } else {
            const etiqueta = campo === "nombres" ? "Los nombres" : "Los apellidos";
            datos[campo] = normalizarTexto(entrada[campo], etiqueta, 100);
        }
    }

    if (Object.hasOwn(entrada, "estado")) {
        if (!ESTADOS_AUTORIZACION.has(entrada.estado)) {
            throw errorValidacion("El estado de autorización no es válido.");
        }
        datos.estado = entrada.estado;
    }

    if (Object.keys(datos).length === 0) {
        throw errorValidacion("Indica al menos un campo para actualizar.");
    }

    return datos;
}

function validarId(entrada, etiqueta = "El identificador") {
    const id = Number(entrada);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw errorValidacion(`${etiqueta} no es válido.`);
    }
    return id;
}

function validarPacienteId(entrada) {
    return validarId(entrada, "El identificador del paciente");
}

function validarPaginacion(consulta) {
    validarObjeto(consulta, new Set(["busqueda", "page", "limit"]));

    const parsearEntero = (valor, predeterminado, campo) => {
        if (valor === undefined) return predeterminado;
        if (typeof valor !== "string" || !/^[1-9]\d*$/u.test(valor)) {
            throw errorValidacion(`${campo} no es válida.`);
        }

        const numero = Number(valor);
        if (!Number.isSafeInteger(numero)) {
            throw errorValidacion(`${campo} no es válida.`);
        }
        return numero;
    };

    const page = parsearEntero(consulta.page, 1, "La página");
    const limit = parsearEntero(consulta.limit, 10, "El tamaño de página");
    if (consulta.busqueda !== undefined && typeof consulta.busqueda !== "string") {
        throw errorValidacion("La búsqueda no es válida.");
    }

    const busqueda = (consulta.busqueda ?? "").normalize("NFC").trim();

    if (busqueda.length > 100) throw errorValidacion("La búsqueda no es válida.");
    if (!Number.isSafeInteger((page - 1) * limit)) {
        throw errorValidacion("La página solicitada no es válida.");
    }
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 50) {
        throw errorValidacion("El tamaño de página debe estar entre 1 y 50.");
    }

    return { busqueda, page, limit };
}

module.exports = {
    validarCrearPaciente,
    validarActualizarPaciente,
    validarId,
    validarPacienteId,
    validarPaginacion
};
