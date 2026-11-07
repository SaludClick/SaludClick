const repository = require("../repositories/chat.repository");
const staffRole = (usuario) => Number(usuario?.rol ?? usuario?.rol_id) === 3;
const idFrom = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

async function listar(usuario) {
    const staff = staffRole(usuario);
    if (!staff && Number(usuario?.rol ?? usuario?.rol_id) !== 2) throw new Error("No autorizado para usar el chat.");
    return repository.listar(Number(usuario.id), staff);
}
async function crear(usuario) {
    if (Number(usuario?.rol ?? usuario?.rol_id) !== 2) throw new Error("Solo los usuarios pueden iniciar una conversación.");
    const existing = await repository.listar(Number(usuario.id), false);
    return existing[0] || repository.crear(Number(usuario.id));
}
async function autorizada(usuario, conversationId) {
    const id = idFrom(conversationId);
    if (!id) return null;
    const rol = Number(usuario?.rol ?? usuario?.rol_id);
    if (rol !== 2 && rol !== 3) return null;
    if (rol === 3 && !(await repository.esStaff(Number(usuario.id)))) return null;
    return repository.obtenerAutorizada(id, Number(usuario.id), rol === 3);
}
async function historial(usuario, conversationId) {
    const conversation = await autorizada(usuario, conversationId);
    if (!conversation) throw new Error("Conversación no encontrada o sin permisos.");
    return { conversation, messages: await repository.mensajes(conversation.id) };
}
async function enviar(usuario, conversationId, contenido) {
    const body = typeof contenido === "string" ? contenido.trim() : "";
    if (!body || body.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body)) throw new Error("El mensaje debe tener entre 1 y 2000 caracteres válidos.");
    const conversation = await autorizada(usuario, conversationId);
    if (!conversation || conversation.estado !== "ABIERTA") throw new Error("Conversación no encontrada, cerrada o sin permisos.");
    return repository.guardarMensaje(conversation.id, Number(usuario.id), body);
}
module.exports = { listar, crear, autorizada, historial, enviar, staffRole };
