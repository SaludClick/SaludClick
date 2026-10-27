
const jwt = require("jsonwebtoken");

const validarJWT = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                ok: false,
                mensaje: "Token no proporcionado"
            });
        }

        const partes = authHeader.split(" ");

        if (
            partes.length !== 2 ||
            partes[0] !== "Bearer" ||
            !partes[1]
        ) {
            return res.status(401).json({
                ok: false,
                mensaje: "Formato de token inválido. Usa Bearer <token>."
            });
        }

        const payload = jwt.verify(
            partes[1],
            process.env.JWT_SECRET
        );

        req.usuario = payload;

        next();
    } catch (error) {
    return res.status(401).json({
        ok: false,
        mensaje: "Token inválido"
    });
}
};

module.exports = {
    validarJWT
};
