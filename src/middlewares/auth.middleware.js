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

        const token = authHeader.split(" ")[1];

        const payload = jwt.verify(token, process.env.JWT_SECRET);

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