const { verificarToken } = require('../utils/jwt');
const { databaseFailure, safeDiagnostic } = require('../services/eps-errors');
function createEpsSession({
  db,
  report = (diagnostic) => console.error('EPS access check:', diagnostic),
  verify = verificarToken,
} = {}) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) return res.status(401).json({ ok: false, mensaje: 'Token no proporcionado' });
      const claims = verify(token),
        id = Number(claims.id);
      if (!Number.isSafeInteger(id) || id < 1)
        return res.status(401).json({ ok: false, mensaje: 'Sesion invalida.' });
      if (Number(claims.rol_id ?? claims.rol) !== 4)
        return res
          .status(403)
          .json({ ok: false, mensaje: 'Acceso restringido al personal de EPS.' });
      const prisma = db || require('../config/prisma');
      if (!prisma.usuario?.findUnique || !prisma.epsAcceso?.findUnique)
        throw Object.assign(new Error('EPS client unavailable'), {
          code: 'EPS_PRISMA_CLIENT_PENDING',
        });
      const user = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true, rol_id: true, estado: true },
      });
      if (!user || user.rol_id !== 4 || user.estado !== 'ACTIVO')
        return res
          .status(403)
          .json({ ok: false, mensaje: 'La cuenta EPS no tiene acceso vigente.' });
      const member = await prisma.epsAcceso.findUnique({
        where: { usuario_id: id },
        include: { eps: true },
      });
      if (!member?.activo || !member.eps?.activa)
        return res.status(403).json({
          ok: false,
          codigo: 'EPS_MEMBERSHIP_REQUIRED',
          mensaje:
            'La cuenta requiere una vinculacion EPS activa, configurada por un responsable autorizado.',
        });
      if (
        !Number.isInteger(claims.iat) ||
        (member.revocado_at && claims.iat * 1000 <= new Date(member.revocado_at).getTime())
      )
        return res
          .status(401)
          .json({ ok: false, mensaje: 'La sesion EPS fue revocada. Inicia sesion nuevamente.' });
      req.eps = { id: member.eps_id, actor: id };
      next();
    } catch (e) {
      const auth = ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(e.name);
      if (auth) return res.status(401).json({ ok: false, mensaje: 'Token inv\u00e1lido' });
      const failure = databaseFailure(e);
      report(safeDiagnostic(e, 'session'));
      res
        .status(failure.status)
        .json({ ok: false, codigo: failure.codigo, mensaje: failure.mensaje });
    }
  };
}
module.exports = { createEpsSession };
