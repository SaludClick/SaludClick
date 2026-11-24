const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const jwt = require('jsonwebtoken');
const { createIpsRouter } = require('../src/routes/ips.routes');
const { administrativeScope } = require('../src/middlewares/administrative-scope.middleware');

test('IPS exige rol y membresía independiente y conserva la afiliación EPS histórica', async () => {
    const db = new PGlite();
    const secret = 'ips-test-only';
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    let server;
    try {
        await db.exec(`
            CREATE TABLE usuarios (id int PRIMARY KEY, rol_id int, estado text);
            INSERT INTO usuarios VALUES (1,1,'ACTIVO'),(2,2,'ACTIVO'),(3,3,'ACTIVO'),
                (4,4,'ACTIVO'),(5,4,'ACTIVO'),(6,4,'INACTIVO');
            CREATE TABLE eps_entidades (id varchar(80) PRIMARY KEY, nombre text);
            INSERT INTO eps_entidades VALUES ('eps-original','Aseguradora de prueba');
        `);
        await db.exec(readFileSync(resolve(__dirname, '../prisma/migrations/20261123233000_ips_entidades/migration.sql'), 'utf8'));
        assert.deepEqual((await db.query('SELECT * FROM eps_entidades')).rows, [
            { id: 'eps-original', nombre: 'Aseguradora de prueba' }
        ]);
        assert.equal((await db.query('SELECT * FROM ips_accesos')).rows.length, 0);
        await db.exec(`
            INSERT INTO ips_entidades VALUES ('ips-uno','Prestador de prueba','999',true);
            INSERT INTO ips_eps VALUES ('ips-uno','eps-original',true);
            INSERT INTO ips_accesos (usuario_id, ips_id, activo) VALUES
                (4,'ips-uno',true),(6,'ips-uno',true);
        `);

        const app = express();
        app.use('/api', administrativeScope);
        app.use('/api/ips', createIpsRouter({ query: db.query.bind(db) }));
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        const url = 'http://127.0.0.1:' + server.address().port + '/api/ips/verificar-acceso';
        const request = (id, rol) => fetch(url + '?ips_id=otro-prestador', {
            headers: id ? { Authorization: 'Bearer ' + jwt.sign({ id, rol }, secret, { expiresIn: '5m' }) } : {}
        });
        assert.equal((await request()).status, 401);
        for (const role of [1, 2, 3]) assert.equal((await request(role, role)).status, 403);
        assert.equal((await request(5, 4)).status, 403);
        assert.equal((await request(6, 4)).status, 403);
        const response = await request(4, 4);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), {
            ok: true, ips: { id: 'ips-uno', nombre: 'Prestador de prueba' }
        });
        await db.exec('UPDATE ips_accesos SET revocado_at = now() WHERE usuario_id = 4');
        assert.equal((await request(4, 4)).status, 401);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.close();
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    }
});
