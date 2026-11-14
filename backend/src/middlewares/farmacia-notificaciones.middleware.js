const jwt = require('jsonwebtoken');
const repository = require('../repositories/farmacia-notificaciones.repository');

function createAuthorize({ lookup = id => repository.usuarioVigente(id), verify = token => jwt.verify(token, process.env.JWT_SECRET) } = {}) {
    return async token => {
        let claims;
        try { claims = verify(token); }
        catch { throw Object.assign(new Error('Inicia sesión nuevamente.'), { status: 401 }); }
        if (!Number.isSafeInteger(claims?.id) || claims.id < 1 || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) {
            throw Object.assign(new Error('Sesión inválida o expirada.'), { status: 401 });
        }
        if (Number(claims.rol_id ?? claims.rol) !== 3) throw Object.assign(new Error('Acceso exclusivo de Farmacia.'), { status: 403 });
        const user = await lookup(claims.id);
        if (!user || user.rol_id !== 3 || user.estado !== 'ACTIVO') throw Object.assign(new Error('La cuenta no tiene acceso vigente a Farmacia.'), { status: 403 });
        return { id: user.id, rol_id: 3, exp: claims.exp };
    };
}
const authorize = createAuthorize();
async function requireFarmaciaNotificaciones(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ ok: false, mensaje: 'Inicia sesión para continuar.' });
    try { req.farmacia = await authorize(token); next(); }
    catch (error) {
        const status = [401, 403].includes(error.status) ? error.status : 503;
        res.status(status).json({ ok: false, mensaje: status === 503 ? 'No se pudo verificar el acceso a Farmacia.' : error.message });
    }
}
module.exports = { createAuthorize, authorize, requireFarmaciaNotificaciones, requireFarmaciaVigente: requireFarmaciaNotificaciones };
