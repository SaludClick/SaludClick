require('./support/isolate-database.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const secretBefore = process.env.JWT_SECRET;
let server, base;
before(async () => {
    process.env.JWT_SECRET = 'patient-access-tests-only';
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (secretBefore === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secretBefore;
});
test('rutas personales rechazan administrador, farmacia, EPS y sesiones ausentes antes de acceder a datos', async t => {
    const routes = [
        ['GET', '/api/pedidos'], ['POST', '/api/pedidos'],
        ['GET', '/api/pedidos/1'], ['DELETE', '/api/pedidos/1'],
        ['GET', '/api/formulas'], ['POST', '/api/formulas'],
        ['GET', '/api/formulas/1'], ['GET', '/api/dashboard/me']
    ];
    for (const [method, route] of routes) for (const role of [null, 1, 3, 4, 99]) {
        await t.test(`${method} ${route}, rol ${role}`, async () => {
            const headers = role === null ? {} : { Authorization: `Bearer ${jwt.sign({ id: 10, rol: role }, process.env.JWT_SECRET)}` };
            const response = await fetch(base + route, { method, headers });
            assert.equal(response.status, role === null ? 401 : 403);
            assert.equal((await response.json()).ok, false);
        });
    }
});


test('dashboard: JWT expirado o con firma ajena no accede a registros', async () => {
    for (const token of [
        jwt.sign({ id: 71, rol: 2 }, process.env.JWT_SECRET, { expiresIn: -1 }),
        jwt.sign({ id: 71, rol: 2 }, 'other-test-secret')
    ]) {
        const response = await fetch(base + '/api/dashboard/me', { headers: { Authorization: 'Bearer ' + token } });
        assert.equal(response.status, 401);
    }
});

test('dashboard: los cuatro indicadores filtran exclusivamente por paciente y conservan sus criterios', async () => {
    const Module = require('node:module');
    const originalLoad = Module._load;
    const repoPath = require.resolve('../src/repositories/dashboard.repository');
    const cached = require.cache[repoPath];
    const calls = [];
    const fake = {
        solicitud: { count: async options => { calls.push(['pedido', options]); return options.where.estado ? 2 : 5; } },
        formulaMedica: { count: async options => { calls.push(['formula', options]); return 3; } },
        pago: { aggregate: async options => { calls.push(['pago', options]); return { _sum: { monto: '12500.75' } }; } }
    };
    try {
        delete require.cache[repoPath];
        Module._load = function(request, parent, isMain) {
            if (request === '../config/prisma' && parent?.filename === repoPath) return fake;
            return originalLoad.apply(this, arguments);
        };
        const repository = require(repoPath);
        for (const id of [71, 72]) {
            calls.length = 0;
            assert.deepEqual(await repository.statsUsuario(id), { pedidos: 5, formulas: 3, pedidosActivos: 2, totalPagado: 12500.75 });
            assert.equal(calls.length, 4);
            for (const [, options] of calls) assert.equal(options.where.usuario_id, id);
            assert.deepEqual(calls[1][1].where.estado, { notIn: ['ENTREGADA', 'CANCELADA'] });
            assert.deepEqual(calls[2][1].where.estado, { not: 'ELIMINADA' });
            assert.equal(calls[3][1].where.estado, 'APROBADO');
            assert.deepEqual(calls[3][1]._sum, { monto: true });
        }
        fake.solicitud.count = async () => 0;
        fake.formulaMedica.count = async () => 0;
        fake.pago.aggregate = async () => ({ _sum: { monto: null } });
        assert.deepEqual(await repository.statsUsuario(71), { pedidos: 0, formulas: 0, pedidosActivos: 0, totalPagado: 0 });
    } finally {
        Module._load = originalLoad;
        if (cached) require.cache[repoPath] = cached;
        else delete require.cache[repoPath];
    }
});
