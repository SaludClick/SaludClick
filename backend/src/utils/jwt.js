const jwt = require("jsonwebtoken");

const generarToken = (usuario) => {

    return jwt.sign(
        {
            id: usuario.id,
            correo: usuario.correo,
            rol: usuario.rol_id
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "8h"
        }
    );

};

module.exports = {
    generarToken
};