
const { validarJWT } = require("./auth.middleware");

const requireFarmacia = [
    validarJWT,
    (req, res, next) => {
        const rol = Number(
            req.usuario?.rol_id ?? req.usuario?.rol
        );

        if (rol !== 3) {
            return res.status(403).json({
                ok: false,
                mensaje: "Acceso restringido al personal de farmacia."
            });
        }

        next();
    }
];

module.exports = { requireFarmacia };
