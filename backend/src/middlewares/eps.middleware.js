const { validarJWT } = require("./auth.middleware");

const requireEps = [
    validarJWT,
    (req, res, next) => {
        const rol = Number(
            req.usuario?.rol_id ?? req.usuario?.rol
        );

        if (rol !== 4) {
            return res.status(403).json({
                ok: false,
                mensaje: "Acceso restringido al personal de EPS."
            });
        }

        next();
    }
];

module.exports = { requireEps };
