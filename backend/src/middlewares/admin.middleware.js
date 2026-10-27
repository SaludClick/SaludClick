
const { validarJWT } = require("./auth.middleware");

const requireAdmin = [
    validarJWT,
    (req, res, next) => {
        const rol = Number(
            req.usuario?.rol_id ?? req.usuario?.rol
        );

        if (rol !== 1) {
            return res.status(403).json({
                ok: false,
                mensaje: "Acceso restringido al administrador del sistema."
            });
        }

        next();
    }
];

module.exports = { requireAdmin };
