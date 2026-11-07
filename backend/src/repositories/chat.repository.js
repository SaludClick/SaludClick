const prisma = require("../config/prisma");

const conversationSelect = {
    id: true, estado: true, created_at: true, updated_at: true,
    cliente: { select: { id: true, nombre: true, apellido: true } },
    agente: { select: { id: true, nombre: true, apellido: true } },
    mensajes: { take: 1, orderBy: { created_at: "desc" }, select: { id: true, contenido: true, estado: true, created_at: true, remitente_id: true } }
};

async function esStaff(id) {
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: { rol_id: true, estado: true } });
    return usuario?.rol_id === 3 && usuario.estado !== "INACTIVO";
}
async function listar(id, staff) {
    return prisma.conversacion.findMany({
        where: staff ? { OR: [{ agente_id: id }, { agente_id: null, estado: "ABIERTA" }] } : { cliente_id: id },
        orderBy: { updated_at: "desc" }, select: conversationSelect
    });
}
async function crear(clienteId) {
    return prisma.conversacion.create({ data: { cliente_id: clienteId }, select: conversationSelect });
}
async function obtenerAutorizada(id, usuarioId, staff) {
    const conversation = await prisma.conversacion.findUnique({ where: { id }, select: { id: true, cliente_id: true, agente_id: true, estado: true } });
    if (!conversation || (staff ? (conversation.agente_id !== usuarioId && conversation.agente_id !== null) : conversation.cliente_id !== usuarioId)) return null;
    if (staff && conversation.agente_id === null) {
        const claim = await prisma.conversacion.updateMany({ where: { id, agente_id: null }, data: { agente_id: usuarioId } });
        if (!claim.count) return obtenerAutorizada(id, usuarioId, staff);
    }
    return prisma.conversacion.findUnique({ where: { id }, select: conversationSelect });
}
async function mensajes(id) {
    return prisma.mensajeChat.findMany({ where: { conversacion_id: id }, orderBy: { created_at: "asc" }, take: 300, select: { id: true, conversacion_id: true, remitente_id: true, contenido: true, estado: true, created_at: true, entregado_at: true, leido_at: true } });
}
async function guardarMensaje(conversacionId, remitenteId, contenido) {
    const mensaje = await prisma.mensajeChat.create({ data: { conversacion_id: conversacionId, remitente_id: remitenteId, contenido }, select: { id: true, conversacion_id: true, remitente_id: true, contenido: true, estado: true, created_at: true, entregado_at: true, leido_at: true } });
    await prisma.conversacion.update({ where: { id: conversacionId }, data: { updated_at: new Date() } });
    return mensaje;
}
async function actualizarEstado(id, estado, excludeRemitenteId) {
    const now = new Date();
    const data = estado === "ENTREGADO" ? { estado, entregado_at: now } : { estado, leido_at: now, entregado_at: now };
    return prisma.mensajeChat.updateMany({ where: { conversacion_id: id, remitente_id: { not: excludeRemitenteId }, estado: estado === "ENTREGADO" ? "ENVIADO" : { in: ["ENVIADO", "ENTREGADO"] } }, data });
}
async function obtenerParticipantes(id) {
    return prisma.conversacion.findUnique({ where: { id }, select: { cliente_id: true, agente_id: true } });
}

module.exports = { esStaff, listar, crear, obtenerAutorizada, mensajes, guardarMensaje, actualizarEstado, obtenerParticipantes };
