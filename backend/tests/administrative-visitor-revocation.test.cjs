const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createRepository } = require('../src/repositories/administrative.repository');
const { createController } = require('../src/controllers/administrative.controller');
const { visitorHash, visitorSession } = require('../src/middlewares/administrative-visitor.middleware');
const { createRouter } = require('../src/routes/administrative.routes');
const { attachAdministrativeSocket } = require('../src/sockets/administrative.socket');

test('visitor revoke expires only the matching active hash and preserves its conversation row', async () => {
  const first = visitorHash('a'.repeat(64));
  const second = visitorHash('b'.repeat(64));
  const expired = visitorHash('c'.repeat(64));
  const rows = [
    { id: 10, visitante_hash: first, expiresAt: Date.now() + 60_000 },
    { id: 20, visitante_hash: second, expiresAt: Date.now() + 60_000 },
    { id: 30, visitante_hash: expired, expiresAt: Date.now() - 1 }
  ];
  const db = { async $queryRawUnsafe(sql, hash) {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    assert.match(sql, /UPDATE administrative_cases SET visitante_expira_at=clock_timestamp\(\)/);
    assert.match(sql, /visitante_hash=\$1 AND visitante_expira_at>clock_timestamp\(\)/);
    const row = rows.find(item => item.visitante_hash === hash && item.expiresAt > Date.now());
    if (!row) return [];
    row.expiresAt = Date.now();
    return [{ id: row.id }];
  } };
  const repo = createRepository({ $transaction: callback => callback(db) });

  assert.equal(await repo.revokeVisitor(first), true);
  assert.equal(rows[0].expiresAt <= Date.now(), true);
  assert.equal(rows[1].expiresAt > Date.now(), true);
  assert.equal(await repo.revokeVisitor(first), false);
  assert.equal(await repo.revokeVisitor(expired), false);
  assert.equal(rows.length, 3, 'Revocation must not delete conversation rows.');
});

test('visitor middleware accepts only a bearer token with the expected random-token format and hashes it', async () => {
  const token = 'd'.repeat(64);
  const hash = visitorHash(token);
  assert.notEqual(hash, token);
  assert.equal(visitorHash('not-a-token'), null);
  let nextCalled = false;
  const req = { headers: { authorization: `Vitalix ${token}` } };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  visitorSession(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.visitorHash, hash);
  assert.equal(JSON.stringify(res.body || {}).includes(token), false);
});

test('visitor revoke route requires the caller token and passes only its hash to the handler', async t => {
  const token = '9'.repeat(64);
  const expectedHash = visitorHash(token);
  let handled = false;
  const app = express();
  app.use('/api/administrativo', createRouter({
    controller: { visitorRevoke(req, res) { handled = true; assert.equal(req.visitorHash, expectedHash); res.json({ ok: true, revocada: true }); } },
    guards: () => []
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/administrativo/visitante/revocar`;
  const missing = await fetch(endpoint, { method: 'POST' });
  assert.equal(missing.status, 401);
  assert.equal(handled, false);
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Vitalix ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, revocada: true });
  assert.equal(handled, true);
});

test('visitor controller emits an internal hash-scoped socket revocation without returning the hash', async () => {
  const token = '8'.repeat(64);
  const hash = visitorHash(token);
  let receivedHash, emitted;
  const controller = createController({ repo: { async revokeVisitor(value) { receivedHash = value; return true; } }, emit: (_req, event) => { emitted = event; } });
  const response = { headersSent: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.visitorRevoke({ visitorHash: hash }, response);
  assert.equal(receivedHash, hash);
  assert.deepEqual(emitted, { revokeVisitorHash: hash });
  assert.deepEqual(response.body, { ok: true, revocada: true });
  assert.equal(JSON.stringify(response.body).includes(token), false);

  const expiredController = createController({ repo: { async revokeVisitor() { return false; } } });
  const expiredResponse = { headersSent: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await expiredController.visitorRevoke({ visitorHash: hash }, expiredResponse);
  assert.equal(expiredResponse.code, 410);
  assert.equal(expiredResponse.body.ok, false);
});

test('socket revocation disconnects all connections for that hash and leaves other visitor sockets connected', async () => {
  const tokens = ['e'.repeat(64), 'f'.repeat(64)];
  const active = new Map(tokens.map((token, index) => [visitorHash(token), index + 1]));
  const sockets = new Set();
  let middleware, connection, events;
  const namespace = {
    use(fn) { middleware = fn; },
    on(name, fn) { if (name === 'connection') connection = fn; },
    in(room) { return { disconnectSockets() { for (const socket of sockets) if (socket.rooms.has(room)) socket.disconnect(true); } }; },
    to() { return { to() { return this; }, emit() {} }; }
  };
  const app = { set(_key, callback) { events = callback; } };
  attachAdministrativeSocket({ of: () => namespace }, app, { visitorLookup: async hash => active.get(hash) });

  async function connect(token) {
    const socket = {
      handshake: { auth: { visitorToken: token } }, data: {}, rooms: new Set(), disconnected: false,
      join(room) { this.rooms.add(room); },
      disconnect() { this.disconnected = true; this.disconnectHandler?.(); },
      on(event, callback) { if (event === 'disconnect') this.disconnectHandler = callback; }
    };
    await new Promise((resolve, reject) => middleware(socket, error => error ? reject(error) : resolve()));
    sockets.add(socket);
    connection(socket);
    for (let attempts = 0; attempts < 50 && (!socket.data.visitorCase || !socket.disconnectHandler) && !socket.disconnected; attempts++) await new Promise(resolve => setTimeout(resolve, 1));
    return socket;
  }

  const [first, second] = await Promise.all(tokens.map(connect));
  const firstHash = visitorHash(tokens[0]);
  assert.equal(first.data.visitorCase, 1);
  assert.equal(second.data.visitorCase, 2);
  events({ revokeVisitorHash: firstHash });
  assert.equal(first.disconnected, true);
  assert.equal(second.disconnected, false);
  assert.equal(active.has(visitorHash(tokens[1])), true);
  assert.equal(JSON.stringify(first.rooms).includes(tokens[0]), false);
  second.disconnect(true);
});
