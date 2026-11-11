const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');
const jwt = require('jsonwebtoken');
const { createRecaptchaMiddleware } = require('../src/middlewares/recaptcha.middleware');

const secretBefore = process.env.JWT_SECRET;
const TEST_SECRET = 'saludclick-api-contract-test-secret';
const TEST_RECAPTCHA_SECRET = 'test-only-recaptcha-secret';
const ORDER_IDEMPOTENCY_KEY = 'de305d54-75b4-431b-adb2-eb6b9e546014';
const orderIdempotencyKeys = [];
const registerCalls = [];
const serviceFailures = {};
const repositoryFailures = {};
const testRecaptchaMiddleware = createRecaptchaMiddleware({
    getSecret: () => TEST_RECAPTCHA_SECRET,
    getAllowedHostnames: () => 'localhost',
    fetchImpl: async (url, options) => {
        assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
        assert.equal(options.method, 'POST');
        assert.equal(
            new URLSearchParams(options.body).get('secret'),
            TEST_RECAPTCHA_SECRET
        );
        assert.equal(
            new URLSearchParams(options.body).get('response'),
            'test-recaptcha-token'
        );
        return {
            ok: true,
            json: async () => ({ success: true, challenge_ts: new Date().toISOString(), hostname: 'localhost' })
        };
    }
});
const formulaRepository = {
    crear: async () => {
        if (repositoryFailures.formulaCrear) throw repositoryFailures.formulaCrear;
        return 71;
    },
    listarUsuario: async () => {
        if (repositoryFailures.formulaListar) throw repositoryFailures.formulaListar;
        return [{ id: 71, nombre: 'mock.pdf', estado: 'PENDIENTE' }];
    },
    buscarPropia: async (_userId, id) => {
        if (repositoryFailures.formulaBuscar) throw repositoryFailures.formulaBuscar;
        return id === 72 ? {
        id: 72, nombre_archivo: 'mock.pdf', nombre_original: 'receta.pdf', tipo_mime: 'application/pdf'
        } : undefined;
    },
    listarAdmin: async () => {
        if (repositoryFailures.formulaListarAdmin) throw repositoryFailures.formulaListarAdmin;
        return [{ id: 71, estado: 'PENDIENTE' }];
    },
    actualizarEstado: async () => {
        if (repositoryFailures.formulaEstado) throw repositoryFailures.formulaEstado;
        return 1;
    }
};
const dashboardRepository = {
    statsUsuario: async () => {
        if (repositoryFailures.dashboardUsuario) throw repositoryFailures.dashboardUsuario;
        return { pedidos: 0, formulas: 0 };
    },
    statsAdmin: async () => {
        if (repositoryFailures.dashboardAdmin) throw repositoryFailures.dashboardAdmin;
        return { usuarios: { total: 0 } };
    }
};
const fakeModules = new Map([
    ['../services/auth.service', {
        register: async () => {
            registerCalls.push(true);
            if (serviceFailures.register) throw serviceFailures.register;
            return { ok: true, mensaje: 'Usuario registrado correctamente', id: 61 };
        },
        login: async () => {
            if (serviceFailures.login) throw serviceFailures.login;
            return { ok: true, mensaje: 'Inicio de sesión correcto', token: 'contract-token', usuario: { id: 61, rol: 2 } };
        },
        googleLogin: async credential => credential === 'reject' ? Promise.reject(new Error('provider failure')) : ({ ok: true, token: 'google-contract-token' }),
        solicitarRecuperacion: async correo => { if (correo === 'fail@example.test') throw new Error('mail failure'); },
        restablecerPassword: async (token, password) => {
            if (serviceFailures.restablecerPassword) throw serviceFailures.restablecerPassword;
            if (!token || !password) throw new Error('El enlace de recuperación es inválido o ya expiró.');
        },
        profile: async id => ({ id, nombre: 'Usuario de prueba' }),
        updateProfile: async (id, data) => ({ id, ...data })
    }],
    ['../middlewares/recaptcha.middleware', {
        verificarRecaptcha: testRecaptchaMiddleware
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
        crearPedido: async (_userId, _body, key) => {
            if (serviceFailures.crearPedido) throw serviceFailures.crearPedido;
            orderIdempotencyKeys.push(key);
            if (key === 'de305d54-75b4-431b-adb2-eb6b9e546015') {
                throw Object.assign(new Error('La clave Idempotency-Key ya fue utilizada con otros datos.'), { status: 409 });
            }
            return { solicitudId: 81, total: 25, pago: { estado: 'APROBADO' } };
        },
        listarPedidos: async () => {
            if (serviceFailures.listarPedidos) throw serviceFailures.listarPedidos;
            return [{ id: 81 }];
        },
        detallePedido: async (_userId, id) => {
            if (serviceFailures.detallePedido) throw serviceFailures.detallePedido;
            return id === 82 ? [{ id: 82 }] : [];
        },
        eliminarPedido: async (_userId, id) => {
            if (serviceFailures.eliminarPedido) throw serviceFailures.eliminarPedido;
            if (id !== 81) throw new Error('Pedido no encontrado.');
        }
    }],
    ['../services/health.service', { health: async () => ({ ok: true, fecha: 'test-clock' }) }],
    ['../repositories/medication.repository', {
        listar: async () => [
            { id: 4, nombre: 'Medicamento disponible', categoria: 'Prueba', descripcion: '', estado: 'DISPONIBLE' },
            { id: 5, nombre: 'Medicamento no disponible', categoria: 'Prueba', descripcion: '', estado: 'AGOTADO' }
        ]
    }],
    ['../repositories/dashboard.repository', dashboardRepository],
    ['../repositories/admin.repository', {
        pedidos: async () => [{ id: 81 }],
        estadoPedido: async id => id === 81 ? 1 : 0
    }],
    ['../repositories/formula.repository', formulaRepository],
    ['fs/promises', {
        mkdir: async () => {},
        writeFile: async () => {},
        access: async () => {
            if (repositoryFailures.fileAccess) throw repositoryFailures.fileAccess;
        }
    }]
]);

let server;
let origin;
let originalLoad;
let originalSendFile;

function token(rol = 2, expiresIn = '1h') {
    return jwt.sign({ id: 12, correo: 'api-test@example.test', rol }, TEST_SECRET, { expiresIn });
}

async function call(path, { method = 'GET', role, auth = true, body, idempotencyKey } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${role === 'expired' ? token(2, -1) : token(role ?? 2)}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method === 'POST' && path === '/api/pedidos/') {
        const key = idempotencyKey === false
            ? null
            : idempotencyKey || ORDER_IDEMPOTENCY_KEY;
        if (key) headers['Idempotency-Key'] = key;
    }
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

test('los 24 endpoints conservan método, respuesta y códigos HTTP', async t => {
    const cases = [
        ['GET', '/api/health/', undefined, 200, 'ok'],
        ['POST', '/api/auth/register', {}, 201, 'id', 1],
        ['POST', '/api/auth/login', { recaptchaToken: 'test-recaptcha-token' }, 200, 'token'],
        ['POST', '/api/auth/google', { credential: 'accepted', recaptchaToken: 'test-recaptcha-token' }, 200, 'token'],
        ['POST', '/api/auth/recuperar', { correo: 'user@example.test' }, 200, 'mensaje'],
        ['POST', '/api/auth/restablecer', { token: 'recovery-token', password: 'password' }, 200, 'mensaje'],
        ['GET', '/api/auth/profile', undefined, 200, 'usuario'],
        ['PUT', '/api/auth/profile', { nombre: 'Ana', apellido: 'Prueba' }, 200, 'usuario'],
        ['GET', '/api/pedidos/', undefined, 200, 'pedidos'],
        ['GET', '/api/pedidos/82', undefined, 200, 'pedido'],
        ['POST', '/api/pedidos/', {}, 201, 'solicitudId'],
        ['DELETE', '/api/pedidos/81', undefined, 200, 'mensaje'],
        ['GET', '/api/medicamentos/', undefined, 200, 'medicamentos'],
        ['GET', '/api/dashboard/me', undefined, 200, 'estadisticas'],
        ['GET', '/api/dashboard/admin', undefined, 200, 'estadisticas', 1],
        ['GET', '/api/farmacia/verificar-acceso', undefined, 200, 'mensaje', 3],
        ['GET', '/api/farmacia/dashboard', undefined, 200, 'estadisticas', 3],
        ['GET', '/api/eps/verificar-acceso', undefined, 200, 'mensaje', 4],
        ['GET', '/api/formulas/admin/all', undefined, 200, 'formulas', 1],
        ['PATCH', '/api/formulas/admin/71', { estado: 'VALIDADA' }, 200, 'mensaje', 1],
        ['GET', '/api/formulas/', undefined, 200, 'formulas'],
        ['POST', '/api/formulas/', { nombre: 'mock.pdf', archivo: 'data:application/pdf;base64,JVBERi0xLjQ=' }, 201, 'formula'],
        ['GET', '/api/formulas/999', undefined, 404, 'mensaje'],
        ['GET', '/api/admin/pedidos', undefined, 200, 'pedidos', 1],
        ['PATCH', '/api/admin/pedidos/81', { estado: 'APROBADA' }, 200, 'mensaje', 1]
    ];
    for (const [method, path, body, status, key, role] of cases) {
        await t.test(`${method} ${path}`, async () => {
            const { response, data } = await call(path, { method, body, role });
            assert.equal(response.status, status);
            assert.ok(data && Object.hasOwn(data, key), `falta propiedad ${key}`);
            if (status !== 404) assert.equal(data.ok, true);
            if (method === 'POST' && path === '/api/pedidos/') {
                assert.equal(orderIdempotencyKeys.at(-1), ORDER_IDEMPOTENCY_KEY);
            }
        });
    }
});

test('crear pedido exige UUID idempotente y rechaza conflictos sin crear otro pedido', async t => {
    await t.test('sin clave', async () => {
        const before = orderIdempotencyKeys.length;
        const { response, data } = await call('/api/pedidos/', {
            method: 'POST', body: {}, idempotencyKey: false
        });
        assert.equal(response.status, 400);
        assert.equal(data.mensaje, 'La clave Idempotency-Key debe ser un UUID válido.');
        assert.equal(orderIdempotencyKeys.length, before);
    });

    await t.test('clave inválida', async () => {
        const { response, data } = await call('/api/pedidos/', {
            method: 'POST', body: {}, idempotencyKey: 'not-a-uuid'
        });
        assert.equal(response.status, 400);
        assert.equal(data.ok, false);
    });

    await t.test('clave previamente usada con otros datos', async () => {
        const { response, data } = await call('/api/pedidos/', {
            method: 'POST', body: {},
            idempotencyKey: 'de305d54-75b4-431b-adb2-eb6b9e546015'
        });
        assert.equal(response.status, 409);
        assert.match(data.mensaje, /otros datos/);
    });
});

test('login vacío y JSON malformado responden 400 sin detalles internos', async () => {
    const empty = await call('/api/auth/login', { method: 'POST', auth: false });
    assert.equal(empty.response.status, 400);
    assert.deepEqual(empty.data, {
        ok: false,
        mensaje: 'Debes completar la validación de seguridad.'
    });

    const malformed = await fetch(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
    });
    assert.equal(malformed.status, 400);
    assert.match(malformed.headers.get('content-type') || '', /application\/json/);
    const data = await malformed.json();
    assert.deepEqual(data, { ok: false, mensaje: 'El cuerpo JSON no es válido.' });
    assert.doesNotMatch(JSON.stringify(data), /SyntaxError|stack|body-parser/i);
});

test('el registro requiere administrador y sigue creando cuentas de forma protegida', async t => {
    const previousCalls = registerCalls.length;
    const { response: anonymous } = await call('/api/auth/register', {
        method: 'POST',
        auth: false,
        body: {}
    });
    assert.equal(anonymous.status, 401);

    for (const role of [2, 3, 4]) {
        await t.test(`rol ${role} no puede registrar cuentas`, async () => {
            const { response } = await call('/api/auth/register', {
                method: 'POST',
                role,
                body: {}
            });
            assert.equal(response.status, 403);
        });
    }

    assert.equal(registerCalls.length, previousCalls);
    const { response, data } = await call('/api/auth/register', {
        method: 'POST',
        role: 1,
        body: {}
    });
    assert.equal(response.status, 201);
    assert.deepEqual(data, {
        ok: true,
        mensaje: 'Usuario registrado correctamente',
        id: 61
    });
    assert.equal(registerCalls.length, previousCalls + 1);
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

test('solo el administrador accede a las rutas administrativas', async t => {
    const adminPaths = ['/api/dashboard/admin', '/api/formulas/admin/all', '/api/admin/pedidos'];
    for (const path of adminPaths) await t.test(`administrador: ${path}`, async () => {
        const { response } = await call(path, { role: 1 });
        assert.equal(response.status, 200);
    });
    for (const role of [2, 3, 4]) for (const path of adminPaths) {
        await t.test(`rol ${role}: ${path}`, async () => {
            const { response, data } = await call(path, { role });
            assert.equal(response.status, 403);
            assert.deepEqual(data, { ok: false, mensaje: 'Acceso restringido al personal administrativo.' });
        });
    }
});

test('las rutas de farmacia y paciente respetan roles separados', async t => {
    for (const [path, allowedRole] of [
        ['/api/farmacia/verificar-acceso', 3],
        ['/api/farmacia/dashboard', 3],
        ['/api/eps/verificar-acceso', 4]
    ]) {
        await t.test(`rol autorizado ${allowedRole}: ${path}`, async () => {
            const { response, data } = await call(path, { role: allowedRole });
            assert.equal(response.status, 200);
            if (path === '/api/farmacia/dashboard') {
                assert.equal(data.ok, true);
                assert.deepEqual(data.estadisticas, {
                    totalMedicamentos: 2,
                    medicamentosDisponibles: 1
                });
            } else {
                assert.deepEqual(data, {
                    ok: true,
                    mensaje: path.includes('/eps/')
                        ? 'Acceso autorizado al panel EPS.'
                        : 'Acceso autorizado al panel de farmacia.'
                });
            }
        });
        for (const role of [1, 2, 3, 4].filter(value => value !== allowedRole)) {
            await t.test(`rol ${role} rechazado: ${path}`, async () => {
                const { response, data } = await call(path, { role });
                assert.equal(response.status, 403);
                assert.equal(data.ok, false);
            });
        }


    }

    for (const path of ['/api/pedidos/', '/api/dashboard/me', '/api/formulas/']) {
        for (const role of [1, 3, 4]) await t.test(`rol ${role}: ${path}`, async () => {
            const { response, data } = await call(path, { role });
            assert.equal(response.status, 403);
            assert.deepEqual(data, { ok: false, mensaje: 'Acceso restringido a pacientes.' });
        });
    }
});

test('los endpoints de farmacia y EPS exigen un JWT válido', async t => {
    for (const path of ['/api/farmacia/verificar-acceso', '/api/farmacia/dashboard', '/api/eps/verificar-acceso']) {
        await t.test(`sin token: ${path}`, async () => {
            const { response, data } = await call(path, { auth: false });
            assert.equal(response.status, 401);
            assert.deepEqual(data, { ok: false, mensaje: 'Token no proporcionado' });
        });
        await t.test(`token inválido: ${path}`, async () => {
            const response = await fetch(`${origin}${path}`, {
                headers: { Authorization: 'Bearer no-es-jwt' }
            });
            assert.equal(response.status, 401);
            assert.deepEqual(await response.json(), { ok: false, mensaje: 'Token inválido' });
        });
    }
});

test('errores de controlador conservan sus status, campos y mensajes', async t => {
    const checks = [
        ['POST', '/api/auth/google', { credential: 'reject', recaptchaToken: 'test-recaptcha-token' }, 401, 'No se pudo iniciar sesión con Google'],
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

test('controladores de auth y pedidos cubren errores del servicio sin filtrar detalles', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        serviceFailures.register = new Error('registro fallido');
        let result = await call('/api/auth/register', { method: 'POST', role: 1, body: {} });
        assert.equal(result.response.status, 400);
        assert.deepEqual(result.data, { ok: false, mensaje: 'registro fallido' });
        delete serviceFailures.register;

        serviceFailures.login = new Error('login fallido');
        result = await call('/api/auth/login', {
            method: 'POST', body: { recaptchaToken: 'test-recaptcha-token' }
        });
        assert.equal(result.response.status, 400);
        assert.deepEqual(result.data, { ok: false, mensaje: 'login fallido' });
        delete serviceFailures.login;

        result = await call('/api/auth/google', {
            method: 'POST', body: { recaptchaToken: 'test-recaptcha-token' }
        });
        assert.equal(result.response.status, 400);
        assert.equal(result.data.mensaje, 'Token de Google requerido');
        result = await call('/api/auth/recuperar', { method: 'POST', body: {} });
        assert.equal(result.response.status, 200);
        assert.equal(result.data.ok, true);

        serviceFailures.restablecerPassword = new Error('reset fallido');
        result = await call('/api/auth/restablecer', {
            method: 'POST', body: { token: 'valid-shape', password: 'valid-shape' }
        });
        assert.equal(result.response.status, 400);
        assert.deepEqual(result.data, { ok: false, mensaje: 'reset fallido' });
        delete serviceFailures.restablecerPassword;

        serviceFailures.crearPedido = Object.assign(new Error('pedido inválido'), { status: 400 });
        result = await call('/api/pedidos/', { method: 'POST', body: {} });
        assert.equal(result.response.status, 400);
        assert.equal(result.data.mensaje, 'pedido inválido');
        serviceFailures.crearPedido = new Error('backend failure');
        result = await call('/api/pedidos/', { method: 'POST', body: {} });
        assert.equal(result.response.status, 500);
        assert.deepEqual(result.data, { ok: false, mensaje: 'No se pudo crear el pedido.' });
        delete serviceFailures.crearPedido;

        serviceFailures.listarPedidos = new Error('storage');
        result = await call('/api/pedidos/');
        assert.equal(result.response.status, 500);
        assert.deepEqual(result.data, { ok: false, mensaje: 'No se pudo consultar el historial.' });
        delete serviceFailures.listarPedidos;

        serviceFailures.detallePedido = new Error('storage');
        result = await call('/api/pedidos/82');
        assert.equal(result.response.status, 500);
        assert.deepEqual(result.data, { ok: false, mensaje: 'No se pudo consultar el pedido.' });
        delete serviceFailures.detallePedido;

        serviceFailures.eliminarPedido = new Error('storage');
        result = await call('/api/pedidos/81', { method: 'DELETE' });
        assert.equal(result.response.status, 500);
        assert.deepEqual(result.data, { ok: false, mensaje: 'No se pudo eliminar el pedido.' });
    } finally {
        for (const key of Object.keys(serviceFailures)) delete serviceFailures[key];
        console.error = originalConsoleError;
    }
});

test('lectura de fórmula privada limita propietario y no requiere filesystem real', async t => {
    await t.test('fórmula propia entrega contenido binario tras verificar la sesión', async () => {
        const { response } = await call('/api/formulas/72');
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /^application\/pdf(?:;|$)/);
        assert.equal(await response.text(), 'mock-pdf');
    });

    test('carga de fórmulas valida contenidos admitidos y falla de forma segura', async () => {
        const originalConsoleError = console.error;
        console.error = () => {};
        const submit = archivo => call('/api/formulas/', {
            method: 'POST', body: { nombre: 'prueba', archivo }
        });
        const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
        try {
            for (const [mime, bytes] of [
                ['image/jpeg', [0xff, 0xd8, 0xff, 0x00]],
                ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
                ['image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]]
            ]) {
                const result = await submit(dataUrl(mime, bytes));
                assert.equal(result.response.status, 201);
                assert.equal(result.data.formula.estado, 'PENDIENTE');
            }

            for (const archivo of [
                'not-data-url',
                dataUrl('application/pdf', [0x00, 0x01]),
                dataUrl('application/pdf', [])
            ]) {
                const result = await submit(archivo);
                assert.equal(result.response.status, 400);
            }

            const missing = await call('/api/formulas/', { method: 'POST', body: { nombre: 'faltante' } });
            assert.equal(missing.response.status, 400);

            repositoryFailures.formulaCrear = new Error('repository unavailable');
            const failedCreate = await submit(dataUrl('application/pdf', Buffer.from('%PDF-1.4')));
            assert.equal(failedCreate.response.status, 400);
            delete repositoryFailures.formulaCrear;
        } finally {
            delete repositoryFailures.formulaCrear;
            console.error = originalConsoleError;
        }
    });

    test('listados y lectura de fórmulas responden con error ante fallos de repositorio o filesystem', async () => {
        const originalConsoleError = console.error;
        console.error = () => {};
        try {
            repositoryFailures.formulaListar = new Error('database unavailable');
            let result = await call('/api/formulas/');
            assert.equal(result.response.status, 500);
            delete repositoryFailures.formulaListar;

            repositoryFailures.formulaListarAdmin = new Error('database unavailable');
            result = await call('/api/formulas/admin/all', { role: 1 });
            assert.equal(result.response.status, 500);
            delete repositoryFailures.formulaListarAdmin;

            repositoryFailures.formulaEstado = new Error('database unavailable');
            result = await call('/api/formulas/admin/71', {
                method: 'PATCH', role: 1, body: { estado: 'VALIDADA' }
            });
            assert.equal(result.response.status, 400);
            delete repositoryFailures.formulaEstado;

            repositoryFailures.fileAccess = new Error('file unavailable');
            result = await call('/api/formulas/72');
            assert.equal(result.response.status, 404);
            delete repositoryFailures.fileAccess;

            repositoryFailures.formulaBuscar = new Error('database unavailable');
            result = await call('/api/formulas/72');
            assert.equal(result.response.status, 404);
        } finally {
            for (const key of Object.keys(repositoryFailures)) delete repositoryFailures[key];
            console.error = originalConsoleError;
        }
    });

    test('dashboard preserva respuestas controladas si falla la consulta de estadísticas', async () => {
        const originalConsoleError = console.error;
        console.error = () => {};
        try {
            repositoryFailures.dashboardUsuario = new Error('database unavailable');
            let result = await call('/api/dashboard/me');
            assert.equal(result.response.status, 500);
            assert.deepEqual(result.data, { ok: false, mensaje: 'No se pudieron cargar las estadísticas.' });
            delete repositoryFailures.dashboardUsuario;

            repositoryFailures.dashboardAdmin = new Error('database unavailable');
            result = await call('/api/dashboard/admin', { role: 1 });
            assert.equal(result.response.status, 500);
            assert.deepEqual(result.data, {
                ok: false,
                mensaje: 'No se pudieron cargar las estadísticas administrativas.'
            });
        } finally {
            delete repositoryFailures.dashboardUsuario;
            delete repositoryFailures.dashboardAdmin;
            console.error = originalConsoleError;
        }
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
