// Prepara exclusivamente el destino local autenticado admitido por el preflight.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { getTestDatabaseUrl } = require('../tests/support/postgres-test-safety.cjs');
const { leerCsv } = require('../src/services/afiliados-import.service');
async function main() {
    process.env.DATABASE_URL = getTestDatabaseUrl();
    leerCsv(fs.readFileSync(process.env.AFILIADOS_CSV, 'utf8'));
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
    try {
        let disponible = false;
        for (let i = 0; i < 30; i++) {
            try {
                const { rows } = await pool.query('SELECT current_database() AS nombre');
                if (rows[0].nombre !== 'saludclick_test') throw new Error('Destino rechazado.');
                disponible = true; break;
            } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
        }
        if (!disponible) throw new Error('PostgreSQL aislado no disponible.');
    } finally { await pool.end(); }
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
    execFileSync(process.execPath, ['--test', 'tests/afiliados.postgres.cjs'], { stdio: 'inherit', env: process.env });
}
main().catch(() => { console.error('Validación aislada fallida. No se publican credenciales ni datos personales.'); process.exitCode = 1; });
