const { PublicError } = require("../utils/public-error");
const normalizarCorreo = correo => String(correo || "").trim().toLowerCase();

const validarRegistro = data => {
    if (!data.nombre || !data.apellido || !data.password || !data.numeroDocumento) {
        throw new PublicError("Nombre, apellido, documento y contraseña son obligatorios.");
    }
    if (String(data.password).length < 8) {
        throw new PublicError("La contraseña debe tener mínimo 8 caracteres.");
    }
};

const validarRestablecimiento = (token, nuevaPassword) => {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
        throw new PublicError("El enlace de recuperación no es válido.");
    }
    if (typeof nuevaPassword !== "string" || nuevaPassword.length < 6) {
        throw new PublicError("La contraseña debe tener al menos 6 caracteres.");
    }
    if (Buffer.byteLength(nuevaPassword) > 72) {
        throw new PublicError("La contraseña debe tener máximo 72 bytes.");
    }
};

module.exports = { normalizarCorreo, validarRegistro, validarRestablecimiento };
