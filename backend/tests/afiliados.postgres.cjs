const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { getTestDatabaseUrl } = require('./support/postgres-test-safety.cjs');
const { CAMPOS, leerCsv, importar } = require('../src/services/afiliados-import.service');

test('CSV real: importación idempotente y API administrativa en PostgreSQL aislado', { timeout: 120000 }, async () => {
    const connectionString = getTestDatabaseUrl();
    const originales = leerCsv(fs.readFileSync(process.env.AFILIADOS_CSV, 'utf8'));
    process.env.DATABASE_URL = connectionString;
    const fuente = new URL(connectionString); fuente.searchParams.set('sslmode','disable');
    process.env.EPS_DATABASE_URL = fuente.toString();
    process.env.JWT_SECRET = 'afiliados-postgres-test-local-only';
    const prisma = require('../src/config/prisma');
    const pool = require('../src/config/database');
    const express = require('express');
    const jwt = require('jsonwebtoken');
    let server;
    try {
        const [identidad] = await prisma.$queryRaw`SELECT current_database() AS nombre`;
        assert.equal(identidad.nombre, 'saludclick_test');
        const primera = await importar(prisma, originales);
        assert.equal(primera.validados, 50);
        assert.deepEqual(await importar(prisma, originales), { nuevos: 0, validados: 50 });
        const almacenados = await prisma.afiliado.findMany();
        assert.equal(almacenados.length, 50);
        for (const r of originales) {
            const persistido = almacenados.find(a => a.id === r.id);
            for (const c of CAMPOS) assert.equal(persistido[c], r[c], `Integridad del campo ${c}`);
            assert.equal(persistido.usuario_id, null);
        }
        // Un conflicto posterior a una inserción debe revertir toda la transacción.
        const conflictivos = structuredClone(originales);
        conflictivos[0].id = 'rollback-only'; conflictivos[0].documento = 'rollback-only';
        conflictivos[1].eps_id += '-conflicto';
        await assert.rejects(importar(prisma, conflictivos), /Conflicto/);
        assert.equal(await prisma.afiliado.count(), 50);
        assert.equal(await prisma.afiliado.findUnique({ where: { id: 'rollback-only' } }), null);

        const app = express(); app.use(express.json()); app.use('/api/admin/afiliados', require('../src/routes/afiliados.routes'));
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        const base = `http://127.0.0.1:${server.address().port}/api/admin/afiliados`;
        const token = rol => `Bearer ${jwt.sign({ id: 1, rol_id: rol }, process.env.JWT_SECRET)}`;
        const consultar = async ruta => {
            const response = await fetch(base + ruta, { headers: { Authorization: token(1) } });
            assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
            return response.json();
        };
        const ids = new Set();
        for (let pagina = 1; pagina <= 5; pagina++) {
            const data = await consultar(`?pagina=${pagina}`);
            assert.equal(data.total, 50); assert.equal(data.afiliados.length, 10);
            data.afiliados.forEach(a => ids.add(a.id));
        }
        assert.equal(ids.size, 50);
        for (const r of originales) {
            const data = await consultar(`/${encodeURIComponent(r.id)}`);
            for (const c of CAMPOS) assert.equal(data.afiliado[c], r[c], `Respuesta del campo ${c}`);
            assert.equal(data.afiliado.usuario, null);
        }
        for (const c of ['nombres', 'apellidos', 'documento', 'correo']) {
            const data = await consultar(`?buscar=${encodeURIComponent(originales[0][c])}`);
            assert.ok(data.coincidencias >= 1);
        }
        assert.equal((await fetch(base)).status, 401);
        for (const rol of [2, 3, 4]) assert.equal((await fetch(base, { headers: { Authorization: token(rol) } })).status, 403);
        const filtrado = await consultar(`?eps=${encodeURIComponent(originales[0].eps_id)}&estado=${encodeURIComponent(originales[0].estado)}&cuenta=SIN_CUENTA`);
        assert.equal(filtrado.coincidencias, originales.filter(a => a.eps_id === originales[0].eps_id && a.estado === originales[0].estado).length);
        assert.equal((await consultar('?cuenta=ACTIVO')).coincidencias, 0);
        console.log('Verificados: 50 registros reales, 650 valores originales, 5 páginas, 50 detalles, búsqueda, filtros y bloqueo de accesos no autorizados.');
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await require('../src/config/eps-prisma').cerrarConexionEPS();
        await prisma.$disconnect(); await pool.end();
    }
});
