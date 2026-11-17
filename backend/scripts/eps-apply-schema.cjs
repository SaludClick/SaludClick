// Exact EPS migration only. Read-only by default; --apply requires both hashes.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const name = '20261114090000_eps_workspace';
const tables = [
  'eps_entidades',
  'eps_accesos',
  'eps_farmacias',
  'eps_existencias',
  'eps_autorizaciones',
  'eps_seguimientos',
  'eps_eventos',
  'eps_lecturas',
];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
async function inspect(client, hostname) {
  const identity = (
    await client.query('SELECT current_database() AS database,current_schema() AS schema')
  ).rows[0];
  const present = (
    await client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
      [
        tables.concat([
          '_prisma_migrations',
          'usuarios',
          'solicitudes',
          'medicamentos',
          'afiliados',
        ]),
      ],
    )
  ).rows.map((r) => r.table_name);
  const columns = (
    await client.query(
      "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN ('usuarios','solicitudes','medicamentos','afiliados')",
    )
  ).rows;
  const needed = {
    usuarios: ['id', 'rol_id', 'estado'],
    solicitudes: ['id', 'usuario_id', 'estado'],
    medicamentos: ['id'],
  };
  const missing = Object.entries(needed).flatMap(([t, cols]) =>
    cols
      .filter((c) => !columns.some((x) => x.table_name === t && x.column_name === c))
      .map((c) => t + '.' + c),
  );
  const migration = present.includes('_prisma_migrations')
    ? (
        await client.query(
          'SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=$1',
          [name],
        )
      ).rows
    : [];
  return {
    host: hostname,
    ...identity,
    targetFingerprint: hash(hostname + '/' + identity.database + '/' + identity.schema),
    present,
    missing,
    migrationRecords: migration,
  };
}
function validateSql(sql) {
  if (
    !/^BEGIN;\s/i.test(sql) ||
    !/COMMIT;\s*$/.test(sql) ||
    /\b(DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE|TYPE)|TRUNCATE|DELETE\s+FROM|ALTER\s+ROLE|CREATE\s+ROLE)\b/i.test(
      sql,
    )
  )
    fail('EPS_SQL_REVIEW_REQUIRED');
}
async function applySchema(client, { sql, expectedHash, expectedTarget, hostname, preApply }) {
  validateSql(sql);
  const checksum = hash(sql);
  if (checksum !== expectedHash) fail('EPS_SQL_HASH_MISMATCH');
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('saludclick_eps_workspace_migration'))",
    );
    const target = await inspect(client, hostname);
    if (target.targetFingerprint !== expectedTarget) fail('EPS_TARGET_MISMATCH');
    if (
      target.schema !== 'public' ||
      target.missing.length ||
      !target.present.includes('_prisma_migrations')
    )
      fail('EPS_PREREQUISITES_PENDING');
    const done = target.migrationRecords.filter((m) => m.finished_at && !m.rolled_back_at);
    if (
      done.length === 1 &&
      done[0].checksum === checksum &&
      tables.every((t) => target.present.includes(t))
    ) {
      await client.query('ROLLBACK');
      return {
        applied: false,
        alreadyApplied: true,
        migration: name,
        targetFingerprint: target.targetFingerprint,
      };
    }
    if (target.migrationRecords.length || tables.some((t) => target.present.includes(t)))
      fail('EPS_PARTIAL_SCHEMA_REQUIRES_REVIEW');
    if (target.present.includes('afiliados')) {
      const names = (
        await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='afiliados'",
        )
      ).rows.map((r) => r.column_name);
      if (
        ![
          'id',
          'nombres',
          'apellidos',
          'tipo_documento',
          'documento',
          'fecha_nacimiento',
          'telefono',
          'correo',
          'direccion',
          'ciudad',
          'regimen',
          'estado',
          'eps_id',
          'usuario_id',
          'verificado_por',
          'verificado_at',
        ].every((c) => names.includes(c)) ||
        names.includes('eps_version')
      )
        fail('EPS_AFFILIATE_SCHEMA_REQUIRES_REVIEW');
    }
    if (preApply) await preApply(client);
    const body = sql.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
    await client.query(body);
    await client.query(
      'INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES($1,$2,clock_timestamp(),$3,clock_timestamp(),1)',
      [crypto.randomUUID(), checksum, name],
    );
    await client.query('COMMIT');
    return {
      applied: true,
      migration: name,
      checksum,
      targetFingerprint: target.targetFingerprint,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

function recoveryEvidence(file, expectedHash, expectedTarget) {
  if (!file) fail('EPS_RECOVERABLE_BACKUP_REQUIRED');
  const actual = fs.realpathSync(file),
    root = path.resolve(__dirname, '../database/backups');
  const relative = path.relative(root, actual);
  if (path.isAbsolute(relative) || relative.startsWith('..')) fail('EPS_BACKUP_PATH_REJECTED');
  const evidence = JSON.parse(fs.readFileSync(actual, 'utf8'));
  if (
    !evidence.verified ||
    !evidence.localRestoreVerified ||
    !evidence.localRestoreStopped ||
    evidence.migration !== name ||
    evidence.sqlHash !== expectedHash ||
    evidence.targetFingerprint !== expectedTarget
  )
    fail('EPS_BACKUP_NOT_VERIFIED');
  const archivePath = fs.realpathSync(evidence.archive);
  const archiveRelative = path.relative(path.dirname(actual), archivePath);
  if (path.isAbsolute(archiveRelative) || archiveRelative.startsWith('..'))
    fail('EPS_BACKUP_PATH_REJECTED');
  const archive = fs.readFileSync(archivePath);
  if (
    archive.length !== evidence.bytes ||
    archive.subarray(0, 5).toString() !== 'PGDMP' ||
    hash(archive) !== evidence.archiveSha256
  )
    fail('EPS_BACKUP_ARCHIVE_CHANGED');
  return evidence;
}
async function matchRecoverySnapshot(client, evidence) {
  const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
  const names = Object.keys(evidence.tables).sort();
  if (!names.length) fail('EPS_BACKUP_TABLES_MISSING');
  await client.query(
    'LOCK TABLE ' + names.map((n) => 'public.' + quote(n)).join(',') + ' IN SHARE MODE',
  );
  const { fingerprints, epsFingerprint } = require('./enable-vitalix-visitors.cjs');
  if (JSON.stringify(await fingerprints(client)) !== JSON.stringify(evidence.tables))
    fail('EPS_PRIMARY_CHANGED_SINCE_BACKUP');
  if (JSON.stringify(await epsFingerprint()) !== JSON.stringify(evidence.sourceEPS))
    fail('EPS_SOURCE_CHANGED_SINCE_BACKUP');
}

async function main() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.includes('='))
      .map((a) => {
        const i = a.indexOf('=');
        return [a.slice(2, i), a.slice(i + 1)];
      }),
  );
  const env = {
    ...require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env'))),
    ...process.env,
  };
  const url = new URL(env.DATABASE_URL);
  if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode')))
    url.searchParams.set('sslmode', 'verify-full');
  const { Client } = require('pg'),
    client = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
    });
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../prisma/migrations', name, 'migration.sql'),
    'utf8',
  );
  validateSql(sql);
  try {
    await client.connect();
    if (process.argv.includes('--apply')) {
      if (!args['confirm-hash'] || !args.target) fail('EPS_EXPLICIT_CONFIRMATION_REQUIRED');
      const evidence = recoveryEvidence(args['backup-manifest'], args['confirm-hash'], args.target);
      console.log(
        JSON.stringify(
          await applySchema(client, {
            sql,
            expectedHash: args['confirm-hash'],
            expectedTarget: args.target,
            hostname: url.hostname,
            preApply: (c) => matchRecoverySnapshot(c, evidence),
          }),
          null,
          2,
        ),
      );
    } else {
      await client.query('BEGIN READ ONLY');
      const target = await inspect(client, url.hostname);
      await client.query('ROLLBACK');
      console.log(
        JSON.stringify(
          { mode: 'READ_ONLY_PLAN', migration: name, sqlHash: hash(sql), ...target },
          null,
          2,
        ),
      );
    }
  } finally {
    await client.end();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      JSON.stringify({
        estado: 'EPS_SCHEMA_NOT_APPLIED',
        codigo: /^[A-Za-z0-9_]+$/.test(e.code || '') ? e.code : e.name,
      }),
    );
    process.exitCode = 1;
  });
module.exports = {
  applySchema,
  inspect,
  hash,
  name,
  tables,
  recoveryEvidence,
  matchRecoverySnapshot,
};
