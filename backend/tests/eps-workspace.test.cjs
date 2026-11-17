const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const v = require('../src/validators/eps.validator');
const { createEpsSession } = require('../src/middlewares/eps-session.middleware');
const { createController } = require('../src/controllers/eps.controller');
const { createService } = require('../src/services/eps.service');
const secret = 'isolated-eps-test-secret';
function response() {
  return {
    code: 200,
    headers: {},
    set(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}
test('EPS validates identifiers, dates, states, pagination and rejects tenant/role injection', () => {
  for (const value of [0, -1, '1 OR 1=1', '1.5', Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => v.id(value));
  for (const q of [
    { eps_id: 'other' },
    { pagina: '0' },
    { buscar: [] },
    { rol: 1 },
    { pagina: '999999999999999999' },
  ])
    assert.throws(() => v.query(q));
  const valid = {
    nombres: 'Ana',
    apellidos: 'Perez',
    tipo_documento: 'CC',
    documento: '100001',
    fecha_nacimiento: '2000-01-01',
    telefono: '',
    correo: 'ana@example.test',
    direccion: '',
    ciudad: 'Bogota',
    regimen: 'CONTRIBUTIVO',
    estado: 'ACTIVO',
  };
  assert.equal(v.afiliado(valid, true).nombres, 'Ana');
  for (const bad of [
    { ...valid, fecha_nacimiento: '2020-02-30' },
    { ...valid, estado: 'ADMIN' },
    { ...valid, usuario_id: 7 },
    { ...valid, eps_id: 'other' },
    { ...valid, correo: 'bad' },
  ])
    assert.throws(() => v.afiliado(bad, true));
});
test('EPS session checks current account, membership, entity and revocation on every request', async () => {
  let user = { id: 1, rol_id: 4, estado: 'ACTIVO' },
    member = { eps_id: 'EPS-A', activo: true, eps: { activa: true }, revocado_at: null };
  const guard = createEpsSession({
    verify: (t) => jwt.verify(t, secret),
    db: {
      usuario: { findUnique: async () => user },
      epsAcceso: { findUnique: async () => member },
    },
  });
  const token = (claims = {}) =>
    jwt.sign({ id: 1, rol: 4, ...claims }, secret, { expiresIn: '1h' });
  async function run(t) {
    const res = response();
    let next = false;
    const req = { headers: { authorization: t ? 'Bearer ' + t : undefined } };
    await guard(req, res, () => {
      next = true;
    });
    return { res, next, req };
  }
  assert.equal((await run()).res.code, 401);
  assert.equal((await run('broken')).res.code, 401);
  for (const rol of [1, 2, 3, 99]) assert.equal((await run(token({ rol }))).res.code, 403);
  const ok = await run(token());
  assert.equal(ok.next, true);
  assert.deepEqual(ok.req.eps, { id: 'EPS-A', actor: 1 });
  assert.equal(ok.res.headers['Cache-Control'], 'no-store');
  user.estado = 'INACTIVO';
  assert.equal((await run(token())).res.code, 403);
  user.estado = 'ACTIVO';
  user.rol_id = 2;
  assert.equal((await run(token())).res.code, 403);
  user.rol_id = 4;
  member.activo = false;
  assert.equal((await run(token())).res.code, 403);
  member.activo = true;
  member.eps.activa = false;
  assert.equal((await run(token())).res.code, 403);
  member.eps.activa = true;
  member.revocado_at = new Date();
  assert.equal((await run(token())).res.code, 401);
  member = null;
  assert.equal((await run(token())).res.code, 403);
});
test('EPS sanitizes infrastructure errors and preserves validation/conflict status', async () => {
  for (const [error, status] of [
    [{ code: 'P2002' }, 409],
    [{ code: 'P2034' }, 409],
    [{ code: 'P2021' }, 503],
    [{ code: 'P1001' }, 503],
    [{ message: 'postgresql://SECRET' }, 500],
    [{ status: 404, message: 'Missing' }, 404],
  ]) {
    const c = createController({
        service: {
          dashboard: async () => {
            throw error;
          },
        },
      }),
      res = response();
    await c.dashboard({ eps: { id: 'EPS-A', actor: 1 } }, res);
    assert.equal(res.code, status);
    assert.ok(!JSON.stringify(res.body).includes('SECRET'));
  }
});
test('EPS denies foreign affiliate, authorization, request, patient and notification identifiers', async () => {
  const db = {
    afiliado: { findFirst: async () => null },
    epsAutorizacion: { findFirst: async () => null },
    solicitud: { findFirst: async () => null },
    usuario: { findFirst: async () => null },
    epsEvento: { findFirst: async () => null },
  };
  db.$transaction = (fn) => fn(db);
  const s = createService(db),
    c = { id: 'EPS-A', actor: 1 };
  for (const operation of [
    () => s.paciente(c, 2),
    () => s.historial(c, 'AFILIADO', 'foreign'),
    () => s.historial(c, 'AUTORIZACION', 2),
    () => s.historial(c, 'SOLICITUD', 2),
    () => s.leer(c, 2),
    () =>
      s.resolverAutorizacion(c, 2, { estado: 'APROBADA', motivo: 'Clinical review', version: 1 }),
    () => s.seguimiento(c, 2, { estado: 'EN_REVISION', motivo: 'Review' }),
  ])
    await assert.rejects(operation, (e) => e.status === 404);
});

test('EPS inventory import validates real snapshots and rejects duplicate or negative stock', () => {
  const { validateRows } = require('../scripts/eps-sync-inventory.cjs');
  const row = { farmacia_id: 5, medicamento_id: 1, stock: 0, minimo: 5 };
  assert.deepEqual(validateRows([row]), [row]);
  for (const bad of [
    [],
    [row, row],
    [{ ...row, stock: -1 }],
    [{ ...row, minimo: 1.2 }],
    [{ ...row, eps_id: 'foreign' }],
  ])
    assert.throws(() => validateRows(bad));
});

test('EPS identifies missing schema, outdated Prisma client, permissions and connection failures without secrets', async () => {
  const errors = [
    ['P2021', 'EPS_SCHEMA_PENDING'],
    ['P2022', 'EPS_SCHEMA_PENDING'],
    ['P1001', 'EPS_DATABASE_UNAVAILABLE'],
    ['P1000', 'EPS_DATABASE_PERMISSION'],
    ['42501', 'EPS_DATABASE_PERMISSION'],
  ];
  for (const [code, expected] of errors) {
    const recorded = [];
    const guard = createEpsSession({
      db: {
        usuario: {
          findUnique: async () => {
            throw Object.assign(new Error('postgresql://PRIVATE_SECRET'), { code });
          },
        },
        epsAcceso: { findUnique: async () => null },
      },
      verify: () => ({ id: 5, rol: 4, iat: Math.floor(Date.now() / 1000) }),
      report: (r) => recorded.push(r),
    });
    const res = response();
    await guard({ headers: { authorization: 'Bearer local-test' } }, res, () =>
      assert.fail('Must deny'),
    );
    assert.equal(res.code, 503);
    assert.equal(res.body.codigo, expected);
    assert.equal(recorded[0].code, code);
    assert.ok(!JSON.stringify({ body: res.body, recorded }).includes('PRIVATE_SECRET'));
  }
  const guard = createEpsSession({
    db: { usuario: { findUnique: async () => ({ id: 5, rol_id: 4, estado: 'ACTIVO' }) } },
    verify: () => ({ id: 5, rol: 4, iat: 1 }),
    report: () => {},
  });
  const res = response();
  await guard({ headers: { authorization: 'Bearer local-test' } }, res, () =>
    assert.fail('Must deny'),
  );
  assert.equal(res.body.codigo, 'EPS_PRISMA_CLIENT_PENDING');
});
test('EPS preserves source casing and accepts explicitly absent organization contact details', () => {
  const result = v.afiliado({ estado: 'Activo', regimen: 'Subsidiado' });
  assert.deepEqual(result, { estado: 'Activo', regimen: 'Subsidiado' });
  assert.equal(
    v.profile({
      nombre: 'EPS',
      ciudad: 'Medellin',
      correo: '',
      telefono: '',
      direccion: '',
      version: 1,
    }).correo,
    '',
  );
  assert.throws(() =>
    v.profile({
      nombre: 'EPS',
      ciudad: 'Medellin',
      correo: 'invalid',
      telefono: '',
      direccion: '',
      version: 1,
    }),
  );
});
