
const prisma = require("../config/prisma");

async function crear(data) {
    const formula = await prisma.formulaMedica.create({
        data: {
            usuario_id: Number(data.usuarioId),
            nombre_archivo: data.nombreArchivo,
            nombre_original: data.nombreOriginal,
            tipo_mime: data.tipoMime,
            ruta_archivo: `private_uploads/${data.nombreArchivo}`,
            tamano: data.tamano,
            descripcion: data.descripcion || null,
            estado: "PENDIENTE"
        },
        select: { id: true }
    });

    return formula.id;
}

async function listarUsuario(usuarioId) {
    const formulas = await prisma.formulaMedica.findMany({
        where: {
            usuario_id: Number(usuarioId),
            estado: { not: "ELIMINADA" }
        },
        select: {
            id: true,
            nombre_original: true,
            tipo_mime: true,
            tamano: true,
            descripcion: true,
            estado: true,
            fecha_subida: true
        },
        orderBy: { fecha_subida: "desc" }
    });

    return formulas.map(formula => ({
        id: formula.id,
        nombre: formula.nombre_original,
        tipo_mime: formula.tipo_mime,
        tamano: formula.tamano,
        descripcion: formula.descripcion,
        estado: formula.estado,
        created_at: formula.fecha_subida
    }));
}

async function buscarPropia(usuarioId, id) {
    return prisma.formulaMedica.findFirst({
        where: {
            id: Number(id),
            usuario_id: Number(usuarioId),
            estado: { not: "ELIMINADA" }
        }
    });
}

async function listarAdmin() {
    const formulas = await prisma.formulaMedica.findMany({
        where: { estado: { not: "ELIMINADA" } },
        include: {
            usuario: {
                select: {
                    id: true,
                    nombre: true,
                    apellido: true,
                    correo: true
                }
            }
        },
        orderBy: { fecha_subida: "desc" }
    });

    return formulas.map(formula => ({
        id: formula.id,
        nombre: formula.nombre_original,
        f_tipo_mime: formula.tipo_mime,
        tamano: formula.tamano,
        descripcion: formula.descripcion,
        estado: formula.estado,
        created_at: formula.fecha_subida,
        usuario_id: formula.usuario.id,
        usuario: `${formula.usuario.nombre} ${formula.usuario.apellido}`,
        correo: formula.usuario.correo
    }));
}

async function actualizarEstado(id, estado) {
    const resultado = await prisma.formulaMedica.updateMany({
        where: { id: Number(id) },
        data: { estado }
    });

    return resultado.count;
}

module.exports = {
    crear,
    listarUsuario,
    buscarPropia,
    listarAdmin,
    actualizarEstado
};
