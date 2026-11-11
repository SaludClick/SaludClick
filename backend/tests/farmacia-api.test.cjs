require('./support/isolate-database.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const calls = [];
let fail = false;
const fakePrisma = {};
for (const name of ['solicitud', 'medicamento']) fakePrisma[name] = {
    findMany: async options => { calls.push({ name, options }); if (fail) throw new Error('private provider diagnostics'); return []; },
    count: async () => 0
};
require.cache[require.resolve('../src/config/prisma')].exports = fakePrisma;
const app = require('../src/app');
const secretBefore = process.env.JWT_SECRET;
let server, base;
before(async () => {
    process.env.JWT_SECRET = 'farmacia-http-test-only';
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (secretBefore === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretBefore;
});
async function request(path, role = 3) {
    return fetch(base + '/api/farmacia' + path, { headers: role === null ? {} : {
        Authorization: `Bearer ${jwt.sign({ id: 30, rol: role }, process.env.JWT_SECRET)}`
    } });
}
test('solo farmacia consulta pedidos e inventario, sin acceder a datos ante roles rechazados', async () => {
    for (const path of ['/pedidos', '/inventario']) for (const role of [null, 1, 2, 4, 99]) {
        const count = calls.length;
        assert.equal((await request(path, role)).status, role === null ? 401 : 403);
        assert.equal(calls.length, count);
    }
});
test('pedidos selecciona solo informacion operativa y pagina de 25 en orden estable', async () => {
    const response = await request('/pedidos?pagina=2');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.paginacion, { pagina: 2, tamano: 25, total: 0, paginas: 0 });
    const { options } = calls.at(-1);
    assert.equal(options.skip, 25);
    assert.equal(options.take, 25);
    assert.deepEqual(options.select.usuario, { select: { nombre: true, apellido: true } });
    assert.equal(options.select.pagos, undefined);
    assert.equal(options.select.usuario.select.password, undefined);
    assert.deepEqual(options.where.estado.in, ['APROBADA', 'PREPARANDO', 'LISTA']);
});
test('inventario filtra nombres sin interpolar SQL y no publica campos internos', async () => {
    assert.equal((await request('/inventario?buscar=aspirina')).status, 200);
    const { options } = calls.at(-1);
    assert.deepEqual(options.where, { nombre: { contains: 'aspirina', mode: 'insensitive' } });
    assert.deepEqual(Object.keys(options.select).sort(), ['categoria', 'estado', 'id', 'nombre', 'stock']);
});
test('filtros invalidos fallan antes de consultar la base', async () => {
    for (const path of ['/pedidos?pagina=0', '/pedidos?pagina=-1', '/pedidos?pagina=1.5', '/pedidos?estado=CANCELADA', '/pedidos?estado=DESCONOCIDO', '/inventario?buscar=' + 'x'.repeat(151)]) {
        const count = calls.length;
        assert.equal((await request(path)).status, 400);
        assert.equal(calls.length, count);
    }
});
test('fallos del proveedor no filtran diagnosticos privados', async () => {
    fail = true;
    try {
        const response = await request('/pedidos');
        assert.equal(response.status, 500);
        assert.equal(JSON.stringify(await response.json()).includes('private provider'), false);
    } finally { fail = false; }
});
