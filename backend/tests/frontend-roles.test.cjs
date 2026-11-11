const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let policy;
before(async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/public/js/roles.js'), 'utf8');
    policy = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
});
test('cada identidad tiene un inicio propio y los roles desconocidos vuelven al login', () => {
    for (const [role, home] of [[1, '/pages/admin.html'], [2, '/pages/dashboard.html'], [3, '/pages/farmacia.html'], [4, '/pages/perfil.html']]) {
        assert.equal(policy.paginaInicio({ rol: role }), home);
        assert.equal(policy.paginaInicio({ rol_id: String(role) }), home);
        assert.equal(policy.puedeAcceder(home, { rol: role }), true);
    }
    for (const user of [null, {}, { rol: 99 }, { rol: 'farmacia' }]) assert.equal(policy.paginaInicio(user), '/login.html');
});
test('la matriz de pantallas impide cruces entre administrador, farmacia y paciente', () => {
    for (const [route, roles] of [
        ['/pages/admin.html', [1]], ['/pages/admin-cuentas.html?rol=3', [1]],
        ['/pages/farmacia.html', [3]], ['/pages/pedidos.html', [2]],
        ['/pages/formulas.html', [2]], ['/pages/chat.html', [2, 3]],
        ['/pages/perfil.html', [1, 2, 3, 4]], ['/index.html?accion=domicilio', [2]]
    ]) for (const role of [1, 2, 3, 4, 99]) {
        assert.equal(policy.puedeAcceder(route, { rol: role }), roles.includes(role), `${route} rol ${role}`);
    }
    assert.equal(policy.puedeAcceder('/pages/pedidos.html', null), false);
});
