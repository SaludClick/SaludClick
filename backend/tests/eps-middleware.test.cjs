const { test } = require("node:test");
const assert = require("node:assert/strict");
const { requireEps } = require("../src/middlewares/eps.middleware");

const autorizarEps = requireEps[1];

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

    autorizarEps({ usuario }, response, () => { nextCalled = true; });
    return { status, body, nextCalled };
}

test("el middleware EPS permite solo el rol 4", () => {
    assert.equal(invoke({ rol_id: "4" }).nextCalled, true);
    assert.equal(invoke({ rol: 4 }).nextCalled, true);

    for (const rol of [1, 2, 3]) {
        assert.deepEqual(invoke({ rol_id: rol }), {
            status: 403,
            body: {
                ok: false,
                mensaje: "Acceso restringido al personal de EPS."
            },
            nextCalled: false
        });
    }

    assert.equal(invoke(undefined).status, 403);
});
