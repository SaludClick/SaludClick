const { authorize } = require('../middlewares/farmacia-notificaciones.middleware');
const { habilitadas } = require('../config/farmacia-notificaciones');

function attachFarmaciaNotifications(io, app, { authenticate = authorize, enabled = habilitadas } = {}) {
    const namespace = io.of('/farmacia-notificaciones');
    namespace.use(async (socket, next) => {
        try {
            if (!enabled()) throw new Error();
            socket.data.farmacia = await authenticate(socket.handshake.auth?.token);
            next();
        } catch { next(new Error('Notificaciones de Farmacia no disponibles o acceso no vigente.')); }
    });
    namespace.on('connection', socket => {
        const remaining = socket.data.farmacia.exp * 1000 - Date.now();
        const expiry = setTimeout(() => socket.disconnect(), Math.max(0, Math.min(remaining, 2147483647)));
        expiry.unref?.();
        socket.on('disconnect', () => clearTimeout(expiry));
        // No client-controlled join, recipient, message or write events.
    });
    app.set('farmaciaNotificationEvents', async destinatarios => {
        if (!enabled()) return;
        const ids = new Set(destinatarios);
        await Promise.allSettled([...namespace.sockets.values()].filter(socket => ids.has(socket.data.farmacia.id)).map(async socket => {
            try {
                const user = await authenticate(socket.handshake.auth?.token);
                if (!ids.has(user.id) || user.id !== socket.data.farmacia.id) return socket.disconnect();
                socket.emit('farmacia:notificaciones:actualizadas');
            } catch { socket.disconnect(); }
        }));
    });
    return namespace;
}
module.exports = { attachFarmaciaNotifications };
