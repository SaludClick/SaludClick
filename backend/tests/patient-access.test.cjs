require('./support/isolate-database.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const secretBefore = process.env.JWT_SECRET;
let server, base;
before(async () => {
    process.env.JWT_SECRET = 'patient-access-tests-only';
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (secretBefore === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secretBefore;
});
test('rutas personales rechazan administrador, farmacia, EPS y sesiones ausentes antes de acceder a datos', async t => {
    const routes = [
        ['GET', '/api/pedidos'], ['POST', '/api/pedidos'],
        ['GET', '/api/pedidos/1'], ['DELETE', '/api/pedidos/1'],
        ['GET', '/api/formulas'], ['POST', '/api/formulas'],
        ['GET', '/api/formulas/1'], ['GET', '/api/dashboard/me']
    ];
    for (const [method, route] of routes) for (const role of [null, 1, 3, 4, 99]) {
        await t.test(`${method} ${route}, rol ${role}`, async () => {
            const headers = role === null ? {} : { Authorization: `Bearer ${jwt.sign({ id: 10, rol: role }, process.env.JWT_SECRET)}` };
            const response = await fetch(base + route, { method, headers });
            assert.equal(response.status, role === null ? 401 : 403);
            assert.equal((await response.json()).ok, false);
        });
    }
});
