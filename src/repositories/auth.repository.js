const pool = require("../config/database");

const buscarPorCorreo = async (correo) => {

    const [rows] = await pool.query(
        "SELECT * FROM usuarios WHERE correo = ?",
        [correo]
    );

    return rows[0];
};

const register = async (usuario) => {

    const [resultado] = await pool.query(
        `INSERT INTO usuarios
        (nombre, apellido, correo, telefono, password, rol_id)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
            usuario.nombre,
            usuario.apellido,
            usuario.correo,
            usuario.telefono,
            usuario.password,
            usuario.rol_id
        ]
    );

    return resultado.insertId;
};
const login = async (correo) => {

    const [rows] = await pool.query(
        "SELECT * FROM usuarios WHERE correo = ?",
        [correo]
    );

    return rows[0];

};

module.exports = {
    buscarPorCorreo,
    register,
    login
};