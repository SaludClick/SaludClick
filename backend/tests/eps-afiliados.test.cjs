const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearControlador } = require('../src/controllers/eps-afiliados.controller');

test('las rutas de afiliados EPS rechazan JWT ausentes, inválidos y de otros roles', async t => {
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const anterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'jwt-aislado-pruebas-afiliados-eps';
    t.after(() => {
        if (anterior === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = anterior;
    });
    const app = express();
    app.use('/api/eps', require('../src/routes/eps.routes'));
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/eps/afiliados`;
    for (const path of ['', '/ejemplo']) {
        assert.equal((await fetch(base + path)).status, 401);
        assert.equal((await fetch(base + path, { headers: { Authorization: 'Bearer inválido' } })).status, 401);
        for (const rol of [1, 2, 3]) {
            const token = jwt.sign({ id: 4, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
            assert.equal((await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } })).status, 403);
        }
    }
});

async function ejecutar(handler, { query = {}, params = {}, id = 4 } = {}) {
    let status = 200;
    let body;
    let cache;
    await handler({ usuario: { id, eps_id: 'ajena' }, query, params }, {
        set(nombre, valor) { if (nombre === 'Cache-Control') cache = valor; },
        status(code) { status = code; return this; },
        json(value) { body = value; }
    });
    assert.equal(cache, 'no-store');
    return { status, body };
}

test('EPS valida la vinculación antes de leer y nunca usa una entidad del cliente', async () => {
    const consultas = [];
    const { listar, detalle } = crearControlador({
        buscarEntidad: async id => id === 4 ? { id: '1' } : null,
        leer: async (epsId, opciones) => {
            consultas.push([epsId, opciones]);
            return { pacientes: [], total: 0, totalActivos: 50 };
        }
    });
    assert.equal((await ejecutar(listar, { id: 9 })).status, 403);
    assert.equal((await ejecutar(listar, { query: { eps_id: 'ajena' } })).status, 400);
    assert.equal((await ejecutar(listar, { query: { tamano: '51' } })).status, 400);
    assert.equal(consultas.length, 0);
    const resultado = await ejecutar(listar, { query: { buscar: ' nombre ', pagina: '2' } });
    assert.equal(resultado.body.totalActivos, 50);
    assert.deepEqual(resultado.body.paginacion, { pagina: 2, tamano: 25, total: 0, paginas: 0 });
    assert.equal((await ejecutar(detalle, { params: { id: 'ajeno' } })).status, 404);
    assert.deepEqual(consultas, [
        ['1', { buscar: 'nombre', pagina: 2, take: 25 }],
        ['1', { identificador: 'ajeno', take: 1 }]
    ]);
});

test('el detalle del origen combina el identificador exacto con entidad y estado activo', async () => {
    const consultas = [];
    const tx = {
        $executeRaw: async () => {},
        $queryRaw: async (strings, ...values) => {
            const { Prisma } = require('@prisma/client');
            const consulta = Prisma.sql(strings, ...values);
            consultas.push(consulta);
            return consultas.length === 1 ? [{ activos: 0, unicos: 0, filtrados: 0 }] : [];
        }
    };
    const { crearOrigen } = require('../src/repositories/afiliados-origen.repository');
    const origen = crearOrigen({
        obtenerConexion: () => ({ esquema: 'public', prisma: { $transaction: fn => fn(tx) } })
    });
    assert.deepEqual(await origen.leerAutorizados('1', { identificador: 'ajeno', take: 1 }), {
        pacientes: [], totalActivos: 0, total: 0
    });
    const [, seleccion] = consultas;
    assert.match(seleccion.sql, /a\.eps_id::text=\? AND lower\(btrim\(a\.estado::text\)\)='activo'/);
    assert.match(seleccion.sql, /a\.id::text = \?/);
    assert.deepEqual(seleccion.values, ['1', 'ajeno', 1, 0]);
});
