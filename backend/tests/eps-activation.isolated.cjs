// Actual PostgreSQL engine in memory. No .env and no real database connections.
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg'),
  { PrismaClient } = require('@prisma/client'),
  { PrismaPg } = require('@prisma/adapter-pg');
const { applySchema, inspect, hash, name, tables } = require('../scripts/eps-apply-schema.cjs');
const { createActivationService } = require('../src/services/eps-activation.service');
test(
  'EPS migration and real-source activation are explicit, scoped, atomic and repeatable',
  { timeout: 120000 },
  async (t) => {
    const prismaRequire = require('node:module').createRequire(require.resolve('@prisma/dev', {
      paths: [path.dirname(require.resolve('prisma/package.json'))],
    }));
    const { PGlite } = prismaRequire('@electric-sql/pglite');
    const { PGLiteSocketServer } = prismaRequire('@electric-sql/pglite-socket');
    const memory = await PGlite.create();
    const socket = new PGLiteSocketServer({
      db: memory,
      port: 0,
      host: '127.0.0.1',
      maxConnections: 1,
    });
    let pool, db;
    try {
      const schema = fs.readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
      const baseline = schema
        .slice(0, schema.indexOf('// EPS: aislamiento'))
        .split('\n')
        .filter(
          (line) =>
            !/\bEps[A-Z]|eps_version Int|eps_affiliate_scope|eps_affiliate_patient/.test(line),
        )
        .join('\n');
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'saludclick-eps-activation-'));
      const from = path.join(temp, 'baseline.prisma');
      fs.writeFileSync(from, baseline);
      const ddl = spawnSync(
        process.execPath,
        [
          path.resolve(__dirname, '../node_modules/prisma/build/index.js'),
          'migrate',
          'diff',
          '--from-empty',
          '--to-schema',
          from,
          '--script',
        ],
        { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' },
      );
      assert.equal(ddl.status, 0, ddl.stderr);
      const base = ddl.stdout
        .replace(/CREATE TABLE "afiliados" \([\s\S]*?\);/g, '')
        .replace(
          /^(?:CREATE (?:UNIQUE )?INDEX [^\n]* ON "afiliados"[^\n]*|ALTER TABLE "afiliados"[^\n]*)$/gm,
          '',
        );
      await memory.exec(base);
      await memory.exec(
        "CREATE TABLE _prisma_migrations(id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,finished_at timestamptz,migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0); INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name) VALUES('baseline-test','baseline-only',now(),'existing-baseline');",
      );
      await socket.start();
      pool = new Pool({
        connectionString: 'postgresql://postgres@' + socket.getServerConn() + '/postgres',
        max: 1,
      });
      db = new PrismaClient({ adapter: new PrismaPg(pool) });
      for (const [id, nombre] of [
        [2, 'PACIENTE'],
        [3, 'FARMACIA'],
        [4, 'EPS'],
      ])
        await db.rol.create({ data: { id, nombre } });
      await db.usuario.create({
        data: {
          id: 1,
          nombre: 'EPS',
          apellido: 'Operator',
          correo: 'eps@example.test',
          password: 'isolated',
          rol_id: 4,
          estado: 'ACTIVO',
        },
      });
      await db.usuario.create({
        data: {
          id: 2,
          nombre: 'Jane',
          apellido: 'Source',
          correo: 'jane@example.test',
          cedula: '10001',
          tipo_documento: 'CC',
          password: 'isolated',
          rol_id: 2,
          estado: 'ACTIVO',
        },
      });
      await db.pacienteAutorizado.create({
        data: {
          nombres: 'Jane',
          apellidos: 'Source',
          cedula: '10001',
          tipo_documento: 'CC',
          estado: 'AUTORIZADO',
        },
      });
      const raw = {
        entidad: { id: 'ORIGIN', nombre: 'Origin EPS', ciudad: 'Medellin', estado: 'Activa' },
        afiliados: [
          {
            id: 'source-a',
            nombres: 'Jane',
            apellidos: 'Source',
            tipo_documento: 'CC',
            documento: '10001',
            fecha_nacimiento: '2000-01-01',
            telefono: '123',
            correo: 'jane@example.test',
            direccion: 'Local',
            ciudad: 'Medellin',
            regimen: 'Subsidiado',
            estado: 'Activo',
            eps_id: 'ORIGIN',
          },
          {
            id: 'source-b',
            nombres: 'Other',
            apellidos: 'Source',
            tipo_documento: 'CC',
            documento: '10002',
            fecha_nacimiento: '2000-01-01',
            telefono: '123',
            correo: 'other@example.test',
            direccion: 'Local',
            ciudad: 'Medellin',
            regimen: 'Subsidiado',
            estado: 'Activo',
            eps_id: 'ORIGIN',
          },
        ],
      };
      const original = structuredClone(raw);
      const source = async () => structuredClone(raw);
      const service = createActivationService({ db, readSource: source }),
        input = { epsId: 'ORIGIN', accountId: 1 };
      const sql = fs.readFileSync(
        path.resolve(__dirname, '../prisma/migrations', name, 'migration.sql'),
        'utf8',
      );
      let target;
      await t.test(
        'schema failure is diagnosed before activation; plans do not write',
        async () => {
          const plan = await service.plan(input);
          assert.equal(plan.schemaReady, false);
          assert.equal(plan.newAffiliates, 2);
          assert.equal(plan.verifiedPatientLinks, 1);
          assert.equal(plan.planHash, (await service.plan(input)).planHash);
          await assert.rejects(
            service.apply(input, plan.planHash),
            (e) => e.code === 'EPS_SCHEMA_PENDING',
          );
          const c = await pool.connect();
          try {
            target = (await inspect(c, '127.0.0.1')).targetFingerprint;
            assert.equal((await c.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n, 2);
          } finally {
            c.release();
          }
        },
      );
      await t.test(
        'wrong checksum or target is rejected and invalid SQL rolls back every table',
        async () => {
          const c = await pool.connect();
          try {
            await assert.rejects(
              applySchema(c, {
                sql,
                expectedHash: '0'.repeat(64),
                expectedTarget: target,
                hostname: '127.0.0.1',
              }),
              (e) => e.code === 'EPS_SQL_HASH_MISMATCH',
            );
            await assert.rejects(
              applySchema(c, {
                sql,
                expectedHash: hash(sql),
                expectedTarget: '0'.repeat(64),
                hostname: '127.0.0.1',
              }),
              (e) => e.code === 'EPS_TARGET_MISMATCH',
            );

            let recoveryChecked=false;
            await assert.rejects(applySchema(c,{sql,expectedHash:hash(sql),expectedTarget:target,hostname:'127.0.0.1',preApply:async()=>{recoveryChecked=true;throw Object.assign(new Error('Recovery not verified'),{code:'EPS_BACKUP_NOT_VERIFIED'});}}),e=>e.code==='EPS_BACKUP_NOT_VERIFIED');
            assert.equal(recoveryChecked,true);
            assert.equal((await inspect(c,'127.0.0.1')).present.filter(n=>tables.includes(n)).length,0);

            const broken = sql.replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;');
            await assert.rejects(
              applySchema(c, {
                sql: broken,
                expectedHash: hash(broken),
                expectedTarget: target,
                hostname: '127.0.0.1',
              }),
            );
            assert.equal(
              (await inspect(c, '127.0.0.1')).present.filter((n) => tables.includes(n)).length,
              0,
            );
            assert.equal(
              (await c.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows[0].n,
              1,
            );
          } finally {
            c.release();
          }
        },
      );
      await t.test('only the approved migration is applied and recorded atomically', async () => {
        const c = await pool.connect();
        try {
          const result = await applySchema(c, {
            sql,
            expectedHash: hash(sql),
            expectedTarget: target,
            hostname: '127.0.0.1',
          });
          assert.equal(result.applied, true);
          const repeat = await applySchema(c, {
            sql,
            expectedHash: hash(sql),
            expectedTarget: target,
            hostname: '127.0.0.1',
          });
          assert.equal(repeat.alreadyApplied, true);
          assert.equal(
            (await c.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows[0].n,
            2,
          );
          assert.equal((await c.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n, 2);
        } finally {
          c.release();
        }
      });
      await t.test(
        'source changes invalidate approval and import preserves identity and original fields',
        async () => {
          const plan = await service.plan(input);
          assert.equal(plan.schemaReady, true);
          assert.deepEqual(plan.missingEntityFields, ['nit', 'correo', 'telefono', 'direccion']);
          raw.afiliados[0].telefono = 'changed';
          await assert.rejects(
            service.apply(input, plan.planHash),
            (e) => e.code === 'EPS_ACTIVATION_PLAN_CHANGED',
          );
          assert.equal(await db.epsEntidad.count(), 0);
          raw.afiliados[0].telefono = original.afiliados[0].telefono;
          const approved = await service.plan(input);
          const result = await service.apply(input, approved.planHash);
          assert.equal(result.mode, 'APPLIED');
          assert.equal(await db.afiliado.count(), 2);
          assert.equal(await db.usuario.count(), 2);
          const rows = await db.afiliado.findMany({ orderBy: { id: 'asc' } });
          for (const source of original.afiliados) {
            const actual = rows.find((a) => a.id === source.id);
            for (const [key, value] of Object.entries(source)) assert.equal(actual[key], value);
          }
          assert.equal(rows[0].usuario_id, 2);
          assert.equal(rows[1].usuario_id, null);
          assert.equal(
            (await db.epsAcceso.findUnique({ where: { usuario_id: 1 } })).eps_id,
            'ORIGIN',
          );
          assert.deepEqual(raw, original);
          const repeat = await service.plan(input);
          assert.equal(repeat.newAffiliates, 0);
          assert.equal(repeat.verifiedPatientLinks, 0);
          await service.apply(input, repeat.planHash);
          assert.equal(await db.epsEvento.count(), 1);
        },
      );
      await t.test(
        'conflicts cannot overwrite affiliates or transfer a membership to another EPS',
        async () => {
          await db.afiliado.update({
            where: { id: 'source-a' },
            data: { telefono: 'updated locally' },
          });
          await assert.rejects(service.plan(input), (e) => e.code === 'EPS_AFFILIATE_CONFLICT');
          assert.equal(
            (await db.afiliado.findUnique({ where: { id: 'source-a' } })).telefono,
            'updated locally',
          );

          await db.afiliado.update({
            where: { id: 'source-a' },
            data: { telefono: original.afiliados[0].telefono },
          });
          await db.epsEntidad.create({
            data: {
              id: 'OTHER',
              nombre: 'Other EPS',
              nit: 'OTHER',
              correo: '',
              telefono: '',
              direccion: '',
              ciudad: 'Other',
            },
          });
          await db.epsAcceso.update({ where: { usuario_id: 1 }, data: { eps_id: 'OTHER' } });
          await assert.rejects(service.plan(input), (e) => e.code === 'EPS_MEMBERSHIP_CONFLICT');
          assert.equal(
            (await db.epsAcceso.findUnique({ where: { usuario_id: 1 } })).eps_id,
            'OTHER',
          );
          await db.epsAcceso.update({ where: { usuario_id: 1 }, data: { eps_id: 'ORIGIN' } });
          const withMetadata = {
            ...input,
            metadata: { nit: 'VERIFIED-NIT', correo: 'confirmed@example.test' },
          };
          const metadataPlan = await service.plan(withMetadata);
          assert.deepEqual(metadataPlan.updateEntityFields, ['nit', 'correo']);
          await service.apply(withMetadata, metadataPlan.planHash);
          assert.equal(
            (await db.epsEntidad.findUnique({ where: { id: 'ORIGIN' } })).nit,
            'VERIFIED-NIT',
          );
          await assert.rejects(
            service.plan({ ...input, metadata: { nit: 'REPLACEMENT' } }),
            (e) => e.code === 'EPS_PROFILE_CONFLICT',
          );

          await db.usuario.update({ where: { id: 1 }, data: { estado: 'INACTIVO' } });
          await assert.rejects(service.plan(input), (e) => e.code === 'EPS_ACCOUNT_NOT_ACTIVE');
        },
      );
    } finally {
      if (db) await db.$disconnect();
      if (pool) await pool.end();
      await socket.stop();
      await memory.close();
    }
  },
);
