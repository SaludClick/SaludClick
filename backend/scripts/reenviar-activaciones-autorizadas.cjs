require('dotenv').config({ quiet: true });
const pool = require('../src/config/database');
const auth = require('../src/services/auth.service');
(async () => {
  try {
    for (const {correo, rol_id:rol} of require('../src/config/authorized-accounts').obtenerCuentasAutorizadas()) {
      const cuenta = await require('../src/repositories/auth.repository').buscarPorCorreo(correo);
      if (!cuenta || cuenta.rol_id !== rol || cuenta.estado !== 'INACTIVO' || cuenta.password !== '!ACTIVACION_PENDIENTE') throw new Error('Estado inesperado');
      await auth.solicitarRecuperacion(correo);
      console.log(JSON.stringify({ correo, smtpAceptado: true, activacion: 'PENDIENTE' }));
    }
  } catch { console.error('No se confirmó el reenvío completo.'); process.exitCode = 1; }
  finally { await pool.end(); }
})();
