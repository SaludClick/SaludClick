const jwt = require("jsonwebtoken");
const chatService = require("../services/chat.service");
const chatRepository = require("../repositories/chat.repository");
const { authorize } = require('../middlewares/farmacia-notificaciones.middleware');
const { esSesionFarmacia } = require('../middlewares/farmacia-session.middleware');

function attachChatSocket(io, { authenticateFarmacia = authorize, recheckMs = 15000 } = {}) {
    const farmacias = new Set();
    async function vigente(socket) {
        const user = await authenticateFarmacia(socket.handshake.auth?.token);
        if (user.id !== socket.data.usuario.id) throw new Error('Sesión inválida.');
        return user;
    }
    function disconnect(socket) {
        farmacias.delete(socket);
        socket.disconnect(true);
    }
    // Revalidate pharmacy recipients before broadcasting, including sockets that
    // only listen. Revoked sessions must not receive messages from patients.
    async function emit(room, event, data) {
        const excluded = [];
        const members = [...farmacias].filter(s => s.rooms.has(room));
        let participants;
        if (members.length && room.startsWith('chat:') && room !== 'chat:staff') {
            try { participants = await chatRepository.obtenerParticipantes(Number(room.slice(5))); }
            catch { participants = null; }
        }
        await Promise.all(members.map(async socket => {
            try {
                await vigente(socket);
                if (room !== 'chat:staff' && room.startsWith('chat:') && participants?.agente_id !== socket.data.usuario.id) {
                    excluded.push(socket.id);
                    await socket.leave(room);
                }
            } catch { excluded.push(socket.id); disconnect(socket); }
        }));
        const target = io.to(room);
        (excluded.length ? target.except(excluded) : target).emit(event, data);
    }
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token || !process.env.JWT_SECRET) return next(new Error("No autorizado"));
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            if (!payload?.id || ![2, 3].includes(Number(payload.rol ?? payload.rol_id))) return next(new Error("No autorizado"));
            socket.data.usuario = payload;
            if (esSesionFarmacia(payload)) {
                if (payload.rol !== undefined && payload.rol_id !== undefined && Number(payload.rol) !== Number(payload.rol_id)) return next(new Error('No autorizado'));
                socket.data.farmacia = await vigente(socket);
            }
            next();
        } catch { next(new Error("Token inválido o expirado")); }
    });
    io.on("connection", (socket) => {
        if (socket.data.farmacia) {
            farmacias.add(socket);
            const expires = setTimeout(() => disconnect(socket), Math.max(0, Math.min(socket.data.farmacia.exp * 1000 - Date.now(), 2147483647)));
            expires.unref?.();
            let check;
            const schedule = () => {
                check = setTimeout(async () => {
                    try { await vigente(socket); if (farmacias.has(socket)) schedule(); }
                    catch { disconnect(socket); }
                }, recheckMs);
                check.unref?.();
            };
            schedule();
            socket.on('disconnect', () => { farmacias.delete(socket); clearTimeout(expires); clearTimeout(check); });
        }
        const on = (event, handler) => socket.on(event, async (...args) => {
            if (socket.data.farmacia) {
                try { await vigente(socket); }
                catch {
                    const ack = args.at(-1);
                    if (typeof ack === 'function') ack({ ok: false, mensaje: 'La sesión de Farmacia no tiene acceso vigente.' });
                    disconnect(socket); return;
                }
            }
            return handler(...args);
        });
        on("chat:join", async (conversationId, ack = () => {}) => {
            try {
                const conversation = await chatService.autorizada(socket.data.usuario, conversationId);
                if (!conversation) return ack({ ok: false, mensaje: "Conversación no disponible." });
                const room = `chat:${conversation.id}`;
                await socket.join(room);
                const mensajes = await chatRepository.mensajes(conversation.id);
                const state = chatService.staffRole(socket.data.usuario) ? "ENTREGADO" : "LEIDO";
                const result = await chatRepository.actualizarEstado(conversation.id, state, Number(socket.data.usuario.id));
                if (result.count) await emit(room, "chat:status", { estado: state });
                ack({ ok: true, mensajes });
            } catch { ack({ ok: false, mensaje: "No se pudo abrir la conversación." }); }
        });
        on("chat:send", async ({ conversationId, contenido } = {}, ack = () => {}) => {
            try {
                const message = await chatService.enviar(socket.data.usuario, conversationId, contenido);
                await emit(`chat:${message.conversacion_id}`, "chat:message", message);
                const participants = await chatRepository.obtenerParticipantes(message.conversacion_id);
                const other = Number(socket.data.usuario.id) === participants?.cliente_id ? participants?.agente_id : participants?.cliente_id;
                if (other) await emit(`user:${other}`, "chat:notification", { conversationId: message.conversacion_id });
                if (!participants?.agente_id) await emit("chat:staff", "chat:notification", { conversationId: message.conversacion_id });
                ack({ ok: true, message });
            } catch (error) { ack({ ok: false, mensaje: socket.data.farmacia ? 'No se pudo enviar el mensaje. Comprueba la conversación e inténtalo nuevamente.' : error.message }); }
        });
        on("chat:read", async (conversationId, ack = () => {}) => {
            try {
                const conversation = await chatService.autorizada(socket.data.usuario, conversationId);
                if (!conversation) return ack({ ok: false });
                const updated = await chatRepository.actualizarEstado(conversation.id, "LEIDO", Number(socket.data.usuario.id));
                if (updated.count) await emit(`chat:${conversation.id}`, "chat:status", { estado: "LEIDO" });
                ack({ ok: true });
            } catch { ack({ ok: false }); }
        });
        socket.join(`user:${Number(socket.data.usuario.id)}`);
        if (chatService.staffRole(socket.data.usuario)) socket.join("chat:staff");
        on("chat:leave", async (conversationId) => {
            const conversation = await chatService.autorizada(socket.data.usuario, conversationId);
            if (conversation) socket.leave(`chat:${conversation.id}`);
        });
    });
}
module.exports = { attachChatSocket };
