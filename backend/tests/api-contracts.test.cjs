const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');
const jwt = require('jsonwebtoken');

const secretBefore = process.env.JWT_SECRET;
const TEST_SECRET = 'saludclick-api-contract-test-secret';
const formulaRepository = {
    crear: async () => 71,
    listarUsuario: async () => [{ id: 71, nombre: 'mock.pdf', estado: 'PENDIENTE' }],
    buscarPropia: async (_userId, id) => id === 72 ? {
        id: 72, nombre_archivo: 'mock.pdf', nombre_original: 'receta.pdf', tipo_mime: 'application/pdf'
    } : undefined,
    listarAdmin: async () => [{ id: 71, estado: 'PENDIENTE' }],
    actualizarEstado: async () => 1
};
const fakeModules = new Map([
    ['../services/auth.service', {
        register: async () => ({ ok: true, mensaje: 'Usuario registrado correctamente', id: 61 }),
        login: async () => ({ ok: true, mensaje: 'Inicio de sesión correcto', token: 'contract-token', usuario: { id: 61, rol: 2 } }),
        googleLogin: async credential => credential === 'reject' ? Promise.reject(new Error('provider failure')) : ({ ok: true, token: 'google-contract-token' }),
        solicitarRecuperacion: async correo => { if (correo === 'fail@example.test') throw new Error('mail failure'); },
        restablecerPassword: async (token, password) => { if (!token || !password) throw new Error('El enlace de recuperación es inválido o ya expiró.'); },
        profile: async id => ({ id, nombre: 'Usuario de prueba' }),
        updateProfile: async (id, data) => ({ id, ...data })
    }],
    ['../services/user.service', {
        profile: async id => ({ id, nombre: 'Usuario de prueba' }),
        updateProfile: async (id, data) => {
            const nombre = String(data.nombre || '').trim();
            const apellido = String(data.apellido || '').trim();
            if (!nombre || !apellido) throw new Error('Nombre y apellido son obligatorios.');
            return { id, nombre, apellido, telefono: String(data.telefono || '').trim(),
                tipoDocumento: String(data.tipoDocumento || '').trim(), ciudad: String(data.ciudad || '').trim() };
        }
    }],
    ['../services/order.service', {
        crearPedido: async () => ({ pedidoId: 81, total: 25, pago: { estado: 'APROBADO' } }),
        listarPedidos: async () => [{ id: 81 }],
        detallePedido: async (_userId, id) => id === 82 ? [{ id: 82 }] : [],
        eliminarPedido: async (_userId, id) => { if (id !== 81) throw new Error('Pedido no encontrado.'); }
    }],
    ['../services/health.service', { health: async () => ({ ok: true, fecha: 'test-clock' }) }],
    ['../repositories/medication.repository', { listar: async () => [{ id: 4, nombre: 'Mock medicamento' }] }],
    ['../repositories/dashboard.repository', {
        statsUsuario: async () => ({ pedidos: 0, formulas: 0 }),
        statsAdmin: async () => ({ usuarios: { total: 0 } })
    }],
    ['../repositories/admin.repository', {
        pedidos: async () => [{ id: 81 }],
        estadoPedido: async id => id === 81 ? 1 : 0
    }],
    ['../repositories/formula.repository', formulaRepository],
    ['fs/promises', {
        mkdir: async () => {},
        writeFile: async () => {},
        access: async () => {}
    }]
]);

let server;
let origin;
let originalLoad;
let originalSendFile;

function token(rol = 2, expiresIn = '1h') {
    return jwt.sign({ id: 12, correo: 'api-test@example.test', rol }, TEST_SECRET, { expiresIn });
}

async function call(path, { method = 'GET', role, auth = true, body } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${role === 'expired' ? token(2, -1) : token(role ?? 2)}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${origin}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    return { response, data };
}

before(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (fakeModules.has(request) && (request !== 'fs/promises' || /formula\.controller\.js$/.test(parent?.filename || ''))) {
            return fakeModules.get(request);
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    const app = require('../src/app');
    Module._load = originalLoad;
    const express = require('express');
    originalSendFile = express.response.sendFile;
    express.response.sendFile = function(_file) {
        this.status(200).type('application/pdf').send('mock-pdf');
    };
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    Module._load = originalLoad;
    if (originalSendFile) require('express').response.sendFile = originalSendFile;
    if (server) await new Promise(resolve => server.close(resolve));
    if (secretBefore === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secretBefore;
});

test('los 22 endpoints conservan método, respuesta y códigos HTTP', async t => {
    const cases = [
        ['GET', '/api/health/', undefined, 200, 'ok'],
        ['POST', '/api/auth/register', {}, 201, 'id'],
        ['POST', '/api/auth/login', {}, 200, 'token'],
        ['POST', '/api/auth/google', { credential: 'accepted' }, 200, 'token'],
        ['POST', '/api/auth/recuperar', { correo: 'user@example.test' }, 200, 'mensaje'],
        ['POST', '/api/auth/restablecer', { token: 'recovery-token', password: 'password' }, 200, 'mensaje'],
        ['GET', '/api/auth/profile', undefined, 200, 'usuario'],
        ['PUT', '/api/auth/profile', { nombre: 'Ana', apellido: 'Prueba' }, 200, 'usuario'],
        ['GET', '/api/pedidos/', undefined, 200, 'pedidos'],
        ['GET', '/api/pedidos/82', undefined, 200, 'pedido'],
        ['POST', '/api/pedidos/', {}, 201, 'pedidoId'],
        ['DELETE', '/api/pedidos/81', undefined, 200, 'mensaje'],
        ['GET', '/api/medicamentos/', undefined, 200, 'medicamentos'],
        ['GET', '/api/dashboard/me', undefined, 200, 'estadisticas'],
        ['GET', '/api/dashboard/admin', undefined, 200, 'estadisticas', 1],
        ['GET', '/api/formulas/admin/all', undefined, 200, 'formulas', 3],
        ['PATCH', '/api/formulas/admin/71', { estado: 'VALIDADA' }, 200, 'mensaje', 1],
        ['GET', '/api/formulas/', undefined, 200, 'formulas'],
        ['POST', '/api/formulas/', { nombre: 'mock.pdf', archivo: 'data:application/pdf;base64,JVBERi0xLjQ=' }, 201, 'formula'],
        ['GET', '/api/formulas/999', undefined, 404, 'mensaje'],
        ['GET', '/api/admin/pedidos', undefined, 200, 'pedidos', 3],
        ['PATCH', '/api/admin/pedidos/81', { estado: 'APROBADA' }, 200, 'mensaje', 1]
    ];
    for (const [method, path, body, status, key, role] of cases) {
        await t.test(`${method} ${path}`, async () => {
            const { response, data } = await call(path, { method, body, role });
            assert.equal(response.status, status);
            assert.ok(data && Object.hasOwn(data, key), `falta propiedad ${key}`);
            if (status !== 404) assert.equal(data.ok, true);
        });
    }
});

test('JWT ausente, inválido y vencido conservan respuestas 401', async t => {
    for (const [label, auth, authorization] of [
        ['ausente', false, undefined], ['inválido', true, 'Bearer no-es-jwt'], ['vencido', true, `Bearer ${token(2, -1)}`]
    ]) {
        await t.test(label, async () => {
            const headers = authorization ? { Authorization: authorization } : {};
            const response = await fetch(`${origin}/api/pedidos/`, { headers });
            assert.equal(response.status, 401);
            assert.deepEqual(await response.json(), {
                ok: false, mensaje: label === 'ausente' ? 'Token no proporcionado' : 'Token inválido'
            });
        });
    }
});

test('roles administrativos 1 y 3 pasan; usuario normal recibe 403', async t => {
    const adminPaths = ['/api/dashboard/admin', '/api/formulas/admin/all', '/api/admin/pedidos'];
    for (const role of [1, 3]) for (const path of adminPaths) {
        await t.test(`rol ${role}: ${path}`, async () => {
            const { response } = await call(path, { role });
            assert.equal(response.status, 200);
        });
    }
    for (const path of adminPaths) await t.test(`rol 2: ${path}`, async () => {
        const { response, data } = await call(path, { role: 2 });
        assert.equal(response.status, 403);
        assert.deepEqual(data, { ok: false, mensaje: 'Acceso restringido al personal administrativo.' });
    });
});

test('errores de controlador conservan sus status, campos y mensajes', async t => {
    const checks = [
        ['POST', '/api/auth/google', { credential: 'reject' }, 401, 'No se pudo iniciar sesión con Google'],
        ['POST', '/api/auth/recuperar', { correo: 'fail@example.test' }, 200, 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.', true],
        ['POST', '/api/auth/restablecer', {}, 400, 'El enlace de recuperación es inválido o ya expiró.'],
        ['PUT', '/api/auth/profile', { nombre: 'Solo nombre' }, 400, 'Nombre y apellido son obligatorios.'],
        ['GET', '/api/pedidos/0', undefined, 400, 'Pedido inválido.'],
        ['GET', '/api/pedidos/83', undefined, 404, 'Pedido no encontrado.'],
        ['DELETE', '/api/pedidos/83', undefined, 404, 'Pedido no encontrado.'],
        ['PATCH', '/api/formulas/admin/71', { estado: 'DESCONOCIDA' }, 400, 'Estado inválido.'],
        ['POST', '/api/formulas/', { nombre: 'malware.bin', archivo: 'data:application/octet-stream;base64,AA==' }, 400, 'Solo se permiten PDF, JPG, PNG o WEBP.'],
        ['GET', '/api/formulas/0', undefined, 400, 'Fórmula inválida.'],
        ['GET', '/api/formulas/999', undefined, 404, 'Fórmula no encontrada.'],
        ['PATCH', '/api/admin/pedidos/1', { estado: 'DESCONOCIDA' }, 400, 'Datos inválidos.'],
        ['PATCH', '/api/admin/pedidos/999', { estado: 'APROBADA' }, 404, 'Pedido no encontrado.']
    ];
    for (const [method, path, body, status, message, success = false] of checks) await t.test(`${method} ${path}`, async () => {
        const { response, data } = await call(path, { method, body, role: path.includes('/admin') ? 1 : 2 });
        assert.equal(response.status, status);
        assert.deepEqual(data, { ok: success, mensaje: message });
    });
});

test('lectura de fórmula privada limita propietario y no requiere filesystem real', async t => {
    await t.test('fórmula propia entrega contenido binario tras verificar la sesión', async () => {
        const { response } = await call('/api/formulas/72');
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /^application\/pdf(?:;|$)/);
        assert.equal(await response.text(), 'mock-pdf');
    });
    await t.test('fórmula ajena/inexistente no se entrega', async () => {
        const { response, data } = await call('/api/formulas/73');
        assert.equal(response.status, 404);
        assert.deepEqual(data, { ok: false, mensaje: 'Fórmula no encontrada.' });
    });
    await t.test('sin JWT no se consulta el recurso', async () => {
        const { response, data } = await call('/api/formulas/72', { auth: false });
        assert.equal(response.status, 401);
        assert.equal(data.mensaje, 'Token no proporcionado');
    });
});
