const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createRecaptchaMiddleware,
    verificarRecaptcha
} = require('../src/middlewares/recaptcha.middleware');

async function invoke(middleware, body = {}) {
    const result = { status: 200, payload: undefined, nextCalled: false };
    const response = {
        status(status) {
            result.status = status;
            return this;
        },
        json(payload) {
            result.payload = payload;
            return this;
        }
    };
    await middleware({ body }, response, () => {
        result.nextCalled = true;
    });
    return result;
}

const logger = { error() {}, warn() {} };

test('reCAPTCHA rechaza configuración ausente sin llamar al proveedor', async () => {
    let calls = 0;
    const middleware = createRecaptchaMiddleware({
        getSecret: () => undefined,
        fetchImpl: async () => { calls += 1; },
        logger
    });

    const result = await invoke(middleware, { recaptchaToken: 'test-token' });
    assert.equal(result.status, 500);
    assert.equal(result.nextCalled, false);
    assert.equal(calls, 0);
});

test('un token ausente es un error del cliente aunque falte configuración del servidor', async () => {
    let calls = 0;
    const middleware = createRecaptchaMiddleware({
        getSecret: () => undefined,
        fetchImpl: async () => { calls += 1; },
        logger
    });

    const result = await invoke(middleware);
    assert.equal(result.status, 400);
    assert.equal(result.payload.mensaje, 'Debes completar la validación de seguridad.');
    assert.equal(result.nextCalled, false);
    assert.equal(calls, 0);
});

test('reCAPTCHA falla cerrado si no hay hostnames permitidos configurados', async () => {
    let calls = 0;
    const middleware = createRecaptchaMiddleware({
        getSecret: () => 'test-only-secret',
        getAllowedHostnames: () => '',
        fetchImpl: async () => { calls += 1; },
        logger
    });

    const result = await invoke(middleware, { recaptchaToken: 'test-token' });
    assert.equal(result.status, 500);
    assert.equal(result.payload.mensaje, 'La protección de seguridad no está configurada.');
    assert.equal(result.nextCalled, false);
    assert.equal(calls, 0);
});

test('reCAPTCHA requiere token y rechaza acción o puntuación inválida', async (t) => {
    await t.test('token ausente', async () => {
        let calls = 0;
        const middleware = createRecaptchaMiddleware({
            getSecret: () => 'test-only-secret',
            fetchImpl: async () => { calls += 1; },
            logger
        });
        const result = await invoke(middleware);
        assert.equal(result.status, 400);
        assert.equal(calls, 0);
    });

    for (const resultFromProvider of [
        { success: false, hostname: 'localhost' },
        { success: true, hostname: 'other.example' },
        { success: true, hostname: '' }
    ]) {
        await t.test(`respuesta rechazada ${JSON.stringify(resultFromProvider)}`, async () => {
            const middleware = createRecaptchaMiddleware({
                getSecret: () => 'test-only-secret',
                getAllowedHostnames: () => 'localhost',
                fetchImpl: async () => ({
                    ok: true,
                    json: async () => resultFromProvider
                }),
                logger
            });
            const result = await invoke(middleware, { recaptchaToken: 'test-token' });
            assert.equal(result.status, 403);
            assert.equal(result.nextCalled, false);
        });
    }
});

test('reCAPTCHA permite avanzar solo tras respuesta válida del proveedor', async () => {
    const middleware = createRecaptchaMiddleware({
        getSecret: () => 'test-only-secret',
        getAllowedHostnames: () => 'LOCALHOST,127.0.0.1',
        fetchImpl: async (_url, options) => {
            assert.equal(options.method, 'POST');
            assert.equal(new URLSearchParams(options.body).get('secret'), 'test-only-secret');
            return {
                ok: true,
                json: async () => ({ success: true, challenge_ts: new Date().toISOString(), hostname: 'localhost' })
            };
        },
        logger
    });
    const result = await invoke(middleware, { recaptchaToken: 'test-token' });
    assert.equal(result.status, 200);
    assert.equal(result.nextCalled, true);
});

test('reCAPTCHA falla cerrado si el proveedor no está disponible', async () => {
    const middleware = createRecaptchaMiddleware({
        getSecret: () => 'test-only-secret',
        getAllowedHostnames: () => 'localhost',
        fetchImpl: async () => { throw new Error('network unavailable'); },
        logger
    });
    const result = await invoke(middleware, { recaptchaToken: 'test-token' });
    assert.equal(result.status, 503);
    assert.equal(result.nextCalled, false);
});

test('middleware predeterminado lee variables de entorno y usa fetch global', async () => {
    const previous = {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        hostnames: process.env.RECAPTCHA_ALLOWED_HOSTNAMES
    };
    const originalFetch = globalThis.fetch;
    process.env.RECAPTCHA_SECRET_KEY = 'test-only-secret';
    process.env.RECAPTCHA_ALLOWED_HOSTNAMES = 'LOCALHOST.';
    globalThis.fetch = async (_url, options) => {
        assert.equal(new URLSearchParams(options.body).get('secret'), 'test-only-secret');
        return {
            ok: true,
            json: async () => ({ success: true, hostname: 'localhost' })
        };
    };
    try {
        const result = await invoke(verificarRecaptcha, { recaptchaToken: 'test-token' });
        assert.equal(result.nextCalled, true);
        assert.equal(result.status, 200);
    } finally {
        globalThis.fetch = originalFetch;
        if (previous.secret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
        else process.env.RECAPTCHA_SECRET_KEY = previous.secret;
        if (previous.hostnames === undefined) delete process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
        else process.env.RECAPTCHA_ALLOWED_HOSTNAMES = previous.hostnames;
    }
});

test('middleware predeterminado falla cerrado si faltan hostnames', async () => {
    const previous = {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        hostnames: process.env.RECAPTCHA_ALLOWED_HOSTNAMES
    };
    process.env.RECAPTCHA_SECRET_KEY = 'test-only-secret';
    delete process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
    const originalError = console.error;
    console.error = () => {};
    try {
        const result = await invoke(verificarRecaptcha, { recaptchaToken: 'test-token' });
        assert.equal(result.status, 500);
        assert.equal(result.nextCalled, false);
    } finally {
        console.error = originalError;
        if (previous.secret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
        else process.env.RECAPTCHA_SECRET_KEY = previous.secret;
        if (previous.hostnames === undefined) delete process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
        else process.env.RECAPTCHA_ALLOWED_HOSTNAMES = previous.hostnames;
    }
});
