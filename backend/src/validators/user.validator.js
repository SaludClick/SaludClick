const { PublicError } = require("../utils/public-error");
const lengths = { nombre: 100, apellido: 100, telefono: 20, tipoDocumento: 10, ciudad: 100, numeroDocumento: 30, cedula: 30 };
const validarActualizacionPerfil = (data, { validarTelefono = true } = {}) => {
    for (const [field, limit] of Object.entries(lengths)) {
        const value = data[field];
        if (value != null && (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value) || value.trim().length > limit)) {
            throw new PublicError(`El campo ${field} debe contener texto válido de máximo ${limit} caracteres.`);
        }
    }
    const nombre = String(data.nombre || "").trim();
    const apellido = String(data.apellido || "").trim();

    if (!nombre || !apellido) {
        throw new PublicError("Nombre y apellido son obligatorios.");
    }

    const datos = {
        nombre,
        apellido,
        telefono: String(data.telefono || "").trim(),
        tipoDocumento: String(data.tipoDocumento || "").trim(),
        ciudad: String(data.ciudad || "").trim()
    };

    if (validarTelefono && datos.telefono && (!/^\+?[0-9 ()-]+$/.test(datos.telefono) || !/^\d{7,15}$/.test(datos.telefono.replace(/\D/g, "")))) {
        throw new PublicError("El teléfono debe contener entre 7 y 15 dígitos.");
    }

    // Solo incluir el documento si fue enviado expresamente.
    if (
        Object.prototype.hasOwnProperty.call(data, "numeroDocumento") ||
        Object.prototype.hasOwnProperty.call(data, "cedula")
    ) {
        datos.numeroDocumento = String(
            data.numeroDocumento ?? data.cedula ?? ""
        ).trim();
    }

    return datos;
};

module.exports = { validarActualizacionPerfil };
