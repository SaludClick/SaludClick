const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { compare, csv, destination, snapshot } = require('../scripts/auditar-catalogo-produccion.cjs');

const item = { __line: 2, cum: '001', consecutivo: '2', producto: '=TEST', presentacion: 'X'.repeat(184),
  concentracion: 'A', registro_sanitario: 'INVIMA 123', principio_activo: 'PARACETAMOL' };
const db = { id: 9, codigo_fuente: 'INVIMA-CUM-001-2', nombre: '=TEST', presentacion: 'X'.repeat(180),
  registro_sanitario: 'INVIMA 123', precio: '0.00', estado: 'DISPONIBLE', stock: 2 };

test('compares by source identity and reports a cut field and questionable concentration', () => {
  const report = compare([item], [db, { id: 10, registro_sanitario: ' invima 123 ', precio: 5 }]);
  assert.deepEqual(report, compare([item], [db, { id: 10, registro_sanitario: ' invima 123 ', precio: 5 }]));
  assert.equal(report.filas[0].medicamento_id, 9);
  assert.equal(report.filas[0].diferencias.find(x => x.campo === 'presentacion').tipo, 'compatible_con_recorte');
  assert.equal(report.resumen.hallazgosCalidad['concentracion/sin_cantidad_verificable'], 1);
  assert.equal(report.resumen.precioCeroDisponibleConStock, 1);
  assert.deepEqual(report.duplicados.registroNeon[0].referencias, [9, 10]);
  assert.equal(report.soloNeon[0].id, 10);
  assert.match(csv(report), /"'=TEST"/);
});

test('duplicate source codes remain ambiguous even when the sanitary registration matches', () => {
  const report = compare([item, { ...item, __line: 3 }], [db]);
  assert.deepEqual(report.duplicados.codigoCsv[0].referencias, [2, 3]);
  assert.ok(report.filas.every(row => row.estado === 'codigo_ambiguo' && row.medicamento_id === null));
  assert.equal(compare([item], [{ ...db, codigo_fuente: null }]).filas[0].estado, 'solo_csv');
});

test('connection origin is explicit and credentials are not part of the report metadata', () => {
  const service = 'postgresql://audit:demo@ep-one-pooler.region.aws.neon.tech/neondb?sslmode=require';
  const answer = destination({ DATABASE_URL: service }, { DATABASE_URL: 'postgresql://other/ignore' });
  assert.equal(answer.endpoint, 'ep-one');
  assert.equal(answer.source, 'entorno del proceso');
  assert.equal(answer.url.searchParams.get('sslmode'), 'verify-full');
  assert.equal(destination({}, { DATABASE_URL: service }).source, 'backend/.env');
});

test('snapshot always rolls back and never reads data without a read-only transaction', async () => {
  const statements = [];
  const client = { async query(sql) {
    statements.push(sql);
    if (statements.length === 2) return { rows: [{ solo_lectura: 'off' }] };
    return { rows: [] };
  } };
  await assert.rejects(snapshot(client), /READ_ONLY_REQUIRED/);
  assert.deepEqual(statements.map(s => s.split(' ')[0]), ['BEGIN', 'SELECT', 'ROLLBACK']);
  assert.match(statements[0], /REPEATABLE READ READ ONLY$/);
});

test('a zero-price available item is rejected before reaching the order write boundary', async () => {
  const repo = require.resolve('../src/repositories/order.repository');
  const service = require.resolve('../src/services/order.service');
  const previous = require.cache[repo];
  const environment = process.env.PEDIDOS_SIMULADOS;
  const captured = [];
  require.cache[repo] = { exports: {
    buscarPedidoIdempotente: async () => null,
    listarMedicamentos: async () => [db],
    crearPedidoConPago: async input => {
      captured.push(input);
      return { solicitudId: 1 };
    },
  } };
  process.env.PEDIDOS_SIMULADOS = 'true';
  try {
    const { crearPedido } = require(service);
    await assert.rejects(crearPedido(1, {
      items: [{ id: 9, cantidad: 1 }],
      pago: { numero: '4242424242424242', vencimiento: '12/30', cvv: '123', titular: 'Test' },
    }, randomUUID()), { status: 409, message: /precio comercial/ });
    assert.equal(captured.length, 0);
  } finally {
    delete require.cache[service];
    if (previous) require.cache[repo] = previous;
    else delete require.cache[repo];
    if (environment === undefined) delete process.env.PEDIDOS_SIMULADOS;
    else process.env.PEDIDOS_SIMULADOS = environment;
  }
});
