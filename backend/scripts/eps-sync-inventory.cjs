// Real pharmacy snapshots only. Plan is read-only unless --apply --confirm=EPS_ID.
const fs = require('node:fs');
const v = require('../src/validators/eps.validator');
function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000)
    v.fail('Snapshot must contain 1 to 10000 rows.');
  const seen = new Set();
  return rows.map((input) => {
    v.object(input, ['farmacia_id', 'medicamento_id', 'stock', 'minimo']);
    const row = {
      ...input,
      farmacia_id: v.id(input.farmacia_id),
      medicamento_id: v.id(input.medicamento_id),
    };
    if (
      !Number.isSafeInteger(row.stock) ||
      row.stock < 0 ||
      !Number.isSafeInteger(row.minimo) ||
      row.minimo < 0
    )
      v.fail('Stock and minimum must be nonnegative integers.');
    const key = row.farmacia_id + ':' + row.medicamento_id;
    if (seen.has(key)) v.fail('Duplicate pharmacy/medicine in snapshot.');
    seen.add(key);
    return row;
  });
}
async function syncInventory(db, epsId, input, { apply = false } = {}) {
  const rows = validateRows(input);
  v.text(epsId, 'EPS', 80);
  return db.$transaction(
    async (tx) => {
      if (!apply) await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const entity = await tx.epsEntidad.findFirst({
        where: { id: epsId, activa: true },
        select: { id: true },
      });
      if (!entity) v.fail('Active EPS not found.', 404);
      const pharmacies = await tx.epsFarmacia.findMany({
        where: { eps_id: epsId, activa: true, farmacia: { rol_id: 3, estado: 'ACTIVO' } },
        select: { id: true, farmacia_id: true },
      });
      const medicines = await tx.medicamento.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.medicamento_id))] } },
        select: { id: true },
      });
      const meds = new Set(medicines.map((r) => r.id));
      for (const row of rows) {
        const link = pharmacies.find((f) => f.farmacia_id === row.farmacia_id);
        if (!link || !meds.has(row.medicamento_id))
          v.fail('Snapshot references an unauthorized pharmacy or unknown medicine.');
        if (apply)
          await tx.epsExistencia.upsert({
            where: {
              vinculo_id_medicamento_id: {
                vinculo_id: link.id,
                medicamento_id: row.medicamento_id,
              },
            },
            create: {
              vinculo_id: link.id,
              medicamento_id: row.medicamento_id,
              stock: row.stock,
              minimo: row.minimo,
            },
            update: { stock: row.stock, minimo: row.minimo },
          });
      }
      return {
        eps: epsId,
        rows: rows.length,
        mode: apply ? 'APPLIED' : 'READ_ONLY_PLAN',
        globalInventoryModified: false,
      };
    },
    { isolationLevel: 'Serializable', timeout: 120000 },
  );
}
async function run() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.includes('='))
      .map((a) => {
        const i = a.indexOf('=');
        return [a.slice(2, i), a.slice(i + 1)];
      }),
  );
  if (!args.eps || !args.file)
    throw Object.assign(new Error('Use --eps=ID --file=PATH; default is read-only plan.'), {
      code: 'EPS_IMPORT_ARGUMENTS',
    });
  const apply = process.argv.includes('--apply');
  if (apply && args.confirm !== args.eps)
    throw Object.assign(new Error('Confirm the exact EPS id before applying.'), {
      code: 'EPS_IMPORT_CONFIRMATION',
    });
  const rows = validateRows(JSON.parse(fs.readFileSync(args.file, 'utf8')));
  const db = require('../src/config/prisma');
  try {
    console.log(JSON.stringify(await syncInventory(db, args.eps, rows, { apply }), null, 2));
  } finally {
    await db.$disconnect();
    await require('../src/config/database').end();
  }
}
if (require.main === module)
  run().catch((e) => {
    console.error(
      JSON.stringify({
        estado: 'EPS_INVENTORY_IMPORT_FAILED',
        codigo: e.code || e.status || e.name,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { validateRows, syncInventory };
