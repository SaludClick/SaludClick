require('./support/isolate-database.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
let server, base;
const secretBefore = process.env.JWT_SECRET;
before(async () => {
    process.env.JWT_SECRET = 'api-errors-test-only';
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (secretBefore === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretBefore;
});
test('una API desconocida responde JSON 404 sin rutas internas', async () => {
    const response = await fetch(base + '/api/no-existe');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, mensaje: 'Ruta de API no encontrada.' });
});
test('un rechazo async no capturado no filtra stack, proveedor ni rutas del servidor', async () => {
    const response = await fetch(base + '/api/auth/profile', { headers: {
        Authorization: `Bearer ${jwt.sign({ id: 2, rol: 2 }, process.env.JWT_SECRET)}`
    } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, mensaje: 'No se pudo completar la operación. Inténtalo nuevamente.' });
});
test('JSON malformado conserva 400 y cuerpos excesivos responden 413', async () => {
    const malformed = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    const oversized = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: 'x'.repeat(8 * 1024 * 1024) }) });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).ok, false);
});
