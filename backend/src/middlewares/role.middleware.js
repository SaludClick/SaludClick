const { validarJWT } = require('./auth.middleware');

const ROLES = Object.freeze({ ADMINISTRADOR: 1, USUARIO: 2, FARMACIA: 3, EPS: 4 });

function requireRole(rol, mensaje) {
    if (!Object.values(ROLES).includes(rol)) throw new Error('Rol no reconocido.');
    return [validarJWT, (req, res, next) => {
        const actual = Number(req.usuario?.rol_id ?? req.usuario?.rol);
        if (actual !== rol) return res.status(403).json({ ok: false, mensaje });
        next();
    }];
}

const requireUsuario = requireRole(ROLES.USUARIO, 'Acceso exclusivo para usuarios pacientes.');
module.exports = { ROLES, requireRole, requireUsuario };
