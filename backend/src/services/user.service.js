const authRepository = require("../repositories/auth.repository");
const { validarActualizacionPerfil } = require("../validators/user.validator");

const profile = async usuarioId => {
    const usuario = await authRepository.buscarPerfil(usuarioId);
    if (!usuario) throw new Error("Usuario no encontrado.");
    return usuario;
};

const updateProfile = async (usuarioId, data) => {
    const datosValidados = validarActualizacionPerfil(data || {});
    return authRepository.actualizarPerfil(usuarioId, datosValidados);
};

module.exports = { profile, updateProfile };
