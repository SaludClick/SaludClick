const { PublicError, publicMessage } = require("../utils/public-error");
const service = require("../services/chat.service");
async function listar(req, res) {
    try { res.json({ ok: true, conversaciones: await service.listar(req.usuario) }); }
    catch (error) { res.status(403).json({ ok: false, mensaje: publicMessage(error, "No se pudo completar la operación de chat.") }); }
}
async function crear(req, res) {
    try { res.status(201).json({ ok: true, conversacion: await service.crear(req.usuario) }); }
    catch (error) { res.status(403).json({ ok: false, mensaje: publicMessage(error, "No se pudo completar la operación de chat.") }); }
}
async function historial(req, res) {
    try { res.json({ ok: true, ...await service.historial(req.usuario, req.params.id) }); }
    catch (error) { res.status(error instanceof PublicError ? 404 : 400).json({ ok: false, mensaje: publicMessage(error, "No se pudo completar la operación de chat.") }); }
}
module.exports = { listar, crear, historial };
