// Esta herramienta deliberadamente solo permite la base PostgreSQL aislada.
const fs = require('node:fs');
const { leerCsv, importar } = require('../src/services/afiliados-import.service');
async function main() {
    const { getTestDatabaseUrl } = require('../tests/support/postgres-test-safety.cjs');
    const url = getTestDatabaseUrl();
    const registros = leerCsv(fs.readFileSync(process.argv[2], 'utf8'));
    const { PrismaClient } = require('@prisma/client');
    const { PrismaPg } = require('@prisma/adapter-pg');
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    try {
        const [identidad] = await prisma.$queryRaw`SELECT current_database() AS nombre`;
        if (identidad.nombre !== 'saludclick_test') throw new Error('Destino rechazado.');
        console.log(JSON.stringify(await importar(prisma, registros)));
    } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('Importación cancelada. Comprueba CSV, destino aislado y migraciones; no se publican datos personales.'); process.exitCode = 1; });
