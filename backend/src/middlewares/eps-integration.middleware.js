const jwt = require('jsonwebtoken');
const { createEpsSession } = require('./eps-session.middleware');
const { databaseFailure, safeDiagnostic } = require('../services/eps-errors');
function createGuard({ db, verify = (t) => jwt.verify(t, process.env.JWT_SECRET) } = {}) {
  return (...allowed) =>
    async (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      try {
        const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
        if (!match)
          return res.status(401).json({ ok: false, mensaje: 'Inicia sesion para continuar.' });
        const claims = verify(match[1]),
          id = Number(claims.id),
          rol = Number(claims.rol_id ?? claims.rol);
        if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(claims.iat))
          return res.status(401).json({ ok: false, mensaje: 'Sesion invalida.' });
        if (!allowed.includes(rol))
          return res
            .status(403)
            .json({ ok: false, mensaje: 'Operacion fuera de los permisos de tu rol.' });
        const prisma = db || require('../config/prisma');
        if (rol === 4)
          return createEpsSession({ db: prisma, verify })(req, res, () => {
            req.actor = { id, rol, epsId: req.eps.id };
            next();
          });
        const user = await prisma.usuario.findUnique({
          where: { id },
          select: { id: true, rol_id: true, estado: true },
        });
        if (!user || user.rol_id !== rol || user.estado !== 'ACTIVO')
          return res.status(403).json({ ok: false, mensaje: 'La cuenta no tiene acceso vigente.' });
        const pref = await prisma.preferenciaAdministrativa.findUnique({
          where: { usuario_id: id },
          select: { sesiones_revocadas_at: true },
        });
        if (
          pref?.sesiones_revocadas_at &&
          claims.iat * 1000 <= new Date(pref.sesiones_revocadas_at).getTime()
        )
          return res.status(401).json({ ok: false, mensaje: 'La sesion fue revocada.' });
        req.actor = { id, rol };
        next();
      } catch (e) {
        if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(e.name))
          return res.status(401).json({ ok: false, mensaje: 'Sesion invalida o expirada.' });
        const f = databaseFailure(e);
        console.error('EPS integration guard:', safeDiagnostic(e, 'integration-session'));
        res.status(f.status).json({ ok: false, codigo: f.codigo, mensaje: f.mensaje });
      }
    };
}
module.exports = { createGuard };
