const { verificarToken } = require("../utils/jwt");
const repository = require('../repositories/farmacia-notificaciones.repository');

async function revocadaDesde(id) {
    return (await require('../config/database').query('SELECT revocadas_at FROM farmacia_sesiones WHERE usuario_id=$1',[id])).rows[0]?.revocadas_at;
}
function createAuthorize({ lookup = id => repository.usuarioVigente(id), verify = verificarToken, revocation = id =>
    require('../config/farmacia-operacion').habilitada() ? revocadaDesde(id) : null } = {}) {
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
        const revoked=await revocation(user.id);
        if(revoked&&(!claims.iat||claims.iat*1000<=new Date(revoked).getTime()))throw Object.assign(new Error('Vuelve a iniciar sesión para renovar tus permisos.'),{status:401});
        return { id: user.id, rol_id: 3, exp: claims.exp };
    };
}
const authorize = createAuthorize();
const authorizeSolicitudes = createAuthorize({ revocation: id =>
    require('../config/farmacia-solicitudes').habilitadas() ? revocadaDesde(id) : null });
const requireAuthenticatedPharmacy = check => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ ok: false, mensaje: 'Inicia sesión para continuar.' });
    try { req.farmacia = await check(token); next(); }
    catch (error) {
        const status = [401, 403].includes(error.status) ? error.status : 503;
        res.status(status).json({ ok: false, mensaje: status === 503 ? 'No se pudo verificar el acceso a Farmacia.' : error.message });
    }
};
const requireFarmaciaNotificaciones = requireAuthenticatedPharmacy(authorize);
module.exports = { createAuthorize, authorize, requireFarmaciaNotificaciones, requireFarmaciaVigente: requireFarmaciaNotificaciones,
    requireFarmaciaSolicitudes: requireAuthenticatedPharmacy(authorizeSolicitudes) };
