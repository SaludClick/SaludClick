const authRepository = require("../repositories/auth.repository");
const { validarActualizacionPerfil } = require("../validators/user.validator");
const { PublicError } = require("../utils/public-error");

const profile = async usuarioId => {
    const usuario = await authRepository.buscarPerfil(usuarioId);
    if (!usuario) throw new Error("Usuario no encontrado.");
    return usuario;
};

const updateProfile = async (usuarioId, data, options) => {
    const datosValidados = validarActualizacionPerfil(data || {}, options);
    try {
        return await authRepository.actualizarPerfil(usuarioId, datosValidados);
    } catch (error) {
        if (error.code === "23505" && Object.hasOwn(datosValidados, "numeroDocumento")) {
            throw new PublicError("El documento ya está registrado. Revisa el número ingresado.");
        }
        throw error;
    }
};

module.exports = { profile, updateProfile };
