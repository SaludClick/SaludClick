const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const Module = require('node:module');

const TEST_SECRET = 'saludclick-admin-contract-test-secret';
const previousSecret = process.env.JWT_SECRET;
const originalLoad = Module._load;
const originalConsoleError = console.error;
const repositoryCalls = [];
let changedRows = 1;
let listError;
let updateError;
const repository = {
    pedidos: async () => {
        if (listError) throw listError;
        return [{ id: 41, estado: 'PENDIENTE' }];
    },
    estadoPedido: async (id, estado) => {
        repositoryCalls.push({ id, estado });
        if (updateError) throw updateError;
        return changedRows;
    }
};

let server;
let origin;

function auth(role) {
    return `Bearer ${jwt.sign({ id: 17, correo: 'admin-test@example.test', rol: role }, TEST_SECRET, { expiresIn: '1h' })}`;
}

async function request(path, { method = 'GET', role = 1, headers = {}, body } = {}) {
    const requestHeaders = { ...headers };
    if (role !== null) requestHeaders.Authorization = auth(role);
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    const response = await fetch(`${origin}${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { response, data: await response.json() };
}

before(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    console.error = () => {};
    Module._load = function(request, parent, isMain) {
        if (request === '../repositories/admin.repository' && /admin\.service\.js$/.test(parent?.filename || '')) return repository;
        return originalLoad.call(this, request, parent, isMain);
    };
    const adminRoutes = require('../src/routes/admin.routes');
    Module._load = originalLoad;
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    Module._load = originalLoad;
    console.error = originalConsoleError;
    if (server) await new Promise(resolve => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    changedRows = 1;
    listError = undefined;
    updateError = undefined;
    repositoryCalls.length = 0;
});

test('GET /api/admin/pedidos conserva JSON y admite exclusivamente roles 1 y 3', async t => {
    for (const role of [1, 3]) await t.test(`rol ${role}`, async () => {
        const { response, data } = await request('/api/admin/pedidos', { role });
        assert.equal(response.status, 200);
        assert.deepEqual(data, { ok: true, pedidos: [{ id: 41, estado: 'PENDIENTE' }] });
    });
    await t.test('rol normal', async () => {
        const { response, data } = await request('/api/admin/pedidos', { role: 2 });
        assert.equal(response.status, 403);
        assert.deepEqual(data, { ok: false, mensaje: 'Acceso restringido al personal administrativo.' });
    });
    await t.test('sin JWT', async () => {
        const { response, data } = await request('/api/admin/pedidos', { role: null });
        assert.equal(response.status, 401);
        assert.deepEqual(data, { ok: false, mensaje: 'Token no proporcionado' });
    });
});

test('PATCH /api/admin/pedidos/:id conserva cada estado admitido y su respuesta', async t => {
    for (const estado of ['PENDIENTE', 'APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA', 'CANCELADA']) {
        await t.test(estado, async () => {
            const beforeCount = repositoryCalls.length;
            const { response, data } = await request('/api/admin/pedidos/42', {
                method: 'PATCH', role: 3, body: { estado }
            });
            assert.equal(response.status, 200);
            assert.deepEqual(data, { ok: true, mensaje: 'Estado del pedido actualizado.' });
            assert.deepEqual(repositoryCalls[beforeCount], { id: 42, estado });
        });
    }
});

test('entradas inválidas conservan 400 y no persisten cambios', async t => {
    const invalid = [
        ['/api/admin/pedidos/no-es-id', { estado: 'APROBADA' }],
        ['/api/admin/pedidos/42', { estado: 'DESCONOCIDO' }],
        ['/api/admin/pedidos/42', {}]
    ];
    for (const [path, body] of invalid) await t.test(`${path} ${JSON.stringify(body)}`, async () => {
        const beforeCount = repositoryCalls.length;
        const { response, data } = await request(path, { method: 'PATCH', role: 1, body });
        assert.equal(response.status, 400);
        assert.deepEqual(data, { ok: false, mensaje: 'Datos inválidos.' });
        assert.equal(repositoryCalls.length, beforeCount);
    });
});

test('no encontrado y fallos de persistencia conservan las respuestas actuales', async t => {
    await t.test('UPDATE sin filas afectadas', async () => {
        changedRows = 0;
        const { response, data } = await request('/api/admin/pedidos/42', {
            method: 'PATCH', role: 1, body: { estado: 'CANCELADA' }
        });
        assert.equal(response.status, 404);
        assert.deepEqual(data, { ok: false, mensaje: 'Pedido no encontrado.' });
        changedRows = 1;
    });
    await t.test('error al listar', async () => {
        listError = new Error('simulated database failure');
        const { response, data } = await request('/api/admin/pedidos', { role: 3 });
        assert.equal(response.status, 500);
        assert.deepEqual(data, { ok: false, mensaje: 'No se pudieron cargar los pedidos.' });
        listError = undefined;
    });
    await t.test('error al actualizar', async () => {
        updateError = new Error('simulated update failure');
        const { response, data } = await request('/api/admin/pedidos/42', {
            method: 'PATCH', role: 3, body: { estado: 'APROBADA' }
        });
        assert.equal(response.status, 400);
        assert.deepEqual(data, { ok: false, mensaje: 'simulated update failure' });
        updateError = undefined;
    });
});
