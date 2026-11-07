const jwt = require("jsonwebtoken");
const chatService = require("../services/chat.service");
const chatRepository = require("../repositories/chat.repository");

function attachChatSocket(io) {
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token || !process.env.JWT_SECRET) return next(new Error("No autorizado"));
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            if (!payload?.id || ![2, 3].includes(Number(payload.rol ?? payload.rol_id))) return next(new Error("No autorizado"));
            socket.data.usuario = payload;
            next();
        } catch { next(new Error("Token inválido o expirado")); }
    });
    io.on("connection", (socket) => {
        socket.on("chat:join", async (conversationId, ack = () => {}) => {
            try {
                const conversation = await chatService.autorizada(socket.data.usuario, conversationId);
                if (!conversation) return ack({ ok: false, mensaje: "Conversación no disponible." });
                const room = `chat:${conversation.id}`;
                await socket.join(room);
                const mensajes = await chatRepository.mensajes(conversation.id);
                const state = chatService.staffRole(socket.data.usuario) ? "ENTREGADO" : "LEIDO";
                const result = await chatRepository.actualizarEstado(conversation.id, state, Number(socket.data.usuario.id));
                if (result.count) io.to(room).emit("chat:status", { estado: state });
                ack({ ok: true, mensajes });
            } catch { ack({ ok: false, mensaje: "No se pudo abrir la conversación." }); }
        });
        socket.on("chat:send", async ({ conversationId, contenido } = {}, ack = () => {}) => {
            try {
                const message = await chatService.enviar(socket.data.usuario, conversationId, contenido);
                io.to(`chat:${message.conversacion_id}`).emit("chat:message", message);
                const participants = await chatRepository.obtenerParticipantes(message.conversacion_id);
                const other = Number(socket.data.usuario.id) === participants?.cliente_id ? participants?.agente_id : participants?.cliente_id;
                if (other) io.to(`user:${other}`).emit("chat:notification", { conversationId: message.conversacion_id });
                if (!participants?.agente_id) io.to("chat:staff").emit("chat:notification", { conversationId: message.conversacion_id });
                ack({ ok: true, message });
            } catch (error) { ack({ ok: false, mensaje: error.message }); }
        });
        socket.on("chat:read", async (conversationId, ack = () => {}) => {
            try {
                const conversation = await chatService.autorizada(socket.data.usuario, conversationId);
                if (!conversation) return ack({ ok: false });
                const updated = await chatRepository.actualizarEstado(conversation.id, "LEIDO", Number(socket.data.usuario.id));
                if (updated.count) io.to(`chat:${conversation.id}`).emit("chat:status", { estado: "LEIDO" });
                ack({ ok: true });
            } catch { ack({ ok: false }); }
        });
        socket.join(`user:${Number(socket.data.usuario.id)}`);
        if (chatService.staffRole(socket.data.usuario)) socket.join("chat:staff");
        socket.on("chat:leave", async (conversationId) => {
            const conversation = await chatService.autorizada(socket.data.usuario, conversationId);
            if (conversation) socket.leave(`chat:${conversation.id}`);
        });
    });
}
module.exports = { attachChatSocket };
