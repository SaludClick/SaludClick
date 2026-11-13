const prisma = require('../src/config/prisma');
const pool = require('../src/config/database');
(async () => {
  try {
    const correos = require('../src/config/authorized-accounts').obtenerCuentasAutorizadas().map(c => c.correo);
    const cuentas = await prisma.usuario.findMany({ where: { correo: { in: correos } }, select: { correo: true, rol_id: true, estado: true, tokens_recuperacion: { where: { expira_en: { gt: new Date() } }, select: { id: true } } } });
    const administracion = await require('../src/repositories/admin.repository').listarCuentas();
    console.log(JSON.stringify((await pool.query("SELECT u.correo, count(t.id)::int AS enlaces, max(extract(epoch from (t.expira_en - NOW())))::int AS segundosRestantes, current_setting('TimeZone') AS zona FROM usuarios u LEFT JOIN tokens_recuperacion t ON t.usuario_id=u.id WHERE u.correo=ANY($1::text[]) GROUP BY u.correo", [correos])).rows));
    const vigentes = (await pool.query('SELECT u.correo FROM usuarios u JOIN tokens_recuperacion t ON t.usuario_id=u.id WHERE u.correo=ANY($1::text[]) AND t.expira_en > NOW()', [correos])).rows;
    console.log(JSON.stringify(cuentas.map(({ tokens_recuperacion, ...cuenta }) => ({ ...cuenta, enlaceVigente: vigentes.some(a => a.correo === cuenta.correo), visibleAdministracion: administracion.some(a => a.correo === cuenta.correo) }))));
    console.log(JSON.stringify({ totalCuentas: await prisma.usuario.count(), cuentasPrevias: await prisma.usuario.count({ where: { correo: { notIn: correos } } }) }));
  } catch (error) { console.error(JSON.stringify({ verificacion: false, codigo: error.code || error.name })); process.exitCode = 1; }
  finally { await prisma.$disconnect(); await pool.end(); }
})();
