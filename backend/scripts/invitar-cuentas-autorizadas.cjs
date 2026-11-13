// Localhost:4321 requiere NODE_ENV=development explícito.
require('dotenv').config({ quiet: true });
const pool = require('../src/config/database');
const auth = require('../src/services/auth.service');
const prisma = require('../src/config/prisma');
(async () => {
  try {
    for (const cuenta of require('../src/config/authorized-accounts').obtenerCuentasAutorizadas()) {
      try {
        const result = await auth.invitarCuenta(cuenta);
        console.log(JSON.stringify({ correo: result.correo, creada: true, smtpAceptado: true, activacion: 'PENDIENTE' }));
      } catch {
        const { rows } = await pool.query('SELECT rol_id,estado FROM usuarios WHERE lower(trim(correo))=$1', [cuenta.correo]);
        console.log(JSON.stringify({ correo: cuenta.correo, envioConfirmado: false, cuentaExiste: !!rows.length, estado: rows[0]?.estado, rol: rows[0]?.rol_id, requiereRevision: true }));
        process.exitCode = 1;
      }
    }
  } finally { await prisma.$disconnect(); await pool.end(); }
})().catch(() => { console.error('No se pudo completar el aprovisionamiento. No se muestran secretos.'); process.exitCode = 1; });
