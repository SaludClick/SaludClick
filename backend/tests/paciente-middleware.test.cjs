const { test } = require("node:test");
const assert = require("node:assert/strict");
const { requirePaciente } = require("../src/middlewares/paciente.middleware");

const autorizarPaciente = requirePaciente[1];

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

    autorizarPaciente({ usuario }, response, () => { nextCalled = true; });
    return { status, body, nextCalled };
}

test("el middleware de paciente permite solo el rol 2", () => {
    assert.equal(invoke({ rol_id: "2" }).nextCalled, true);
    assert.equal(invoke({ rol: 2 }).nextCalled, true);

    for (const rol of [1, 3, 4]) {
        assert.deepEqual(invoke({ rol_id: rol }), {
            status: 403,
            body: {
                ok: false,
                mensaje: "Acceso restringido a pacientes."
            },
            nextCalled: false
        });
    }

    assert.equal(invoke(undefined).status, 403);
});
