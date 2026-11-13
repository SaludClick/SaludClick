const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarUrlActivacion } = require('../src/config/activation-url');
test('localhost de Astro solo se permite expresamente en desarrollo', () => {
    assert.equal(validarUrlActivacion({ NODE_ENV: 'development', FRONTEND_URL: 'http://localhost:4321' }).origin, 'http://localhost:4321');
    for (const NODE_ENV of [undefined, 'production', 'test']) {
        assert.throws(() => validarUrlActivacion({ NODE_ENV, FRONTEND_URL: 'http://localhost:4321' }));
    }
    for (const FRONTEND_URL of ['http://localhost:3000', 'http://example.com', 'http://localhost:4321.evil.test', 'http://localhost:4321/ruta']) {
        assert.throws(() => validarUrlActivacion({ NODE_ENV: 'development', FRONTEND_URL }));
    }
    assert.equal(validarUrlActivacion({ NODE_ENV: 'production', FRONTEND_URL: 'https://saludclick.test' }).protocol, 'https:');
});
