const jwt = require('jsonwebtoken');

// Dependency injection keeps authorization tests independent of real accounts.
function createSessionGuard({ findUser = async id => {
    const prisma = require('../config/prisma');
    const rows = await prisma.$queryRawUnsafe(
        `SELECT u.id,u.rol_id,u.estado,p.sesiones_revocadas_at FROM usuarios u LEFT JOIN administrative_preferences p ON p.usuario_id=u.id WHERE u.id=$1`, id);
    return rows[0];
}, verify = token => jwt.verify(token, process.env.JWT_SECRET) } = {}) {
    return async function administrativeSession(req, res, next) {
        try {
            const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
            if (!match) return res.status(401).json({ ok:false, mensaje:'Inicia sesión para continuar.' });
            const claims = verify(match[1]);
            if (!Number.isSafeInteger(Number(claims.id)) || Number(claims.id) < 1)
                return res.status(401).json({ ok:false, mensaje:'Sesión inválida.' });
            const user = await findUser(Number(claims.id));
            if (!user || user.estado !== 'ACTIVO' || user.rol_id !== Number(claims.rol_id ?? claims.rol))
                return res.status(403).json({ ok:false, mensaje:'La cuenta no tiene acceso vigente. Los estados sin definir requieren revisión administrativa.' });
            if (req.allowedRoles && !req.allowedRoles.includes(user.rol_id))
                return res.status(403).json({ ok:false, mensaje:'Operación fuera de los permisos de tu cuenta.' });
            if(user.sesiones_revocadas_at && (!claims.iat || claims.iat*1000<=new Date(user.sesiones_revocadas_at).getTime()))
                return res.status(401).json({ok:false,mensaje:'Vuelve a iniciar sesión para renovar tus permisos.'});
            req.usuario = { id:user.id, rol:user.rol_id, rol_id:user.rol_id };
            next();
        } catch (error) {
            const authError = ['JsonWebTokenError','TokenExpiredError','NotBeforeError'].includes(error.name);
            const schema=['P2021','P2022','42P01','42703'].includes(error.code)||['42P01','42703'].includes(error.meta?.code);
            res.status(authError ? 401 : 503).json({ ok:false,codigo:schema?'ADMIN_SCHEMA_PENDING':undefined,mensaje:authError ? 'La sesión expiró o no es válida.' : schema?'El módulo requiere la migración administrativa pendiente de autorización.':'No se pudo comprobar el acceso vigente.' });
        }
    };
}
const session = createSessionGuard();
const roles = (...allowed) => [(req,res,next) => { req.allowedRoles=allowed; next(); }, session];
module.exports = { createSessionGuard, session, roles };
