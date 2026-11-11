const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, requireRole, requireUsuario } = require('../src/middlewares/role.middleware');

test('cada rol admite exclusivamente su identidad y falla cerrado', () => {
    for (const role of Object.values(ROLES)) {
        const [, authorize] = requireRole(role, 'Restringido');
        for (const actual of [undefined, null, 0, 1, 2, 3, 4, 99]) {
            let accepted = false;
            let status;
            const res = { status(code) { status = code; return this; }, json(body) { assert.equal(body.ok, false); } };
            authorize({ usuario: actual == null ? undefined : { rol: actual } }, res, () => { accepted = true; });
            assert.equal(accepted, actual === role);
            if (!accepted) assert.equal(status, 403);
        }
    }
    assert.throws(() => requireRole(99, ''), /no reconocido/);
});

test('paciente acepta rol_id textual y rechaza aliases contradictorios', () => {
    const [, authorize] = requireUsuario;
    let accepted = false;
    authorize({ usuario: { rol_id: '2' } }, {}, () => { accepted = true; });
    assert.equal(accepted, true);
    let status;
    authorize({ usuario: { rol_id: 3, rol: 2 } }, { status(code) { status = code; return this; }, json() {} }, () => assert.fail());
    assert.equal(status, 403);
});
