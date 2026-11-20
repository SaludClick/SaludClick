const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readCsv, categoryFor } = require('./importar-catalogo-invima');

const csvFile = path.resolve(__dirname, '../data/catalogo_invima.csv');
const fieldMap = {
  producto: ['nombre', 150], principio_activo: ['principio_activo'],
  concentracion: ['concentracion', 120], forma_farmaceutica: ['forma_farmaceutica', 120],
  presentacion: ['presentacion', 180], registro_sanitario: ['registro_sanitario', 100],
  via_administracion: ['via_administracion', 120], expediente: ['expediente', 40],
  titular: ['titular_registro', 220], modalidad: ['modalidad_comercializacion', 180],
  estado_registro: ['estado_registro_invima'], cum: ['cum'], ium: ['ium'],
};
const key = row => row.cum?.trim() && row.consecutivo?.trim()
  ? ['INVIMA-CUM', row.cum.trim(), row.consecutivo.trim()].join('-')
  : null;
const normalize = value => String(value ?? '').normalize('NFC').trim();
const sha = value => createHash('sha256').update(value).digest('hex');

function index(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const value = getKey(row);
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}
function duplicates(groups, identify) {
  return [...groups].filter(([, rows]) => rows.length > 1)
    .map(([value, rows]) => ({ valor: value, referencias: rows.map(identify) }));
}
function counts(rows, select) {
  const result = {};
  for (const row of rows) {
    const value = select(row) || '(sin dato)';
    result[value] = (Object.hasOwn(result, value) ? result[value] : 0) + 1;
  }
  return result;
}

function compare(source, medicines) {
  const csvByCode = index(source, key);
  const dbByCode = index(medicines, row => normalize(row.codigo_fuente));
  const csvRecord = index(source, row => normalize(row.registro_sanitario).toUpperCase());
  const dbRecord = index(medicines, row => normalize(row.registro_sanitario).toUpperCase());
  const filas = source.map(row => {
    const codigo = key(row);
    const matches = codigo ? dbByCode.get(codigo) || [] : [];
    const db = matches.length === 1 && csvByCode.get(codigo).length === 1 ? matches[0] : null;
    const categoria = categoryFor(row.producto + ' ' + row.principio_activo);
    const campos = { ...fieldMap, nombre_generico: ['nombre_generico', 180] };
    const diferencias = [];
    const calidad = [];
    for (const [field, [column, limit]] of Object.entries(campos)) {
      const original = normalize(field === 'nombre_generico' ? row.principio_activo : row[field]);
      const actual = normalize(db?.[column]);
      if (limit && Array.from(original).length > limit) calidad.push({ campo: column, problema: 'excede_limite', longitud: Array.from(original).length, limite: limit });
      if (db && original !== actual) {
        diferencias.push({ campo: column, csv: original, neon: actual,
          tipo: limit && actual && original.startsWith(actual) && (actual.length === limit || Array.from(actual).length === limit) ? 'compatible_con_recorte' : 'diferencia' });
      }
    }
    if (!normalize(row.concentracion) || !/\d/.test(row.concentracion)) {
      calidad.push({ campo: 'concentracion', problema: 'sin_cantidad_verificable' });
    }
    const registroCoincidente = dbRecord.get(normalize(row.registro_sanitario).toUpperCase()) || [];
    if (db && db.categoria !== categoria) diferencias.push({ campo: 'categoria', csv: categoria, neon: db.categoria, tipo: 'diferencia' });
    return {
      linea: row.__line, codigo, medicamento_id: db?.id ?? null, nombre: row.producto,
      estado: !codigo ? 'codigo_faltante' : matches.length > 1 || csvByCode.get(codigo).length > 1
        ? 'codigo_ambiguo' : db ? 'coincide_codigo' : 'solo_csv',
      registro_sanitario: row.registro_sanitario, estado_registro_csv: row.estado_registro,
      estado_cum_csv: row.estado_cum, ids_por_registro: registroCoincidente.map(item => item.id),
      principio_activo: row.principio_activo, concentracion: row.concentracion,
      forma_farmaceutica: row.forma_farmaceutica, presentacion: row.presentacion,
      via: row.via_administracion, atc: row.atc, descripcion_atc: row.descripcion_atc,
      categoria_regla_actual: categoria, categoria_neon: db?.categoria ?? null, diferencias, calidad,
    };
  });
  const soloNeon = medicines.filter(row => !csvByCode.has(normalize(row.codigo_fuente)));
  return {
    resumen: {
      csv: source.length, neon: medicines.length,
      loteInvimaNeon: medicines.filter(row => row.codigo_fuente?.startsWith('INVIMA-CUM-')).length,
      filas: counts(filas, row => row.estado), soloNeon: soloNeon.length,
      categoriasCsvReglaActual: counts(filas, row => row.categoria_regla_actual),
      categoriasNeon: counts(medicines, row => row.categoria),
      estadosRegistroCsv: counts(source, row => row.estado_registro),
      estadosCumCsv: counts(source, row => row.estado_cum),
      estadosNeon: counts(medicines, row => row.estado),
      precioCero: medicines.filter(row => Number(row.precio) === 0).length,
      precioCeroDisponible: medicines.filter(row => Number(row.precio) === 0 && row.estado === 'DISPONIBLE').length,
      precioCeroDisponibleConStock: medicines.filter(row => Number(row.precio) === 0 && row.estado === 'DISPONIBLE' && row.stock > 0).length,
      sinPrecioReferencial: medicines.filter(row => row.precio_referencial == null).length,
      sinFuentePrecio: medicines.filter(row => !normalize(row.fuente_precio)).length,
      sinFechaPrecio: medicines.filter(row => row.fecha_precio == null).length,
      formulaDesconocida: medicines.filter(row => row.requiere_formula == null).length,
      noVerificados: medicines.filter(row => !row.catalogo_verificado).length,
      diferencias: counts(filas.flatMap(row => row.diferencias), item => item.campo),
      hallazgosCalidad: counts(filas.flatMap(row => row.calidad), item => item.campo + '/' + item.problema),
    },
    duplicados: {
      codigoCsv: duplicates(csvByCode, row => row.__line),
      codigoNeon: duplicates(dbByCode, row => row.id),
      registroCsv: duplicates(csvRecord, row => row.__line),
      registroNeon: duplicates(dbRecord, row => row.id),
    },
    filas, soloNeon,
  };
}

async function snapshot(client) {
  const rows = async (sql, parameters) => (await client.query(sql, parameters)).rows;
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const [identidad] = await rows("SELECT current_database() AS base, current_schema() AS esquema_sesion, current_setting('transaction_read_only') AS solo_lectura, nullif(current_setting('neon.project_id', true),'') AS proyecto_servidor, nullif(current_setting('neon.branch_id', true),'') AS rama_servidor, nullif(current_setting('neon.endpoint_id', true),'') AS endpoint_servidor");
    if (identidad.solo_lectura !== 'on') throw new Error('READ_ONLY_REQUIRED');
    const medicines = await rows(
      "SELECT m.id,m.nombre,m.codigo_fuente,m.registro_sanitario,m.estado_registro_invima,m.cum,m.ium,m.expediente,m.titular_registro,m.modalidad_comercializacion,m.nombre_generico,m.principio_activo,m.concentracion,m.forma_farmaceutica,m.presentacion,m.via_administracion,m.estado,m.stock,m.precio,m.precio_referencial,m.fuente_precio,m.fecha_precio::text,m.requiere_formula,m.catalogo_verificado,c.nombre AS categoria FROM public.medicamentos m LEFT JOIN public.categorias c ON c.id=m.categoria_id ORDER BY m.id");
    const esquema = await rows(
      "SELECT table_name,column_name,data_type,is_nullable,character_maximum_length,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) ORDER BY table_name,ordinal_position",
      [['medicamentos','categorias','eps_farmacias','eps_existencias','detalle_solicitud','pagos']]);
    const indices = await rows(
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('medicamentos','eps_farmacias','eps_existencias','detalle_solicitud') ORDER BY tablename,indexname");
    const clavesForaneas = await rows(
      "SELECT conrelid::regclass::text AS tabla,conname,pg_get_constraintdef(oid) AS definicion FROM pg_constraint WHERE contype='f' AND conrelid=ANY(ARRAY[to_regclass('public.medicamentos'),to_regclass('public.eps_farmacias'),to_regclass('public.eps_existencias'),to_regclass('public.detalle_solicitud')]) ORDER BY 1,2");
    const convenios = await rows(
      "SELECT f.id AS convenio,f.eps_id,f.farmacia_id,f.activa,count(x.id)::int AS registros,count(x.id) FILTER(WHERE x.stock>0)::int AS con_stock FROM public.eps_farmacias f LEFT JOIN public.eps_existencias x ON x.vinculo_id=f.id GROUP BY f.id ORDER BY f.id");
    const inventario = await rows(
      "SELECT x.vinculo_id,x.medicamento_id,x.stock,x.minimo,f.eps_id,f.farmacia_id,f.activa FROM public.eps_existencias x JOIN public.eps_farmacias f ON f.id=x.vinculo_id ORDER BY x.vinculo_id,x.medicamento_id");
    const detalles = await rows(
      "SELECT medicamento_id,count(*)::int AS lineas,count(DISTINCT solicitud_id)::int AS pedidos,count(*) FILTER(WHERE precio=0)::int AS lineas_precio_cero,count(*) FILTER(WHERE subtotal=0)::int AS lineas_subtotal_cero FROM public.detalle_solicitud GROUP BY medicamento_id ORDER BY medicamento_id");
    const [pagos] = await rows(
      "SELECT count(*)::int AS registros,count(*) FILTER(WHERE monto=0)::int AS monto_cero,count(*) FILTER(WHERE monto=0 AND simulacion IS TRUE)::int AS simulados_cero,count(*) FILTER(WHERE monto=0 AND simulacion IS FALSE)::int AS reales_cero FROM public.pagos");
    const tablasCatalogo = await rows(
      "SELECT table_schema FROM information_schema.tables WHERE table_name='medicamentos' ORDER BY table_schema");
    const basesVisibles = await rows(
      "SELECT datname AS base FROM pg_database WHERE datallowconn AND NOT datistemplate AND has_database_privilege(datname,'CONNECT') ORDER BY datname");
    return { identidad, medicines, esquema, indices, clavesForaneas, convenios, inventario, detalles, pagos, tablasCatalogo, basesVisibles };
  } finally {
    await client.query('ROLLBACK');
  }
}

function destination(env, fileEnv) {
  const source = env.DATABASE_URL ? 'entorno del proceso' : 'backend/.env';
  const url = new URL(env.DATABASE_URL || fileEnv.DATABASE_URL);
  if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) url.searchParams.set('sslmode', 'verify-full');
  const host = url.hostname;
  const endpoint = host.endsWith('.neon.tech') ? host.split('.')[0].replace(/-pooler$/, '') : null;
  return { url, source, host, endpoint };
}
function csv(report) {
  const escape = value => {
    const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    return '"' + (/^\s*[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
  };
  const columns = Object.keys(report.filas[0] || { codigo: '' });
  return [columns, ...report.filas.map(row => columns.map(field => row[field]))]
    .map(fields => fields.map(escape).join(',')).join('\n') + '\n';
}

async function audit() {
  const { Client } = require('pg');
  const dotenv = require('dotenv');
  const connection = destination(process.env, dotenv.parse(fs.readFileSync(path.resolve(__dirname, '../.env'))));
  const client = new Client({ connectionString: connection.url.toString(), connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  const source = readCsv(csvFile);
  try {
    await client.connect();
    const { identidad, medicines, ...relations } = await snapshot(client);
    const report = {
      conexion: { origen: connection.source, host: connection.host, endpoint: connection.endpoint, ...identidad },
      csvSha256: sha(fs.readFileSync(csvFile)), ...compare(source, medicines), medicamentosNeon: medicines, ...relations,
    };
    return { ...report, huella: sha(JSON.stringify(report)) };
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  audit().then(report => {
    const [prefix, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('INVALID_ARGUMENTS');
    if (prefix) {
      fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2) + '\n');
      fs.writeFileSync(prefix + '.csv', csv(report));
    }
    console.log(JSON.stringify({ conexion: report.conexion, resumen: report.resumen, huella: report.huella }, null, 2));
  }).catch(error => {
    console.error('Auditoria no completada (' + (error.code || error.name) + ').');
    process.exitCode = 1;
  });
}
module.exports = { audit, compare, csv, destination, snapshot };
