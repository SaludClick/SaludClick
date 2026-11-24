const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { test } = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { Server } = require("socket.io");
const express = require("express");
const { createSessionAuthority, canReceive } = require("../src/services/session-authority");
const { generarToken } = require("../src/utils/jwt");

test("HTTP y Socket.IO rechazan sesiones anteriores y vigentes que fueron revocadas", async () => {
    process.env.JWT_SECRET = "session-authority-isolated-test";
    const db = new PGlite();
    const authority = createSessionAuthority(db.query.bind(db));
    const app = express();
    app.use("/api", authority.http);
    app.get("/api/private", (_req, res) => res.sendStatus(204));
    const server = createServer(app);
    const io = new Server(server);
    authority.socket(io.of("/"));
    try {
        await db.exec(`
            CREATE TABLE usuarios (id int PRIMARY KEY, nombre text, correo text, password text, rol_id int, estado text);
            CREATE TABLE ips_entidades (id text PRIMARY KEY, activa boolean);
            CREATE TABLE eps_entidades (id text PRIMARY KEY, activa boolean);
            CREATE TABLE ips_accesos (usuario_id int PRIMARY KEY, ips_id text, activo boolean);
            CREATE TABLE eps_accesos (usuario_id int PRIMARY KEY, eps_id text, activo boolean);
            CREATE TABLE farmacia_sesiones (usuario_id int PRIMARY KEY, revocadas_at timestamptz);
            INSERT INTO usuarios VALUES (1, 'Clínica', 'clinica@example.test', 'hash', 4, 'ACTIVO');
            INSERT INTO ips_entidades VALUES ('ips', true);
            INSERT INTO ips_accesos VALUES (1, 'ips', true);
        `);
        const migration = resolve(__dirname, "../prisma/migrations/20261123235000_revocacion_sesiones/migration.sql");
        await db.exec(readFileSync(migration, "utf8"));
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = `127.0.0.1:${server.address().port}`;
        const issue = async () => generarToken((await db.query("SELECT * FROM usuarios WHERE id=1")).rows[0]);
        const request = async token => (await fetch(`http://${address}/api/private`, { headers: { Authorization: `Bearer ${token}` } })).status;
        assert.equal(await request(generarToken({ id: 1, rol_id: 4 })), 401);

        let token = await issue();
        assert.equal(await request(token), 204);
        const connected = once(io.of("/"), "connection");
        const client = new WebSocket(`ws://${address}/socket.io/?EIO=4&transport=websocket`);
        client.addEventListener("message", event => {
            if (event.data.startsWith("0")) client.send("40" + JSON.stringify({ token }));
        });
        const [socket] = await connected;
        try {
            await db.exec("UPDATE usuarios SET password='restablecida' WHERE id=1");
            assert.equal(await request(token), 401);
            assert.equal(await canReceive(socket), false);
            assert.equal(socket.connected, false);
        } finally {
            client.close();
        }

        token = await issue();
        assert.equal(await request(token), 204);
        await db.exec("UPDATE ips_accesos SET activo=false WHERE usuario_id=1");
        assert.equal(await request(token), 401);
        assert.equal(await request(await issue()), 401);
        await db.exec("UPDATE ips_accesos SET activo=true WHERE usuario_id=1");
        assert.equal(await request(token), 401);

        token = await issue();
        await db.exec("UPDATE usuarios SET estado='INACTIVO' WHERE id=1; UPDATE usuarios SET estado='ACTIVO' WHERE id=1");
        assert.equal(await request(token), 401);
        token = await issue();
        await db.exec("UPDATE usuarios SET rol_id=2 WHERE id=1; UPDATE usuarios SET rol_id=4 WHERE id=1");
        assert.equal(await request(token), 401);
        assert.equal(await request(await issue()), 204);
    } finally {
        await io.close();
        await db.close();
    }
});
