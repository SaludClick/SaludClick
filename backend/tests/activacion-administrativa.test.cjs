const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const bcrypt = require('bcrypt');
const { revisarCuentas, activarCuentas, preguntarOculto } = require('../scripts/activar-cuentas-administrativamente.cjs');
const AUTORIZADAS = [{correo:'farmacia@example.com',rol_id:3},{correo:'eps@example.com',rol_id:4}];
const previousAllowlist = Object.fromEntries(['AUTHORIZED_FARMACIA_EMAIL','AUTHORIZED_EPS_EMAIL'].map(key => [key,process.env[key]]));
before(() => {
  process.env.AUTHORIZED_FARMACIA_EMAIL = AUTORIZADAS[0].correo;
  process.env.AUTHORIZED_EPS_EMAIL = AUTORIZADAS[1].correo;
});
after(() => {
  for(const [key,value] of Object.entries(previousAllowlist)) {
    if(value===undefined) delete process.env[key]; else process.env[key]=value;
  }
});

function escenario() {
  let filas = AUTORIZADAS.map((c, i) => ({ ...c, id: i + 10, estado: 'INACTIVO', password: '!ACTIVACION_PENDIENTE' }));
  filas.push({ id: 99, correo: 'otra@example.test', rol_id: 2, password: 'sin-cambios', estado: 'ACTIVO' });
  let tokens = [10, 11, 99];
  const cambios = [];
  const prisma = {
    usuario: { findMany: async () => structuredClone(filas.filter(f => f.id !== 99)) },
    $transaction: async (fn, opciones) => {
      assert.equal(opciones.isolationLevel, 'Serializable');
      const trabajo = structuredClone(filas);
      const borrados = [];
      const resultado = await fn({
        usuario: {
          updateMany: async ({ where, data }) => {
            const fila = trabajo.find(f => Object.entries(where).every(([k, v]) => f[k] === v));
            if (!fila) return { count: 0 };
            assert.deepEqual(Object.keys(data), ['password']);
            Object.assign(fila, data); cambios.push('password'); return { count: 1 };
          },
          findUnique: async ({ where }) => trabajo.find(f => f.id === where.id),
          update: async ({ where, data }) => {
            assert.deepEqual(data, { estado: 'ACTIVO' });
            Object.assign(trabajo.find(f => f.id === where.id), data); cambios.push('estado');
          }
        },
        tokenRecuperacion: { deleteMany: async ({ where }) => { borrados.push(where.usuario_id); } }
      });
      filas = trabajo; tokens = tokens.filter(id => !borrados.includes(id));
      return resultado;
    }
  };
  return { prisma, filas: () => filas, tokens: () => tokens, cambios };
}

test('activa solo los dos destinos con bcrypt coste 10 y consume únicamente sus enlaces', async () => {
  const s = escenario();
  const cuentas = await revisarCuentas(s.prisma);
  const passwords = ['contraseña ficticia farmacia', 'contraseña ficticia eps'];
  const resultado = await activarCuentas({ prisma: s.prisma, bcrypt, cuentas, passwords });
  assert.equal(resultado.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(s.filas()[i].estado, 'ACTIVO');
    assert.equal(s.filas()[i].rol_id, AUTORIZADAS[i].rol_id);
    assert.equal(bcrypt.getRounds(s.filas()[i].password), 10);
    assert.equal(await bcrypt.compare(passwords[i], s.filas()[i].password), true);
  }
  assert.deepEqual(s.cambios, ['password', 'estado', 'password', 'estado']);
  assert.deepEqual(s.tokens(), [99]);
  assert.equal(s.filas()[2].password, 'sin-cambios');
});

test('cambio concurrente en la segunda cuenta revierte también la primera', async () => {
  const s = escenario();
  const cuentas = await revisarCuentas(s.prisma);
  s.filas()[1].password = 'cambio-concurrente';
  await assert.rejects(activarCuentas({ prisma: s.prisma, bcrypt, cuentas, passwords: ['frase ficticia suficientemente larga', 'otra frase ficticia suficientemente larga'] }), /cambió/);
  assert.equal(s.filas()[0].password, '!ACTIVACION_PENDIENTE');
  assert.equal(s.filas()[0].estado, 'INACTIVO');
  assert.deepEqual(s.tokens(), [10, 11, 99]);
});

test('rechaza roles incorrectos y contraseñas cortas o truncables', async () => {
  const s = escenario();
  const cuentas = await revisarCuentas(s.prisma);
  s.filas()[0].rol_id = 2;
  await assert.rejects(revisarCuentas(s.prisma), /inesperado/);
  for (const password of ['corta', 'á'.repeat(37)]) {
    await assert.rejects(activarCuentas({ prisma: s.prisma, bcrypt, cuentas, passwords: [password, 'otra frase ficticia válida'] }), /12 caracteres/);
  }
  assert.deepEqual(s.cambios, []);
});

test('fallo de verificación del hash impide activar y revierte la contraseña', async () => {
  const s = escenario();
  const cuentas = await revisarCuentas(s.prisma);
  await assert.rejects(activarCuentas({ prisma: s.prisma, bcrypt: { hash: bcrypt.hash, compare: async () => false }, cuentas, passwords: ['frase ficticia válida uno', 'frase ficticia válida dos'] }), /verificar/);
  assert.equal(s.filas()[0].estado, 'INACTIVO');
  assert.equal(s.filas()[0].password, '!ACTIVACION_PENDIENTE');
});

test('--check acepta estados activos o mixtos sin consultar hashes ni escribir', async () => {
  let filas = AUTORIZADAS.map((c, i) => ({ ...c, id: i + 10, estado: 'ACTIVO' }));
  const prisma = { usuario: { findMany: async ({ select }) => {
    assert.equal(select.password, undefined);
    return structuredClone(filas);
  } } };
  const activas = await revisarCuentas(prisma, { soloLectura: true });
  assert.equal(activas.every(c => c.estado === 'ACTIVO'), true);
  filas[1].estado = 'INACTIVO';
  const mixtas = await revisarCuentas(prisma, { soloLectura: true });
  assert.equal(mixtas.every(c => c.estado === 'ACTIVO'), false);
  filas[1].estado = null;
  await assert.rejects(revisarCuentas(prisma, { soloLectura: true }), /inesperado/);
  filas[1].estado = 'ACTIVO';
  filas[1].rol_id = 3;
  await assert.rejects(revisarCuentas(prisma, { soloLectura: true }), /inesperado/);
  filas[1] = { ...AUTORIZADAS[1], id: 11, estado: 'ACTIVO', correo: 'otro@example.test' };
  await assert.rejects(revisarCuentas(prisma, { soloLectura: true }), /inesperado/);
});

test('revisión para --apply conserva el rechazo de cuentas ya activas', async () => {
  const s = escenario();
  s.filas()[0].estado = 'ACTIVO';
  await assert.rejects(revisarCuentas(s.prisma), /inesperado/);
});

test('entrada oculta no imprime caracteres y restaura el modo de terminal', async () => {
  const input = Object.assign(new EventEmitter(), { isTTY: true, isRaw: false, setEncoding() {}, setRawMode(v) { this.isRaw = v; }, resume() {}, pause() {} });
  let salida = '';
  const output = { isTTY: true, write(v) { salida += v; } };
  const pendiente = preguntarOculto('Contraseña: ', input, output);
  input.emit('data', 'valor-ficticio\r');
  assert.equal(await pendiente, 'valor-ficticio');
  assert.equal(salida, 'Contraseña: \n');
  assert.equal(input.isRaw, false);
  const cancelado = preguntarOculto('Otra: ', input, output);
  input.emit('data', '\u0003');
  await assert.rejects(cancelado, /cancelada/);
  assert.equal(input.isRaw, false);
  await assert.rejects(preguntarOculto('X', { isTTY: false }, output), /interactiva/);
});
