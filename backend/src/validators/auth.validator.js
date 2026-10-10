const normalizarCorreo = correo => String(correo || "").trim().toLowerCase();

const validarRegistro = data => {
    if (!data.nombre || !data.apellido || !data.password || !data.numeroDocumento) {
        throw new Error("Nombre, apellido, documento y contraseña son obligatorios.");
    }
    if (String(data.password).length < 8) {
        throw new Error("La contraseña debe tener mínimo 8 caracteres.");
    }
};

const validarRestablecimiento = (token, nuevaPassword) => {
    if (!token) {
        throw new Error("El enlace de recuperación no es válido.");
    }
    if (!nuevaPassword || nuevaPassword.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }
};

module.exports = { normalizarCorreo, validarRegistro, validarRestablecimiento };
