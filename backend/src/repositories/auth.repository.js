
const prisma = require("../config/prisma");

const seleccionarPerfil = {
    id: true,
    nombre: true,
    apellido: true,
    correo: true,
    telefono: true,
    cedula: true,
    tipo_documento: true,
    ciudad: true,
    estado: true,
    rol_id: true
};

const normalizarPerfil = (usuario) => {
    if (!usuario) return null;

    return {
        ...usuario,
        numeroDocumento: usuario.cedula ?? null,
        tipoDocumento: usuario.tipo_documento ?? null
    };
};

const buscarPorCorreo = async (correo) => {
    const usuario = await prisma.usuario.findUnique({
        where: { correo },
        include: { rol: true }
    });

    return usuario;
};

const register = async (usuario) => {
    const nuevoUsuario = await prisma.usuario.create({
        data: {
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            correo: usuario.correo,
            telefono: usuario.telefono || null,
            cedula: usuario.numeroDocumento || usuario.cedula || null,
            tipo_documento: usuario.tipoDocumento || null,
            ciudad: usuario.ciudad || null,
            password: usuario.password,
            rol_id: usuario.rol_id || 2
        },
        select: { id: true }
    });

    return nuevoUsuario.id;
};

const login = async (correo) => {
    return prisma.usuario.findUnique({
        where: { correo },
        include: { rol: true }
    });
};

const crearTokenRecuperacion = async (
    usuarioId,
    tokenHash,
    expiraEn
) => {
    return prisma.$transaction(async (tx) => {
        await tx.tokenRecuperacion.deleteMany({
            where: {
                OR: [
                    { usuario_id: usuarioId },
                    { expira_en: { lt: new Date() } }
                ]
            }
        });

        return tx.tokenRecuperacion.create({
            data: {
                usuario_id: usuarioId,
                token_hash: tokenHash,
                expira_en: expiraEn
            }
        });
    });
};

const buscarTokenRecuperacion = async (tokenHash) => {
    const token = await prisma.tokenRecuperacion.findFirst({
        where: {
            token_hash: tokenHash,
            expira_en: { gt: new Date() }
        },
        include: {
            usuario: {
                select: { id: true, correo: true }
            }
        }
    });

    if (!token) return null;

    return {
        token_id: token.id,
        usuario_id: token.usuario_id,
        correo: token.usuario.correo
    };
};

const actualizarPassword = async (
    usuarioId,
    passwordHash,
    tokenId
) => {
    return prisma.$transaction(async (tx) => {
        await tx.usuario.update({
            where: { id: Number(usuarioId) },
            data: { password: passwordHash }
        });

        await tx.tokenRecuperacion.delete({
            where: { id: Number(tokenId) }
        });
    });
};

const buscarPerfil = async (usuarioId) => {
    const usuario = await prisma.usuario.findUnique({
        where: { id: Number(usuarioId) },
        select: seleccionarPerfil
    });

    return normalizarPerfil(usuario);
};

const actualizarPerfil = async (usuarioId, data) => {
    const cambios = {
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono || null,
        tipo_documento: data.tipoDocumento || null,
        ciudad: data.ciudad || null
    };

    // No borrar la cédula si el formulario no la envió.
    if (Object.prototype.hasOwnProperty.call(data, "numeroDocumento")) {
        cambios.cedula = data.numeroDocumento || null;
    } else if (Object.prototype.hasOwnProperty.call(data, "cedula")) {
        cambios.cedula = data.cedula || null;
    }

    const usuario = await prisma.usuario.update({
        where: { id: Number(usuarioId) },
        data: cambios,
        select: seleccionarPerfil
    });

    return normalizarPerfil(usuario);
};

module.exports = {
    buscarPorCorreo,
    register,
    login,
    crearTokenRecuperacion,
    buscarTokenRecuperacion,
    actualizarPassword,
    buscarPerfil,
    actualizarPerfil
};
