const validarActualizacionPerfil = data => {
    const nombre = String(data.nombre || "").trim();
    const apellido = String(data.apellido || "").trim();
    if (!nombre || !apellido) {
        throw new Error("Nombre y apellido son obligatorios.");
    }

    return {
        nombre,
        apellido,
        telefono: String(data.telefono || "").trim(),
        tipoDocumento: String(data.tipoDocumento || "").trim(),
        ciudad: String(data.ciudad || "").trim()
    };
};

module.exports = { validarActualizacionPerfil };
