const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/config/database');
(async () => {
  const connection = await pool.connect();
  try {
    // Migración existente, aditiva: rechaza conflictos y solo inserta el rol 4.
    await connection.query(fs.readFileSync(path.resolve(__dirname, '../prisma/migrations/20261110133900_add_eps_role/migration.sql'), 'utf8'));
    console.log(JSON.stringify({ rolEps: (await connection.query('SELECT id,nombre FROM roles WHERE id=4')).rows[0] }));
  } catch { await connection.query('ROLLBACK'); console.error('No se pudo preparar el rol EPS; no se modificaron cuentas.'); process.exitCode = 1; }
  finally { connection.release(); await pool.end(); }
})();
