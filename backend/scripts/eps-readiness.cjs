// Read-only deployment diagnostic. Never prints connection strings or identities.
const fs = require('node:fs'),
  path = require('node:path');
const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
const { Client } = require('pg');
async function main() {
  if (!env.DATABASE_URL || /CAMBIAR|replace|<|>/i.test(env.DATABASE_URL))
    throw Object.assign(new Error('Database configuration pending'), {
      code: 'EPS_DATABASE_CONFIG_PENDING',
    });
  const url = new URL(env.DATABASE_URL);
  if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode')))
    url.searchParams.set('sslmode', 'verify-full');
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const expected = [
      'eps_entidades',
      'eps_accesos',
      'eps_farmacias',
      'eps_existencias',
      'eps_autorizaciones',
      'eps_seguimientos',
      'eps_eventos',
      'eps_lecturas',
    ];
    const rows = (
      await client.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
        [expected.concat(['afiliados', 'usuarios', 'solicitudes', 'medicamentos'])],
      )
    ).rows.map((r) => r.table_name);
    const result = {
      readOnly: true,
      epsTablesPresent: expected.filter((t) => rows.includes(t)),
      epsTablesMissing: expected.filter((t) => !rows.includes(t)),
      existingBaseTables: rows.filter((t) => !expected.includes(t)),
    };
    if (rows.includes('usuarios'))
      result.activeEpsAccounts = Number(
        (
          await client.query(
            "SELECT count(*) AS n FROM usuarios WHERE rol_id=4 AND estado='ACTIVO'",
          )
        ).rows[0].n,
      );
    if (rows.includes('eps_accesos'))
      result.activeMemberships = Number(
        (
          await client.query(
            "SELECT count(*) AS n FROM eps_accesos a JOIN eps_entidades e ON e.id=a.eps_id JOIN usuarios u ON u.id=a.usuario_id WHERE a.activo AND e.activa AND u.rol_id=4 AND u.estado='ACTIVO'",
          )
        ).rows[0].n,
      );
    if (rows.includes('afiliados')) {
      result.affiliates = Number(
        (await client.query('SELECT count(*) AS n FROM afiliados')).rows[0].n,
      );
      result.linkedPatients = Number(
        (await client.query('SELECT count(*) AS n FROM afiliados WHERE usuario_id IS NOT NULL'))
          .rows[0].n,
      );
    }
    await client.query('ROLLBACK');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({ estado: 'EPS_READINESS_NOT_VERIFIED', codigo: error.code || error.name }),
  );
  process.exitCode = 1;
});
