require('dotenv').config({ quiet: true });
const pool = require('../src/config/database');
const nodemailer = require('nodemailer');
(async () => {
  try {
    const main = new URL(process.env.DATABASE_URL);
    const eps = new URL(process.env.EPS_DATABASE_URL);
    console.log(JSON.stringify({ epsSameDatabase: main.hostname === eps.hostname && main.pathname === eps.pathname, frontendLocal: /localhost|127\.0\.0\.1/.test(process.env.FRONTEND_URL || '') }));
    console.log(JSON.stringify((await pool.query('SELECT current_database() AS database, current_schema() AS schema')).rows));
    console.log(JSON.stringify((await pool.query('SELECT id,nombre FROM roles ORDER BY id')).rows));
    const correos = require('../src/config/authorized-accounts').obtenerCuentasAutorizadas().map(c => c.correo);
    console.log(JSON.stringify((await pool.query('SELECT id,correo,rol_id,estado FROM usuarios WHERE lower(trim(correo))=ANY($1::text[])', [correos])).rows));
    console.log(JSON.stringify((await pool.query('SELECT count(*)::int AS usuarios FROM usuarios')).rows));
    console.log(JSON.stringify((await pool.query("SELECT to_regclass('public.afiliados') IS NOT NULL AS afiliadosEnBaseCuentas, to_regclass('public.tokens_recuperacion') IS NOT NULL AS tokensDisponibles")).rows));
  } catch (error) { console.log(JSON.stringify({ databaseError: error.code || error.name })); process.exitCode = 1; }
  finally { await pool.end(); }
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  console.log(JSON.stringify({ smtpMissing: missing }));
  if (missing.length) return;
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 });
  try { await transport.verify(); console.log(JSON.stringify({ smtpVerified: true })); }
  catch (error) { console.log(JSON.stringify({ smtpVerified: false, code: error.code, responseCode: error.responseCode })); }
  finally { transport.close(); }
})();
