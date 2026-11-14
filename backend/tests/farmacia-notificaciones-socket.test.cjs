require('./support/isolate-database.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { createAuthorize } = require('../src/middlewares/farmacia-notificaciones.middleware');
const { attachFarmaciaNotifications } = require('../src/sockets/farmacia-notificaciones.socket');
const secret = 'isolated-pharmacy-socket-secret';
let server, io, app, origin, enabled = true;
const users = new Map([[30, { id: 30, rol_id: 3, estado: 'ACTIVO' }], [31, { id: 31, rol_id: 3, estado: 'ACTIVO' }]]);
const clients = new Set();
before(async () => {
    app = express(); server = http.createServer(app); io = new Server(server);
    const authenticate = createAuthorize({ lookup: async id => users.get(id), verify: token => jwt.verify(token, secret) });
    attachFarmaciaNotifications(io, app, { authenticate, enabled: () => enabled });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `ws://127.0.0.1:${server.address().port}/socket.io/?EIO=4&transport=websocket`;
});
after(async () => { clients.forEach(client => client.close()); await new Promise(resolve => io.close(resolve)); });
const tokenFor = (id, role = 3, expiresIn = '1h') => jwt.sign({ id, rol: role }, secret, { expiresIn });
async function connect(token) {
    const ws = new WebSocket(origin), events = [];
    clients.add(ws);
    let readyResolve, readyReject, disconnected = false;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const timeout = setTimeout(() => readyReject(new Error('Socket timeout')), 5000);
    ws.addEventListener('message', event => {
        const packet = String(event.data);
        if (packet.startsWith('0')) ws.send('40/farmacia-notificaciones,' + JSON.stringify({ token }));
        else if (packet === '2') ws.send('3');
        else if (packet.startsWith('40/farmacia-notificaciones,')) { clearTimeout(timeout); readyResolve(); }
        else if (packet.startsWith('44/farmacia-notificaciones,')) { clearTimeout(timeout); readyReject(new Error('Acceso denegado')); }
        else if (packet.startsWith('42/farmacia-notificaciones,')) events.push(JSON.parse(packet.slice('42/farmacia-notificaciones,'.length)));
        else if (packet.startsWith('41/farmacia-notificaciones')) disconnected = true;
    });
    ws.addEventListener('error', () => { clearTimeout(timeout); readyReject(new Error('Transport error')); });
    ws.addEventListener('close', () => { disconnected = true; });
    try { await ready; } catch (error) { ws.close(); throw error; }
    return { ws, events, disconnected: () => disconnected };
}
async function until(predicate) {
    const end = Date.now() + 4000;
    while (Date.now() < end) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 15)); }
    assert.fail('No llegó el evento esperado.');
}

test('Socket.IO real: solo rol 3 activo con JWT válido y módulo habilitado', async () => {
    for (const token of [undefined, 'invalid', tokenFor(30, 1), tokenFor(30, 2), tokenFor(30, 4), tokenFor(999), tokenFor(30, 3, -1)]) await assert.rejects(connect(token), /denegado/);
    enabled = false;
    await assert.rejects(connect(tokenFor(30)), /denegado/);
    enabled = true;
});

test('Socket.IO real: invalidación solo a destinatario y sin contenido clínico; revalida cuenta antes de emitir', async () => {
    const own = await connect(tokenFor(30)), other = await connect(tokenFor(31));
    await app.get('farmaciaNotificationEvents')([30]);
    await until(() => own.events.length === 1);
    assert.deepEqual(own.events[0], ['farmacia:notificaciones:actualizadas']); assert.equal(other.events.length, 0);
    // Attempting to select another recipient has no server-side handler.
    other.ws.send('42/farmacia-notificaciones,' + JSON.stringify(['join', { destinatario_id: 30 }]));
    await app.get('farmaciaNotificationEvents')([30]); await until(() => own.events.length === 2);
    assert.equal(other.events.length, 0);
    users.get(30).estado = 'INACTIVO';
    await app.get('farmaciaNotificationEvents')([30]);
    await until(own.disconnected); assert.equal(own.events.length, 2);
    users.get(30).estado = 'ACTIVO'; other.ws.close(); own.ws.close();
});

test('Socket.IO real: expirar el token desconecta el canal y evita eventos posteriores', async () => {
    const client = await connect(tokenFor(30, 3, 1));
    await until(client.disconnected);
    await app.get('farmaciaNotificationEvents')([30]); assert.deepEqual(client.events, []);
    client.ws.close();
});
