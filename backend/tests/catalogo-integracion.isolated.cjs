const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { payload, schema, schemaDiff, manifest, protectedRows, insertApproved } = require('../scripts/plan-integracion-invima.cjs');

const a = payload({
  codigo_fuente: 'INVIMA-CUM-001-1', producto: 'Product ABC', principio_activo: 'Different active ingredient',
  presentacion: 'Original package '.repeat(38).trim(), registro_sanitario: 'INVIMA 001', concentracion: 'A',
});
const source = { verified: true, esquema: { columns: [], constraints: [], indexes: [] } };
const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261120180000_presentacion_medicamento_texto/migration.sql'), 'utf8');

async function fixture() {
  const db = await PGlite.create();
  await db.exec(
    "CREATE TABLE categorias(id serial PRIMARY KEY, nombre text UNIQUE NOT NULL);" +
    "CREATE TABLE medicamentos(id serial PRIMARY KEY, codigo_fuente text UNIQUE, nombre text NOT NULL, categoria_id int REFERENCES categorias(id), expediente text, principio_activo text, nombre_generico text, concentracion text, forma_farmaceutica text, presentacion varchar(180), via_administracion text, titular_registro text, registro_sanitario text, estado_registro_invima text, modalidad_comercializacion text, cum text, ium text, precio numeric NOT NULL, stock int NOT NULL, estado text NOT NULL, requiere_formula boolean, catalogo_verificado boolean, CHECK(nombre <> 'ERROR'));" +
    "CREATE TABLE detalle_solicitud(id serial PRIMARY KEY, medicamento_id int REFERENCES medicamentos(id));" +
    "CREATE TABLE eps_farmacias(id serial PRIMARY KEY);" +
    "CREATE TABLE eps_existencias(id serial PRIMARY KEY, vinculo_id int REFERENCES eps_farmacias(id), medicamento_id int REFERENCES medicamentos(id), UNIQUE(vinculo_id,medicamento_id));" +
    "CREATE TABLE pagos(id serial PRIMARY KEY, detalle_id int REFERENCES detalle_solicitud(id));" +
    "INSERT INTO categorias(nombre) VALUES('Existing'); INSERT INTO medicamentos(nombre,categoria_id,presentacion,precio,stock,estado) VALUES('Existing medicine',1,'short',500,4,'DISPONIBLE');" +
    "INSERT INTO detalle_solicitud(medicamento_id) VALUES(1); INSERT INTO pagos(detalle_id) VALUES(1);" +
    "INSERT INTO eps_farmacias DEFAULT VALUES; INSERT INTO eps_existencias(vinculo_id,medicamento_id) VALUES(1,1);"
  );
  return db;
}
async function plan(db, products, origin = source) {
  const medicines = (await db.query('SELECT m.*, c.nombre AS categoria FROM medicamentos m JOIN categorias c ON c.id=m.categoria_id ORDER BY m.id')).rows;
  return manifest({ products, target: { identidad: { base: 'postgres' }, medicines }, source: origin,
    targetSchema: await schema(db), protectedHash: (await protectedRows(db)).hash, csvHash: 'fixture', prismaHash: 'fixture' });
}

test('isolated PostgreSQL applies text migration, imports once, and preserves existing relations', async () => {
  const db = await fixture();
  try {
    const initial = await plan(db, [a], null);
    assert.deepEqual(initial.bloqueos, ['origen_invima_pendiente', 'presentacion_requiere_migracion']);
    await assert.rejects(insertApproved(db, [a], initial, { base: 'postgres' }), /MANIFEST_BLOCKED/);
    await db.exec(migration);
    const approved = await plan(db, [a]);
    assert.equal(approved.prismaPresentacion.operativo, 'text');
    await assert.rejects(insertApproved(db, [a], { ...approved, huellaCsv: 'changed' }, { base: 'postgres' }), /MANIFEST_CHANGED/);
    const inserted = await insertApproved(db, [a], approved, { base: 'postgres' });
    assert.deepEqual(inserted, [{ id: 2, codigo_fuente: a.codigo_fuente }]);
    const again = await plan(db, [a]);
    assert.equal(again.filas[0].estado, 'omitido_identico');
    assert.deepEqual(await insertApproved(db, [a], again, { base: 'postgres' }), []);
    const { rows } = await db.query('SELECT id, presentacion, estado, stock, precio, requiere_formula, catalogo_verificado FROM medicamentos ORDER BY id');
    assert.equal(rows[0].id, 1);
    assert.equal(rows[0].presentacion, 'short');
    assert.deepEqual(rows[1], { id: 2, presentacion: a.presentacion, estado: 'INACTIVO', stock: 0, precio: '0', requiere_formula: null, catalogo_verificado: false });
    const rel = await db.query('SELECT d.medicamento_id AS pedido,e.medicamento_id AS inventario FROM pagos p JOIN detalle_solicitud d ON d.id=p.detalle_id CROSS JOIN eps_existencias e');
    assert.deepEqual(rel.rows, [{ pedido: 1, inventario: 1 }]);
  } finally { await db.close(); }
});

test('isolated PostgreSQL rejects changed baseline and rolls back categories on failed import', async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    const invalid = { ...a, codigo_fuente: 'INVIMA-CUM-002-1', nombre: 'ERROR', categoria: 'Transient' };
    const first = await plan(db, [a]);
    await db.query('UPDATE medicamentos SET stock=9 WHERE id=1');
    await assert.rejects(insertApproved(db, [a], first, { base: 'postgres' }), /BASELINE_CHANGED/);
    const second = await plan(db, [a, invalid]);
    await assert.rejects(insertApproved(db, [a, invalid], second, { base: 'postgres' }), /check constraint/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM medicamentos')).rows[0].n, 1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM categorias')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('manifest isolates name candidates and schema differences deterministically', async () => {
  const db = await fixture();
  try {
    const item = { ...a, nombre: 'Existing medicine' };
    const report = await plan(db, [item]);
    assert.equal(report.conflictos[0].candidates[0].motivo, 'nombre_exacto');
    assert.equal(report.elegiblesParaAplicar, 0);
    assert.equal(report.huellaManifiesto, (await plan(db, [item])).huellaManifiesto);
    const old = await schema(db);
    await db.exec(migration);
    const diff = schemaDiff(old, await schema(db));
    assert.equal(diff.columns.find(row => row.id === 'medicamentos.presentacion').invima.data_type, 'text');
  } finally { await db.close(); }
});
