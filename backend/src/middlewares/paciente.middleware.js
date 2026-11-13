const { validarJWT } = require("./auth.middleware");

const requirePaciente = [
    validarJWT,
    (req, res, next) => {
        const rol = Number(
            req.usuario?.rol_id ?? req.usuario?.rol
        );

        if (rol !== 2) {
            return res.status(403).json({
                ok: false,
                mensaje: "Acceso restringido a pacientes."
            });
        }

        next();
    }
];

module.exports = { requirePaciente };
