const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const originalLoad = Module._load;
const previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    FRONTEND_URL: process.env.FRONTEND_URL
};
const TEST_SECRET = 'saludclick-auth-characterization-secret';
let users;
let nextId;
let recovery;
let resetCall;
let updateCall;
let mailMessages;
let googlePayload;
let googleOptions;

function findUser(correo) { return users.find(user => user.correo === correo); }

const repository = {
    buscarPorCorreo: async correo => findUser(correo),
    register: async usuario => {
        const saved = { ...usuario, id: nextId++, estado: 'ACTIVO' };
        users.push(saved);
        return saved.id;
    },
    login: async correo => findUser(correo),
    crearTokenRecuperacion: async (usuarioId, tokenHash, expiraEn) => { recovery = { usuarioId, tokenHash, expiraEn }; },
    buscarTokenRecuperacion: async tokenHash => recovery?.tokenHash === tokenHash
        ? { token_id: 88, usuario_id: recovery.usuarioId, correo: findUser('ana@example.test')?.correo }
        : undefined,
    actualizarPassword: async (usuarioId, passwordHash, tokenId) => { resetCall = { usuarioId, passwordHash, tokenId }; },
    buscarPerfil: async id => {
        const user = users.find(item => item.id === id);
        if (!user) return undefined;
        const { password, ...profile } = user;
        return profile;
    },
    actualizarPerfil: async (id, data) => {
        updateCall = { id, data };
        const user = users.find(item => item.id === id);
        if (!user) return undefined;
        Object.assign(user, data);
        return repository.buscarPerfil(id);
    }
};
const bcryptMock = {
    hash: async password => `hash:${password}`,
    compare: async (password, hash) => hash === `hash:${password}`
};
const mailerMock = {
    createTransport: () => ({ sendMail: async message => { mailMessages.push(message); } })
};
class GoogleClientMock {
    async verifyIdToken(options) {
        googleOptions = options;
        if (options.idToken === 'reject') throw new Error('provider rejected token');
        return { getPayload: () => googlePayload };
    }
}
const googleMock = { OAuth2Client: GoogleClientMock };
let authService;
let userService;

before(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    Module._load = function(request, parent, isMain) {
        if (request === '../repositories/auth.repository' && /(auth|user)\.service\.js$/.test(parent?.filename || '')) return repository;
        if (request === 'bcrypt' && /auth\.service\.js$/.test(parent?.filename || '')) return bcryptMock;
        if (request === 'nodemailer' && /auth\.service\.js$/.test(parent?.filename || '')) return mailerMock;
        if (request === 'google-auth-library' && /auth\.service\.js$/.test(parent?.filename || '')) return googleMock;
        return originalLoad.call(this, request, parent, isMain);
    };
    authService = require('../src/services/auth.service');
    userService = require('../src/services/user.service');
    Module._load = originalLoad;
});

beforeEach(() => {
    users = [{
        id: 7, nombre: 'Ana', apellido: 'Prueba', correo: 'ana@example.test', password: 'hash:correcta',
        estado: 'ACTIVO', rol_id: 2, telefono: null, tipo_documento: null, numeroDocumento: 'D-7', ciudad: 'Bogotá'
    }];
    nextId = 20;
    recovery = undefined;
    resetCall = undefined;
    updateCall = undefined;
    mailMessages = [];
    googlePayload = undefined;
    googleOptions = undefined;
});

after(() => {
    Module._load = originalLoad;
    if (previousEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousEnv.JWT_SECRET;
    if (previousEnv.FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousEnv.FRONTEND_URL;
});

test('registro normaliza correo, guarda hash bcrypt y asigna rol de usuario', async () => {
    const result = await authService.register({
        nombre: '  Luis ', apellido: ' Pérez ', correo: ' LUIS@Example.Test ', password: 'secreto123',
        numeroDocumento: '  DOC-20 '
    });
    assert.deepEqual(result, { ok: true, mensaje: 'Usuario registrado correctamente', id: 20 });
    assert.deepEqual(users[1], {
        nombre: 'Luis', apellido: 'Pérez', correo: 'luis@example.test', telefono: null, tipoDocumento: null,
        numeroDocumento: 'DOC-20', password: 'hash:secreto123', rol_id: 2, id: 20, estado: 'ACTIVO'
    });
});

test('registro conserva prioridad de correo duplicado y sus validaciones actuales', async t => {
    await t.test('duplicado antes de campos requeridos', async () => {
        await assert.rejects(authService.register({ correo: ' ANA@example.test ' }), /correo ya está registrado/i);
    });
    await t.test('campos requeridos', async () => {
        await assert.rejects(authService.register({ correo: 'nuevo@example.test' }), /Nombre, apellido, documento y contraseña son obligatorios\./);
    });
    await t.test('mínimo de ocho caracteres', async () => {
        await assert.rejects(authService.register({ nombre: 'A', apellido: 'B', correo: 'nuevo@example.test', password: 'corta', numeroDocumento: '1' }), /mínimo 8 caracteres/);
    });
});

test('login valida contraseña/estado y firma el JWT actual de ocho horas', async t => {
    await t.test('login normaliza correo y devuelve usuario público', async () => {
        const result = await authService.login({ correo: ' ANA@EXAMPLE.TEST ', password: 'correcta' });
        assert.equal(result.ok, true);
        assert.equal(result.mensaje, 'Inicio de sesión correcto');
        assert.deepEqual(result.usuario, { id: 7, nombre: 'Ana', apellido: 'Prueba', correo: 'ana@example.test', rol: 2 });
        const claims = jwt.verify(result.token, TEST_SECRET);
        assert.equal(claims.id, 7);
        assert.equal(claims.correo, 'ana@example.test');
        assert.equal(claims.rol, 2);
        assert.equal(claims.exp - claims.iat, 8 * 60 * 60);
    });
    await t.test('credenciales incorrectas', async () => {
        await assert.rejects(authService.login({ correo: 'ana@example.test', password: 'incorrecta' }), /Correo o contraseña incorrectos/);
    });
    await t.test('cuenta inactiva', async () => {
        findUser('ana@example.test').estado = 'INACTIVO';
        await assert.rejects(authService.login({ correo: 'ana@example.test', password: 'correcta' }), /La cuenta se encuentra inactiva/);
    });
});

test('Google verifica audiencia y correo antes de crear o iniciar sesión', async t => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-test';
    await t.test('cuenta existente', async () => {
        googlePayload = { email: ' ANA@EXAMPLE.TEST ', email_verified: true, name: 'Ana Prueba' };
        const result = await authService.googleLogin('google-valid');
        assert.equal(googleOptions.idToken, 'google-valid');
        assert.equal(googleOptions.audience, 'google-client-test');
        assert.equal(result.usuario.correo, 'ana@example.test');
        assert.equal(result.mensaje, 'Inicio de sesión con Google correcto');
    });
    await t.test('correo no verificado', async () => {
        googlePayload = { email: 'ana@example.test', email_verified: false };
        await assert.rejects(authService.googleLogin('google-valid'), /correo de Google no está verificado/);
    });
    await t.test('cuenta nueva mantiene rol predeterminado y perfil derivado', async () => {
        googlePayload = { email: 'nueva@example.test', email_verified: true, name: 'María Gómez' };
        const result = await authService.googleLogin('google-valid');
        const created = findUser('nueva@example.test');
        assert.equal(created.nombre, 'María');
        assert.equal(created.apellido, 'Gómez');
        assert.equal(created.tipoDocumento, 'GOOGLE');
        assert.equal(created.rol_id, 2);
        assert.equal(result.usuario.id, created.id);
    });
});

test('recuperación oculta cuentas inexistentes, persiste hash y envía enlace de 15 minutos', async () => {
    process.env.FRONTEND_URL = 'https://saludclick.test/';
    const before = Date.now();
    await authService.solicitarRecuperacion(' ANA@EXAMPLE.TEST ');
    const after = Date.now();
    assert.equal(recovery.usuarioId, 7);
    assert.equal(recovery.tokenHash.length, 64);
    assert.ok(recovery.expiraEn.getTime() >= before + 15 * 60 * 1000);
    assert.ok(recovery.expiraEn.getTime() <= after + 15 * 60 * 1000);
    assert.equal(mailMessages.length, 1);
    assert.equal(mailMessages[0].to, 'ana@example.test');
    const enlace = mailMessages[0].html.match(/href="([^"]+)"/)[1];
    const token = new URL(enlace).searchParams.get('token');
    assert.equal(new URL(enlace).origin, 'https://saludclick.test');
    assert.equal(crypto.createHash('sha256').update(token).digest('hex'), recovery.tokenHash);

    await authService.solicitarRecuperacion('no-existe@example.test');
    assert.equal(mailMessages.length, 1);
});

test('restablecimiento conserva validación, hash y consumo del token', async t => {
    await t.test('token ausente', async () => {
        await assert.rejects(authService.restablecerPassword('', 'abcdef'), /enlace de recuperación no es válido/);
    });
    await t.test('contraseña corta', async () => {
        await assert.rejects(authService.restablecerPassword('token', '12345'), /al menos 6 caracteres/);
    });
    await t.test('token vencido o desconocido', async () => {
        await assert.rejects(authService.restablecerPassword('token-desconocido', 'abcdef'), /inválido o ya expiró/);
    });
    await t.test('éxito con contraseña mínima', async () => {
        const rawToken = 'recovery-token';
        recovery = { usuarioId: 7, tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex') };
        await authService.restablecerPassword(rawToken, '123456');
        assert.deepEqual(resetCall, { usuarioId: 7, passwordHash: 'hash:123456', tokenId: 88 });
    });
});

test('servicio de perfil consulta usuario y reenvía los datos de actualización al repositorio', async t => {
    await t.test('perfil existente', async () => {
        assert.equal((await authService.profile(7)).correo, 'ana@example.test');
    });
    await t.test('perfil inexistente', async () => {
        await assert.rejects(authService.profile(999), /Usuario no encontrado/);
    });
    await t.test('actualizar perfil', async () => {
        const data = { nombre: 'Ana María', apellido: 'Prueba', telefono: '300', tipoDocumento: 'CC', ciudad: 'Cali' };
        const result = await authService.updateProfile(7, data);
        assert.deepEqual(updateCall, { id: 7, data });
        assert.equal(result.nombre, 'Ana María');
    });
});
