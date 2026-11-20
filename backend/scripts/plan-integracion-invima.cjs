const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readCsv, validateCatalogRows, categoryFor } = require('./importar-catalogo-invima');
const { destination, snapshot } = require('./auditar-catalogo-produccion.cjs');

const root = path.resolve(__dirname, '..');
const csvPath = path.join(root, 'data/catalogo_invima.csv');
const operational = { proyecto_servidor: 'lingering-credit-15662538', rama_servidor: 'br-tiny-dawn-b5ywl7yu', base: 'neondb' };
const expectedSource = { rama_servidor: 'br-royal-glade-be6dk7f6', base: 'neondb' };
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

function payload(row) {
  const value = name => row[name]?.trim() || null;
  return {
    codigo_fuente: row.codigo_fuente, nombre: value('producto'), categoria: categoryFor(row.producto + ' ' + row.principio_activo),
    expediente: value('expediente'), principio_activo: value('principio_activo'),
    nombre_generico: Array.from(value('principio_activo') || '').length <= 180 ? value('principio_activo') : null,
    concentracion: value('concentracion') && /\d/.test(row.concentracion) ? value('concentracion') : null,
    forma_farmaceutica: value('forma_farmaceutica'), presentacion: value('presentacion'),
    via_administracion: value('via_administracion'), titular_registro: value('titular'),
    registro_sanitario: value('registro_sanitario'), estado_registro_invima: value('estado_registro'),
    modalidad_comercializacion: value('modalidad'), cum: value('cum'), ium: value('ium'),
  };
}

function equivalences(item, current) {
  const name = normalize(current.nombre);
  const ingredient = normalize(current.principio_activo || current.nombre).replace(/\b\d+\b.*$/, '').trim();
  const searchable = [item.nombre, item.principio_activo].map(normalize);
  if (current.registro_sanitario && normalize(current.registro_sanitario) === normalize(item.registro_sanitario)) return 'registro_sanitario';
  if (name && searchable[0] === name) return 'nombre_exacto';
  if (ingredient.length >= 5 && searchable.some(field => (' ' + field + ' ').includes(' ' + ingredient + ' '))) return 'nombre_o_principio';
  return null;
}

const identityFields = ['codigo_fuente', 'cum', 'registro_sanitario', 'nombre', 'principio_activo', 'forma_farmaceutica', 'presentacion'];
function classify(products, current) {
  return products.map(item => {
    const existing = current.find(row => row.codigo_fuente === item.codigo_fuente);
    if (existing) {
      const fields = identityFields.filter(field => (existing[field] ?? null) !== (item[field] ?? null));
      return { codigo: item.codigo_fuente, categoria: item.categoria, estado: fields.length ? 'conflicto_codigo' : 'omitido_identico', id: existing.id, fields };
    }
    const candidates = current.filter(row => !row.codigo_fuente || normalize(row.registro_sanitario) === normalize(item.registro_sanitario))
      .map(row => ({ id: row.id, nombre: row.nombre, motivo: equivalences(item, row) })).filter(row => row.motivo);
    return { codigo: item.codigo_fuente, categoria: item.categoria, estado: candidates.length ? 'revision_equivalencia' : 'candidato', candidates };
  });
}

const tableNames = ['medicamentos', 'categorias', 'detalle_solicitud', 'eps_existencias', 'eps_farmacias', 'pagos'];
async function schema(client) {
  const cols = await client.query(
    "SELECT table_name,column_name,data_type,udt_name,character_maximum_length,numeric_precision,numeric_scale,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) ORDER BY table_name,column_name", [tableNames]);
  const constraints = await client.query(
    "SELECT r.relname AS tabla,c.conname AS nombre,pg_get_constraintdef(c.oid) AS definicion FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname=ANY($1) ORDER BY 1,2", [tableNames]);
  const indexes = await client.query(
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1) ORDER BY 1,2", [tableNames]);
  return { columns: cols.rows, constraints: constraints.rows, indexes: indexes.rows };
}
function schemaDiff(target, source) {
  const key = (section, row) => section === 'columns' ? row.table_name + '.' + row.column_name
    : section === 'constraints' ? row.tabla + '.' + row.nombre : row.tablename + '.' + row.indexname;
  return Object.fromEntries(Object.entries(target).map(([section, rows]) => {
    const left = new Map(rows.map(row => [key(section, row), row]));
    const right = new Map(source[section].map(row => [key(section, row), row]));
    return [section, [...new Set([...left.keys(), ...right.keys()])].sort().flatMap(id =>
      equal(left.get(id), right.get(id)) ? [] : [{ id, operativo: left.get(id) ?? null, invima: right.get(id) ?? null }])];
  }));
}
function prismaColumnDiff(model, sql) {
  const definition = /model Medicamento \{([\s\S]*?)\n\}/.exec(model)?.[1];
  if (!definition) throw new Error('PRISMA_MEDICAMENTO_MISSING');
  const types = { String: 'text', Int: 'integer', Decimal: 'numeric', DateTime: 'timestamp without time zone', Boolean: 'boolean', EstadoMedicamento: 'USER-DEFINED' };
  const columns = new Map(sql.columns.filter(row => row.table_name === 'medicamentos').map(row => [row.column_name, row]));
  return [...definition.matchAll(/^\s*(\w+)\s+(\w+)(\?)?(?![\w\[\]])([^\n]*)/gm)].flatMap(([, field, type, nullable, attrs]) => {
    if (!Object.hasOwn(types, type)) return [];
    const length = /@db\.VarChar\((\d+)\)/.exec(attrs);
    const decimal = /@db\.Decimal\((\d+),\s*(\d+)\)/.exec(attrs);
    const expected = { data_type: length ? 'character varying' : attrs.includes('@db.Date') ? 'date' : types[type], is_nullable: nullable ? 'YES' : 'NO' };
    if (length) expected.character_maximum_length = Number(length[1]);
    if (decimal) Object.assign(expected, { numeric_precision: Number(decimal[1]), numeric_scale: Number(decimal[2]) });
    if (type === 'EstadoMedicamento') expected.udt_name = type;
    const actual = columns.get(field);
    return actual && matches(actual, expected) ? [] : [{ campo: field, prisma: expected, postgresql: actual ?? null }];
  });
}
async function identity(client) {
  return (await client.query("SELECT current_database() AS base, nullif(current_setting('neon.project_id',true),'') AS proyecto_servidor, nullif(current_setting('neon.branch_id',true),'') AS rama_servidor, current_setting('transaction_read_only') AS solo_lectura")).rows[0];
}
function matches(actual, expected) {
  return Object.entries(expected).every(([field, value]) => actual[field] === value);
}
async function read(client, work) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try { return await work(); } finally { await client.query('ROLLBACK'); }
}
async function sourceEvidence(client, products) {
  return read(client, async () => {
    const ids = await identity(client);
    if (!matches(ids, expectedSource) || !ids.proyecto_servidor) throw new Error('INVIMA_SOURCE_ID_MISMATCH');
    if (matches(ids, operational)) throw new Error('INVIMA_SOURCE_IS_TARGET');
    const { rows } = await client.query('SELECT codigo_fuente, registro_sanitario, nombre, principio_activo, presentacion FROM public.medicamentos ORDER BY codigo_fuente');
    const expected = new Map(products.map(item => [item.codigo_fuente, item]));
    const codes = new Set(rows.map(row => row.codigo_fuente));
    const differences = rows.flatMap(row => {
      const item = expected.get(row.codigo_fuente);
      if (!item) return [{ codigo: row.codigo_fuente, campos: ['codigo_fuente'], critico: true }];
      const fields = ['registro_sanitario', 'nombre', 'principio_activo', 'presentacion'].filter(field => row[field] !== item[field]);
      if (!fields.length) return [];
      const onlyCut = fields.length === 1 && fields[0] === 'presentacion' &&
        typeof row.presentacion === 'string' && row.presentacion.length === 180 && item.presentacion?.startsWith(row.presentacion);
      return [{ codigo: row.codigo_fuente, campos: fields, critico: !onlyCut }];
    });
    const verified = rows.length === expected.size && codes.size === expected.size &&
      products.every(item => codes.has(item.codigo_fuente)) && !differences.some(item => item.critico);
    return { ids, filas: rows.length, huella: hash(rows), verified, differences, esquema: await schema(client) };
  });
}

const baseline = result => ({ medicamentos: result.medicines, convenios: result.convenios, inventario: result.inventario, pedidos: result.detalles, pagos: result.pagos });
function manifest({ products, target, source, targetSchema, csvHash, prismaHash, protectedHash, prismaSource }) {
  const rows = classify(products, target.medicines);
  const categories = [...new Set(products.map(item => item.categoria))].sort();
  const column = targetSchema.columns.find(col => col.table_name === 'medicamentos' && col.column_name === 'presentacion');
  const conflicts = rows.filter(row => ['conflicto_codigo','revision_equivalencia'].includes(row.estado));
  const gates = [];
  if (!source?.verified) gates.push('origen_invima_pendiente');
  if (products.some(row => (row.presentacion?.length || 0) > 180) && column?.data_type !== 'text') gates.push('presentacion_requiere_migracion');
  if (conflicts.length) gates.push('conflictos_pendientes');
  const data = {
    destino: target.identidad, origen: source || { esperado: expectedSource, verified: false },
    huellaCsv: csvHash, huellaPrismaLocal: prismaHash, huellaDatosOperativos: hash(baseline(target)),
    huellaEsquemaOperativo: hash(targetSchema), esquemaOperativo: targetSchema,
    huellaProtegida: protectedHash, huellaProductos: hash(products),
    prismaPresentacion: { tipoEsperado: 'text', operativo: column?.data_type ?? null,
      origen: source?.esquema.columns.find(col => col.table_name === 'medicamentos' && col.column_name === 'presentacion')?.data_type ?? null },
    diferenciasPostgreSQL: source ? schemaDiff(targetSchema, source.esquema) : null,
    diferenciasPrisma: prismaSource ? { operativo: prismaColumnDiff(prismaSource, targetSchema),
      invima: source ? prismaColumnDiff(prismaSource, source.esquema) : null } : null,
    categorias: categories, filas: rows, conflictos: conflicts,
    candidatos: rows.filter(row => row.estado === 'candidato').length,
    elegiblesParaAplicar: gates.length ? 0 : rows.filter(row => row.estado === 'candidato').length,
    bloqueos: gates, aplicable: !gates.length,
  };
  return { ...data, huellaManifiesto: hash(data) };
}

async function protectedRows(client, ids = null) {
  const medicines = await client.query('SELECT * FROM public.medicamentos WHERE $1::int[] IS NULL OR id=ANY($1) ORDER BY id', [ids?.medicamentos ?? null]);
  const relations = {};
  for (const table of ['categorias', 'eps_farmacias', 'eps_existencias', 'detalle_solicitud', 'pagos']) {
    const where = table === 'categorias' ? ' WHERE $1::int[] IS NULL OR id=ANY($1)' : '';
    const result = await client.query('SELECT * FROM public.' + table + where + ' ORDER BY id', where ? [ids ? ids.categorias : null] : []);
    // Only the fingerprint leaves this function; raw order/payment rows are never reported.
    relations[table] = result.rows;
  }
  return { ids: { medicamentos: medicines.rows.map(row => row.id), categorias: relations.categorias.map(row => row.id) }, hash: hash({ medicines: medicines.rows, relations }) };
}

async function insertApproved(client, products, approved, expectedIds) {
  const { huellaManifiesto, ...contents } = approved;
  if (hash(contents) !== huellaManifiesto) throw new Error('MANIFEST_CHANGED');
  if (!approved.aplicable || approved.bloqueos.length || !approved.origen.verified) throw new Error('MANIFEST_BLOCKED');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    const dest = await identity(client);
    if (!matches(dest, expectedIds)) throw new Error('TARGET_CHANGED');
    await client.query('LOCK TABLE public.categorias, public.medicamentos, public.eps_farmacias, public.eps_existencias, public.detalle_solicitud, public.pagos IN SHARE ROW EXCLUSIVE MODE');
    if (hash(await schema(client)) !== approved.huellaEsquemaOperativo) throw new Error('SCHEMA_CHANGED');
    const before = await protectedRows(client);
    if (before.hash !== approved.huellaProtegida || hash(products) !== approved.huellaProductos) throw new Error('BASELINE_CHANGED');
    const { rows } = await client.query('SELECT m.*, c.nombre AS categoria FROM public.medicamentos m JOIN public.categorias c ON c.id=m.categoria_id ORDER BY m.id');
    if (!equal(classify(products, rows), approved.filas)) throw new Error('IMPORT_PLAN_CHANGED');
    const fresh = new Set(approved.filas.filter(row => row.estado === 'candidato').map(row => row.codigo));
    const candidates = products.filter(item => fresh.has(item.codigo_fuente));
    await client.query("INSERT INTO public.categorias(nombre) SELECT DISTINCT x.categoria FROM jsonb_to_recordset($1::jsonb) x(categoria text) ON CONFLICT(nombre) DO NOTHING", [JSON.stringify(candidates)]);
    const fields = Object.keys(payload({})).filter(field => field !== 'categoria');
    const names = fields.join(',');
    const parameters = fields.map(field => 'x.' + field).join(',');
    const types = fields.map(field => field + ' text').join(',');
    const inserted = await client.query(
      "INSERT INTO public.medicamentos (" + names + ",categoria_id,precio,stock,estado,requiere_formula,catalogo_verificado) " +
      "SELECT " + parameters + ",c.id,0,0,'INACTIVO',NULL,false " +
      "FROM jsonb_to_recordset($1::jsonb) x(" + types + ",categoria text) JOIN public.categorias c ON c.nombre=x.categoria " +
      "ORDER BY x.codigo_fuente RETURNING id,codigo_fuente", [JSON.stringify(candidates)]);
    if (inserted.rows.length !== candidates.length) throw new Error('INSERT_COUNT_MISMATCH');
    if ((await protectedRows(client, before.ids)).hash !== before.hash) throw new Error('PROTECTED_DATA_CHANGED');
    await client.query('COMMIT');
    return inserted.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(args) {
  const flags = new Set(args);
  if ([...flags].some(arg => !['--plan', '--apply'].includes(arg) && !arg.startsWith('--out='))) throw new Error('INVALID_ARGUMENTS');
  if (flags.has('--plan') && flags.has('--apply')) throw new Error('INVALID_ARGUMENTS');
  // Production application stays locked until separately authorized.
  if (flags.has('--apply')) throw new Error('APPLICATION_DISABLED_PENDING_APPROVAL');
  const { Client } = require('pg');
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const targetUrl = destination(process.env, env).url;
  const sourceUrl = process.env.INVIMA_AUDIT_URL;
  const content = fs.readFileSync(csvPath, 'utf8');
  const csvHash = hash(content);
  const sourceRows = readCsv(csvPath);
  const products = validateCatalogRows(sourceRows, 1000).map(payload);
  const target = new Client({ connectionString: targetUrl.toString(), connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  const origin = sourceUrl ? new Client({ connectionString: destination({}, { DATABASE_URL: sourceUrl }).url.toString(), connectionTimeoutMillis: 10000, statement_timeout: 15000 }) : null;
  try {
    await target.connect();
    const data = await snapshot(target);
    if (!matches(data.identidad, operational)) throw new Error('OPERATIONAL_TARGET_MISMATCH');
    const { targetSchema, protectedHash } = await read(target, async () => ({
      targetSchema: await schema(target), protectedHash: (await protectedRows(target)).hash,
    }));
    let evidence = null;
    if (origin) {
      await origin.connect();
      evidence = await sourceEvidence(origin, products);
    }
    const prismaSource = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
    const report = manifest({ products, target: data, source: evidence, targetSchema, protectedHash, csvHash, prismaHash: hash(prismaSource), prismaSource });
    const output = args.find(arg => arg.startsWith('--out='));
    if (output) fs.writeFileSync(output.slice('--out='.length), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ destino: report.destino, candidatos: report.candidatos, conflictos: report.conflictos.length, bloqueos: report.bloqueos, huella: report.huellaManifiesto }, null, 2));
  } finally {
    if (origin) await origin.end();
    await target.end();
  }
}
module.exports = { main, classify, payload, manifest, schema, schemaDiff, sourceEvidence, protectedRows, insertApproved };
