const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requireFarmacia } = require('../src/middlewares/farmacia.middleware');

const autorizarFarmacia = requireFarmacia[1];

function invoke(usuario) {
    let status;
    let body;
    let nextCalled = false;
    const response = {
        status(code) {
            status = code;
            return this;
        },
        json(value) {
            body = value;
            return this;
        }
    };

    autorizarFarmacia({ usuario }, response, () => { nextCalled = true; });
    return { status, body, nextCalled };
}

test('farmacia middleware permite solo el rol 3 y acepta ambos nombres de campo', async t => {
    await t.test('rol_id como cadena', () => {
        assert.deepEqual(invoke({ rol_id: '3' }), {
            status: undefined,
            body: undefined,
            nextCalled: true
        });
    });

    await t.test('alias rol', () => {
        assert.equal(invoke({ rol: 3 }).nextCalled, true);
    });

    await t.test('rol diferente', () => {
        assert.deepEqual(invoke({ rol_id: 2 }), {
            status: 403,
            body: {
                ok: false,
                mensaje: 'Acceso restringido al personal de farmacia.'
            },
            nextCalled: false
        });
    });

    await t.test('usuario ausente', () => {
        assert.equal(invoke(undefined).status, 403);
    });
});
