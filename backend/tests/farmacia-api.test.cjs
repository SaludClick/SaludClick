require('./support/isolate-database.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const calls = [];
let fail = false;
let updateCount = 1;
let storedState = 'APROBADA';
const fakePrisma = {};
fakePrisma.usuario = { findUnique: async () => ({ id: 30, rol_id: 3, estado: 'ACTIVO' }) };
for (const name of ['solicitud', 'medicamento']) fakePrisma[name] = {
    findMany: async options => { calls.push({ name, options }); if (fail) throw new Error('private provider diagnostics'); return []; },
    count: async () => 0
};
require.cache[require.resolve('../src/config/prisma')].exports = fakePrisma;
fakePrisma.$transaction = operation => operation(fakePrisma);
fakePrisma.solicitud.groupBy = async () => [];
fakePrisma.solicitud.findFirst = async () => ({ id: 9, estado: storedState, pagos: [{ estado: 'APROBADO', simulacion: false }], detalles: [{ cantidad: 1, medicamento: { requiere_formula: false } }] });
fakePrisma.solicitud.updateMany = async options => { calls.push({ operation: 'update', options }); if (updateCount) storedState = options.data.estado; return { count: updateCount }; };
// Fixture del contrato histórico preparado, sin habilitarlo en producción.
// El cierre real por titularidad se verifica en farmacia-entregas.test.cjs.
const app = require('express')();
app.use(require('express').json());
const { requireFarmacia } = require('../src/middlewares/farmacia.middleware');
const { requireFarmaciaVigente } = require('../src/middlewares/farmacia-notificaciones.middleware');
const controller = require('../src/controllers/farmacia.controller');
app.use('/api/farmacia/pedidos', requireFarmacia, requireFarmaciaVigente);
app.get('/api/farmacia/pedidos', controller.pedidos);
app.get('/api/farmacia/pedidos/:id', controller.detallePedido);
app.patch('/api/farmacia/pedidos/:id/estado', controller.avanzarPedido);
app.use(require('../src/app'));
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
async function request(path, role = 3, body) {
    return fetch(base + '/api/farmacia' + path, { method: body === undefined ? 'GET' : 'PATCH', body: body === undefined ? undefined : JSON.stringify(body), headers: role === null ? {} : {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt.sign({ id: 30, rol: role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
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
    assert.equal(options.select.usuario, undefined);
    assert.equal(options.select.direccion, undefined);
    assert.deepEqual(options.select.pagos, { select: { estado: true, simulacion: true } });
    assert.deepEqual(options.where.estado.in, ['APROBADA', 'PREPARANDO', 'LISTA']);
});
test('inventario filtra nombres sin interpolar SQL y no publica campos internos', async () => {
    assert.equal((await request('/inventario?buscar=aspirina')).status, 200);
    const { options } = calls.at(-1);
    assert.ok(options.where.AND[0].OR.some(condition => condition.nombre?.contains === 'aspirina' && condition.nombre.mode === 'insensitive'));
    assert.deepEqual(Object.keys(options.select).sort(), ['categoria', 'estado', 'id', 'nombre', 'presentacion', 'requiere_formula', 'stock']);
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

test('farmacia avanza unicamente estados consecutivos con pago aprobado y control de concurrencia', async () => {
    for (const [estadoActual, estado] of [['APROBADA', 'PREPARANDO'], ['PREPARANDO', 'LISTA'], ['LISTA', 'ENTREGADA']]) {
        const response = await request('/pedidos/9/estado', 3, { estadoActual, estado });
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).pedido, { id: 9, estado });
        const { options } = calls.at(-1);
        assert.deepEqual(options.where, { id: 9, estado: estadoActual, pagos: { some: { estado: 'APROBADO', simulacion: false } }, detalles: { some: {}, every: { medicamento: { requiere_formula: false } }, none: { medicamento: { requiere_formula: null } } } });
        assert.equal(options.data.estado, estado);
        assert.ok(options.data.updated_at instanceof Date);
    }
});

test('se rechazan saltos, retrocesos, cancelaciones, campos adicionales e identificadores invalidos', async () => {
    const bodies = [
        { estadoActual: 'APROBADA', estado: 'ENTREGADA' },
        { estadoActual: 'PREPARANDO', estado: 'APROBADA' },
        { estadoActual: 'LISTA', estado: 'CANCELADA' },
        { estadoActual: 'ENTREGADA', estado: 'APROBADA' },
        { estadoActual: 'toString', estado: 'PREPARANDO' },
        { estadoActual: 'APROBADA', estado: 'PREPARANDO', usuario_id: 99 }, {}
    ];
    for (const body of bodies) {
        const count = calls.length;
        assert.equal((await request('/pedidos/9/estado', 3, body)).status, 400);
        assert.equal(calls.length, count);
    }
    for (const id of ['0', '-1', '1.2', 'invalid', '9007199254740992']) {
        assert.equal((await request(`/pedidos/${id}/estado`, 3, { estadoActual: 'APROBADA', estado: 'PREPARANDO' })).status, 400);
    }
});

test('otra transicion concurrente responde 409 y otros roles nunca escriben', async () => {
    const body = { estadoActual: 'APROBADA', estado: 'PREPARANDO' };
    for (const role of [null, 1, 2, 4, 99]) {
        const count = calls.length;
        assert.equal((await request('/pedidos/9/estado', role, body)).status, role === null ? 401 : 403);
        assert.equal(calls.length, count);
    }
    updateCount = 0;
    try { assert.equal((await request('/pedidos/9/estado', 3, body)).status, 409); }
    finally { updateCount = 1; }
});
