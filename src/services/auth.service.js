const { generarToken } = require("../utils/jwt");
const bcrypt = require("bcrypt");
const authRepository = require("../repositories/auth.repository");

const register = async (data) => {

    const existe = await authRepository.buscarPorCorreo(data.correo);

    if (existe) {
        throw new Error("El correo ya está registrado");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const usuario = {
        nombre: data.nombre,
        apellido: data.apellido,
        correo: data.correo,
        telefono: data.telefono,
        password: passwordHash,
        rol_id: 2
    };

    const id = await authRepository.register(usuario);

    return {
        ok: true,
        mensaje: "Usuario registrado correctamente",
        id
    };
};

const login = async (data) => {

    const usuario = await authRepository.login(data.correo);

    if (!usuario) {
        throw new Error("Correo o contraseña incorrectos");
    }

    const passwordCorrecta = await bcrypt.compare(
        data.password,
        usuario.password
    );

    if (!passwordCorrecta) {
        throw new Error("Correo o contraseña incorrectos");
    }

    const token = generarToken(usuario);

    return {
        ok: true,
        mensaje: "Inicio de sesión correcto",
        token,
        usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo,
            rol: usuario.rol_id
        }
    };

};

const profile = async () => {

    return {
        mensaje: "Pendiente"
    };

};

module.exports = {
    register,
    login,
    profile
};