const pool = require("../config/database");

const buscarPorCorreo = async (correo) => {
    const [rows] = await pool.query(
        "SELECT * FROM usuarios WHERE correo = ?",
        [correo]
    );
    return rows[0];
};

const register = async (usuario) => {
    // Se corrigió la coma sobrante y se agregó numero_documento a la consulta
    const [resultado] = await pool.query(
        `INSERT INTO usuarios
        (nombre, apellido, correo, telefono, tipo_documento, numero_documento, ciudad, password, rol_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            usuario.nombre, 
            usuario.apellido || null, 
            usuario.correo, 
            usuario.telefono || null,
            usuario.tipoDocumento || null, 
            usuario.numeroDocumento || usuario.cedula || null, 
            usuario.ciudad || null,
            usuario.password, 
            usuario.rol_id || 2
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

const crearTokenRecuperacion = async (usuarioId, tokenHash, expiraEn) => {
    await pool.query(
        "DELETE FROM tokens_recuperacion WHERE usuario_id = ? OR expira_en < NOW()",
        [usuarioId]
    );

    await pool.query(
        "INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en) VALUES (?, ?, ?)",
        [usuarioId, tokenHash, expiraEn]
    );
};

const buscarTokenRecuperacion = async (tokenHash) => {
    const [rows] = await pool.query(
        `SELECT tr.id AS token_id, tr.usuario_id, u.correo
         FROM tokens_recuperacion tr
         INNER JOIN usuarios u ON u.id = tr.usuario_id
         WHERE tr.token_hash = ? AND tr.expira_en > NOW()
         LIMIT 1`,
        [tokenHash]
    );
    return rows[0];
};

const actualizarPassword = async (usuarioId, passwordHash, tokenId) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query(
            "UPDATE usuarios SET password = ? WHERE id = ?",
            [passwordHash, usuarioId]
        );
        await connection.query(
            "DELETE FROM tokens_recuperacion WHERE id = ?",
            [tokenId]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const buscarPerfil = async (usuarioId) => {
    // Se corrigió 'cedula' por 'numero_documento'
    const [rows] = await pool.query(
        `SELECT id, nombre, apellido, correo, telefono, tipo_documento, numero_documento AS numeroDocumento, ciudad, estado, rol_id
         FROM usuarios WHERE id = ? LIMIT 1`, 
        [usuarioId]
    );
    return rows[0];
};

const actualizarPerfil = async (usuarioId, data) => {
    // Se agregó la actualización del campo numero_documento
    await pool.query(
        `UPDATE usuarios 
         SET nombre = ?, 
             apellido = ?, 
             telefono = ?, 
             tipo_documento = ?, 
             numero_documento = ?, 
             ciudad = ? 
         WHERE id = ?`,
        [
            data.nombre, 
            data.apellido || null, 
            data.telefono || null, 
            data.tipoDocumento || null, 
            data.numeroDocumento || data.cedula || null,
            data.ciudad || null, 
            usuarioId
        ]
    );
    return buscarPerfil(usuarioId);
};

module.exports = {
    buscarPorCorreo,
    register,
    login,
    crearTokenRecuperacion,
    buscarTokenRecuperacion,
    actualizarPassword,
    buscarPerfil,
    actualizarPerfil
};