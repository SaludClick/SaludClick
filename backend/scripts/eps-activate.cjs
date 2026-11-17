// Dry-run first. Explicit --apply --confirm-plan=HASH --target=HASH required.
const fs = require('node:fs'),
  path = require('node:path');
const { createActivationService } = require('../src/services/eps-activation.service');
const { hash } = require('./eps-apply-schema.cjs');
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
  const apply = process.argv.includes('--apply');
  if (!args.eps || !args.account)
    throw Object.assign(new Error('Use --eps=ID --account=ID'), {
      code: 'EPS_ACTIVATION_ARGUMENTS',
    });
  if (apply && (!args['confirm-plan'] || !args.target))
    throw Object.assign(new Error('Explicit plan and target approval required'), {
      code: 'EPS_ACTIVATION_APPROVAL_REQUIRED',
    });
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const db = require('../src/config/prisma'),
    pool = require('../src/config/database');
  const { obtenerConexionEPS, cerrarConexionEPS } = require('../src/config/eps-prisma');
  try {
    const url = new URL(process.env.DATABASE_URL);
    const identity = (
      await db.$queryRawUnsafe('SELECT current_database() AS database,current_schema() AS schema')
    )[0];
    const target = hash(url.hostname + '/' + identity.database + '/' + identity.schema);
    if (apply && args.target !== target)
      throw Object.assign(new Error('Wrong database target'), { code: 'EPS_TARGET_MISMATCH' });
    const service = createActivationService({
      db,
      readSource: async (epsId) => {
        const original = await require('../src/repositories/afiliados-origen.repository').leer();
        const connection = obtenerConexionEPS();
        const rows = await connection.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          return tx.$queryRawUnsafe(
            'SELECT id::text AS id,nombre,ciudad,estado FROM "' +
              connection.esquema +
              '".eps WHERE id::text=$1',
            epsId,
          );
        });
        return {
          entidad: rows[0],
          afiliados: original.afiliados.filter((a) => a.eps_id === epsId),
        };
      },
    });
    const metadata = args.metadata ? JSON.parse(fs.readFileSync(args.metadata, 'utf8')) : {};
    const input = { epsId: args.eps, accountId: Number(args.account), metadata };
    console.log(
      JSON.stringify(
        {
          host: url.hostname,
          database: identity.database,
          schema: identity.schema,
          targetFingerprint: target,
          ...(await (apply ? service.apply(input, args['confirm-plan']) : service.plan(input))),
        },
        null,
        2,
      ),
    );
  } finally {
    await cerrarConexionEPS();
    await db.$disconnect();
    await pool.end();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      JSON.stringify({
        estado: 'EPS_ACTIVATION_NOT_APPLIED',
        codigo: /^[A-Za-z0-9_]+$/.test(e.code || '') ? e.code : e.name,
      }),
    );
    process.exitCode = 1;
  });
