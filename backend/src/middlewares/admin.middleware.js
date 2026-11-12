
const { session } = require("./administrative-session.middleware");

const requireAdmin = [
    session,
    (req, res, next) => {
        const rol = Number(
            req.usuario?.rol_id ?? req.usuario?.rol
        );

        if (rol !== 1) {
            return res.status(403).json({
                ok: false,
                mensaje: "Acceso restringido al personal administrativo."
            });
        }

        next();
    }
];

module.exports = { requireAdmin };
