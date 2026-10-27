const validarActualizacionPerfil = (data) => {
    const nombre = String(data.nombre || "").trim();
    const apellido = String(data.apellido || "").trim();

    if (!nombre || !apellido) {
        throw new Error("Nombre y apellido son obligatorios.");
    }

    const datos = {
        nombre,
        apellido,
        telefono: String(data.telefono || "").trim(),
        tipoDocumento: String(data.tipoDocumento || "").trim(),
        ciudad: String(data.ciudad || "").trim()
    };

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