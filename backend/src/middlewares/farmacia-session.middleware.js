const { requireFarmaciaVigente } = require('./farmacia-notificaciones.middleware');

// Shared routes retain their existing contract for every other role.
const esSesionFarmacia = usuario => [usuario?.rol_id, usuario?.rol].some(rol => Number(rol) === 3);
function farmaciaVigenteSiCorresponde(req, res, next) {
    if (!esSesionFarmacia(req.usuario)) return next();
    const { rol, rol_id } = req.usuario;
    if (rol !== undefined && rol_id !== undefined && Number(rol) !== Number(rol_id)) {
        return res.status(403).json({ ok: false, mensaje: 'La sesión no tiene un rol de Farmacia válido.' });
    }
    return requireFarmaciaVigente(req, res, next);
}
module.exports = { esSesionFarmacia, farmaciaVigenteSiCorresponde };
