const jwt = require("jsonwebtoken");

const algorithm = "HS256";

function verificarToken(token) {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [algorithm] });
    const role = payload?.rol_id ?? payload?.rol;
    if (!Number.isSafeInteger(payload?.exp) || !Number.isSafeInteger(payload.iat) ||
        payload.iat > Math.floor(Date.now() / 1000) || payload.iat >= payload.exp ||
        !Number.isSafeInteger(payload.id) || payload.id < 1 ||
        ![1, 2, 3, 4].includes(role) ||
        (payload.rol_id !== undefined && payload.rol !== undefined && payload.rol_id !== payload.rol)) {
        throw new jwt.JsonWebTokenError("Atributos de sesión inválidos");
    }
    return payload;
}

const generarToken = (usuario) => {

    return jwt.sign(
        {
            id: usuario.id,
            correo: usuario.correo,
            rol: usuario.rol_id
        },
        process.env.JWT_SECRET,
        {
            algorithm,
            expiresIn: "8h"
        }
    );

};

module.exports = {
    generarToken,
    verificarToken
};
