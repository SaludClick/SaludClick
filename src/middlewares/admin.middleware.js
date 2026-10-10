const { validarJWT } = require("./auth.middleware");

const requireAdmin = [
    validarJWT,
    (req, res, next) => {
        // Lee rol_id o rol de req.usuario
        const rol = Number(req.usuario?.rol_id ?? req.usuario?.rol);

        if (![1, 3].includes(rol)) {
            return res.status(403).json({ 
                ok: false, 
                mensaje: "Acceso restringido al personal administrativo." 
            });
        }
        next();
    }
];

module.exports = { requireAdmin };