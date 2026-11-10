const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const Module = require('node:module');
const bcrypt = require('bcrypt');

const TEST_SECRET = 'saludclick-admin-contract-test-secret';
const previousSecret = process.env.JWT_SECRET;
const originalLoad = Module._load;
const originalConsoleError = console.error;
const repositoryCalls = [];
const createdAccounts = [];
const existingEmails = new Set();
const existingRoles = new Set([2, 3, 4]);
let changedRows = 1;
let listError;
let updateError;
let createAccountError;
const repository = {
    pedidos: async () => {
        if (listError) throw listError;
        return [{ id: 41, estado: 'PENDIENTE' }];
    },
    listarCuentas: async () => [
        { id: 61, nombre: 'Ana', correo: 'ana@example.test', rol_id: 2, estado: 'ACTIVO' }
    ],
    estadoPedido: async (id, estado) => {
        repositoryCalls.push({ id, estado });
        if (updateError) throw updateError;
        return changedRows;
    },
    buscarCuentaPorCorreo: async correo => existingEmails.has(correo) ? { id: 99 } : null,
    buscarRol: async id => existingRoles.has(id) ? { id } : null,
    crearCuenta: async cuenta => {
        if (createAccountError) throw createAccountError;
        createdAccounts.push(cuenta);
        const { password, ...cuentaSegura } = cuenta;
        return {
            id: 100 + createdAccounts.length,
            ...cuentaSegura,
            created_at: new Date('2026-11-10T12:00:00.000Z')
        };
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
    createAccountError = undefined;
    createdAccounts.length = 0;
    existingEmails.clear();
    existingRoles.clear();
    for (const role of [2, 3, 4]) existingRoles.add(role);
    repositoryCalls.length = 0;
});

test('GET /api/admin/pedidos conserva JSON y admite exclusivamente al administrador', async t => {
    await t.test('rol administrador', async () => {
        const { response, data } = await request('/api/admin/pedidos', { role: 1 });
        assert.equal(response.status, 200);
        assert.deepEqual(data, { ok: true, pedidos: [{ id: 41, estado: 'PENDIENTE' }] });
    });
    for (const role of [2, 3, 4]) await t.test(`rol no administrativo ${role}`, async () => {
        const { response, data } = await request('/api/admin/pedidos', { role });
        assert.equal(response.status, 403);
        assert.deepEqual(data, { ok: false, mensaje: 'Acceso restringido al personal administrativo.' });
    });
    await t.test('sin JWT', async () => {
        const { response, data } = await request('/api/admin/pedidos', { role: null });
        assert.equal(response.status, 401);
        assert.deepEqual(data, { ok: false, mensaje: 'Token no proporcionado' });
    });
});

test('POST /api/admin/cuentas crea solo los roles de paciente, farmacia y EPS', async t => {
    for (const [rol_id, etiqueta] of [[2, 'Paciente'], [3, 'Farmacia'], [4, 'EPS']]) {
        await t.test(etiqueta, async () => {
            const correo = `  Cuenta-${rol_id}@Example.Test `;
            const { response, data } = await request('/api/admin/cuentas', {
                method: 'POST',
                role: 1,
                body: {
                    nombre: '  Ana   María Pérez  ',
                    correo,
                    password: 'clave-segura-123',
                    rol_id
                }
            });

            assert.equal(response.status, 201);
            assert.deepEqual(data.cuenta, {
                id: 100 + createdAccounts.length,
                nombre: 'Ana',
                apellido: 'María Pérez',
                correo: correo.trim().toLowerCase(),
                rol_id,
                estado: 'ACTIVO',
                created_at: '2026-11-10T12:00:00.000Z'
            });
            assert.equal(Object.hasOwn(data.cuenta, 'password'), false);

            const guardada = createdAccounts.at(-1);
            assert.equal(guardada.estado, 'ACTIVO');
            assert.equal(guardada.rol_id, rol_id);
            assert.match(guardada.password, /^\$2[aby]\$/);
            assert.equal(await bcrypt.compare('clave-segura-123', guardada.password), true);
        });
    }
});

test('consultar y eliminar cuentas requieren el JWT exclusivo del administrador', async t => {
    const admin = await request('/api/admin/cuentas', { role: 1 });
    assert.equal(admin.response.status, 200);
    assert.equal(admin.data.cuentas[0].rol_id, 2);

    for (const path of ['/api/admin/cuentas', '/api/admin/cuentas/61']) {
        const method = path.endsWith('/61') ? 'DELETE' : 'GET';
        for (const role of [null, 2, 3, 4]) {
            await t.test(`${method} ${path}, rol ${role ?? 'sin JWT'}`, async () => {
                const { response } = await request(path, { method, role });
                assert.equal(response.status, role === null ? 401 : 403);
            });
        }
    }
});

test('crear cuentas exige administrador y JWT', async t => {
    const beforeCount = createdAccounts.length;
    for (const role of [null, 2, 3, 4]) {
        await t.test(role === null ? 'sin JWT' : `rol ${role}`, async () => {
            const { response } = await request('/api/admin/cuentas', {
                method: 'POST',
                role,
                body: {
                    nombre: 'Ana Pérez',
                    correo: `denied-${role}@example.test`,
                    password: 'clave-segura-123',
                    rol_id: 2
                }
            });
            assert.equal(response.status, role === null ? 401 : 403);
        });
    }
    assert.equal(createdAccounts.length, beforeCount);
});

test('crear cuentas rechaza datos inválidos, rol administrador, duplicados y roles ausentes', async t => {
    const validBody = {
        nombre: 'Ana Pérez',
        correo: 'ana@example.test',
        password: 'clave-segura-123',
        rol_id: 2
    };

    for (const [label, body] of [
        ['nombre vacío', { ...validBody, nombre: '  ' }],
        ['correo vacío', { ...validBody, correo: ' ' }],
        ['correo inválido', { ...validBody, correo: 'no-es-correo' }],
        ['contraseña corta', { ...validBody, password: '123' }],
        ['rol administrador', { ...validBody, rol_id: 1 }],
        ['rol desconocido', { ...validBody, rol_id: 9 }]
    ]) {
        await t.test(label, async () => {
            const { response, data } = await request('/api/admin/cuentas', {
                method: 'POST',
                role: 1,
                body
            });
            assert.equal(response.status, 400);
            assert.equal(data.ok, false);
        });
    }

    existingEmails.add(validBody.correo);
    let result = await request('/api/admin/cuentas', {
        method: 'POST',
        role: 1,
        body: validBody
    });
    assert.equal(result.response.status, 409);

    existingEmails.clear();
    existingRoles.delete(4);
    result = await request('/api/admin/cuentas', {
        method: 'POST',
        role: 1,
        body: { ...validBody, correo: 'eps@example.test', rol_id: 4 }
    });
    assert.equal(result.response.status, 409);
    assert.match(result.data.mensaje, /rol seleccionado no está disponible/i);
});

test('el endpoint traduce una colisión concurrente de correo sin exponer datos', async () => {
    createAccountError = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    const { response, data } = await request('/api/admin/cuentas', {
        method: 'POST',
        role: 1,
        body: {
            nombre: 'Ana Pérez',
            correo: 'concurrente@example.test',
            password: 'clave-segura-123',
            rol_id: 2
        }
    });
    assert.equal(response.status, 409);
    assert.deepEqual(data, {
        ok: false,
        mensaje: 'Ya existe una cuenta con ese correo electrónico.'
    });
    assert.equal(JSON.stringify(data).includes('clave-segura-123'), false);
});

test('PATCH /api/admin/pedidos/:id conserva cada estado admitido y su respuesta', async t => {
    for (const estado of ['PENDIENTE', 'APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA', 'CANCELADA']) {
        await t.test(estado, async () => {
            const beforeCount = repositoryCalls.length;
            const { response, data } = await request('/api/admin/pedidos/42', {
                method: 'PATCH', role: 1, body: { estado }
            });
            assert.equal(response.status, 200);
            assert.deepEqual(data, { ok: true, mensaje: 'Estado del pedido actualizado.' });
            assert.deepEqual(repositoryCalls[beforeCount], { id: 42, estado });
        });
    }
    await t.test('farmacia no puede actualizar pedidos administrativos', async () => {
        const beforeCount = repositoryCalls.length;
        const { response, data } = await request('/api/admin/pedidos/42', {
            method: 'PATCH', role: 3, body: { estado: 'APROBADA' }
        });
        assert.equal(response.status, 403);
        assert.deepEqual(data, {
            ok: false,
            mensaje: 'Acceso restringido al personal administrativo.'
        });
        assert.equal(repositoryCalls.length, beforeCount);
    });
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
        const { response, data } = await request('/api/admin/pedidos', { role: 1 });
        assert.equal(response.status, 500);
        assert.deepEqual(data, { ok: false, mensaje: 'No se pudieron cargar los pedidos.' });
        listError = undefined;
    });
    await t.test('error al actualizar', async () => {
        updateError = new Error('simulated update failure');
        const { response, data } = await request('/api/admin/pedidos/42', {
            method: 'PATCH', role: 1, body: { estado: 'APROBADA' }
        });
        assert.equal(response.status, 400);
        assert.deepEqual(data, { ok: false, mensaje: 'simulated update failure' });
        updateError = undefined;
    });
});
