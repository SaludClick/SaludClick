require("./support/isolate-database.cjs");

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");
const express = require("express");
const { Server } = require("socket.io");
const { generarToken } = require("../src/utils/jwt");
const { validarJWT } = require("../src/middlewares/auth.middleware");
const { createSessionGuard } = require("../src/middlewares/administrative-session.middleware");
const { createAuthorize } = require("../src/middlewares/farmacia-notificaciones.middleware");
const { attachChatSocket } = require("../src/sockets/chat.socket");
const { attachAdministrativeSocket } = require("../src/sockets/administrative.socket");
const { attachFarmaciaNotifications } = require("../src/sockets/farmacia-notificaciones.socket");
const { connectAdministrativeSocket } = require("./support/administrative-socket-client.cjs");

const account = id => ({ id, rol_id: id, estado: "ACTIVO" });
const namespaces = [["/", 2], ["/administrativo", 1], ["/administrativo", 2], ["/farmacia-notificaciones", 3]];

async function startServer() {
    const app = express();
    const guard = createSessionGuard({ findUser: async id => account(id) });
    const pharmacy = createAuthorize({ lookup: async id => account(id), revocation: async () => null });
    app.get("/session", validarJWT, guard, (_req, res) => res.sendStatus(204));

    const server = http.createServer(app);
    const sockets = new Server(server);
    attachChatSocket(sockets);
    attachAdministrativeSocket(sockets, app, { guard });
    attachFarmaciaNotifications(sockets, app, { authenticate: pharmacy, enabled: () => true });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => sockets.close()
    };
}

test("rotar JWT desconecta sockets anteriores y rechaza las firmas antiguas en HTTP y WebSocket", { timeout: 15000 }, async () => {
    const original = process.env.JWT_SECRET;
    let instance;
    const tokenSet = () => new Map([1, 2, 3, 4].map(id => [id, generarToken(account(id))]));
    const status = async (origin, token) => {
        const response = await fetch(origin + "/session", { headers: { Authorization: `Bearer ${token}` } });
        await response.body?.cancel();
        return response.status;
    };

    try {
        process.env.JWT_SECRET = randomBytes(32).toString("hex");
        const old = tokenSet();
        instance = await startServer();
        for (const token of old.values()) assert.equal(await status(instance.origin, token), 204);
        const connected = await Promise.all(namespaces.map(([namespace, id]) =>
            connectAdministrativeSocket(instance.origin, old.get(id), namespace)));

        await instance.close();
        instance = undefined;
        await Promise.all(connected.map(socket => socket.closed));

        process.env.JWT_SECRET = randomBytes(32).toString("hex");
        instance = await startServer();
        const current = tokenSet();
        for (const [id, token] of current) {
            assert.equal(await status(instance.origin, old.get(id)), 401);
            assert.equal(await status(instance.origin, token), 204);
        }
        for (const [namespace, id] of namespaces) {
            await assert.rejects(connectAdministrativeSocket(instance.origin, old.get(id), namespace), /access denied/);
            const socket = await connectAdministrativeSocket(instance.origin, current.get(id), namespace);
            socket.close();
            await socket.closed;
        }
    } finally {
        if (instance) await instance.close();
        if (original === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = original;
    }
});
