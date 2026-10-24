
const pool = require("../config/database");

const buscarPorCorreo = async (correo) => {
    const result = await pool.query(
        "SELECT * FROM usuarios WHERE correo = $1",
        [correo]
    );

    return result.rows[0];
};

const register = async (usuario) => {
    const result = await pool.query(
        `INSERT INTO usuarios
        (nombre, apellido, correo, telefono, tipo_documento,
         numero_documento, ciudad, password, rol_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
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

    return result.rows[0]?.id;
};

const login = async (correo) => {
    const result = await pool.query(
        "SELECT * FROM usuarios WHERE correo = $1",
        [correo]
    );

    return result.rows[0];
};

const crearTokenRecuperacion = async (usuarioId, tokenHash, expiraEn) => {
    await pool.query(
        `DELETE FROM tokens_recuperacion
         WHERE usuario_id = $1 OR expira_en < NOW()`,
        [usuarioId]
    );

    await pool.query(
        `INSERT INTO tokens_recuperacion
         (usuario_id, token_hash, expira_en)
         VALUES ($1, $2, $3)`,
        [usuarioId, tokenHash, expiraEn]
    );
};

const buscarTokenRecuperacion = async (tokenHash) => {
    const result = await pool.query(
        `SELECT tr.id AS token_id, tr.usuario_id, u.correo
         FROM tokens_recuperacion tr
         INNER JOIN usuarios u ON u.id = tr.usuario_id
         WHERE tr.token_hash = $1 AND tr.expira_en > NOW()
         LIMIT 1`,
        [tokenHash]
    );

    return result.rows[0];
};

const actualizarPassword = async (usuarioId, passwordHash, tokenId) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            "UPDATE usuarios SET password = $1 WHERE id = $2",
            [passwordHash, usuarioId]
        );

        await client.query(
            "DELETE FROM tokens_recuperacion WHERE id = $1",
            [tokenId]
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const buscarPerfil = async (usuarioId) => {
    const result = await pool.query(
        `SELECT id, nombre, apellido, correo, telefono,
                tipo_documento,
                numero_documento AS "numeroDocumento",
                ciudad, estado, rol_id
         FROM usuarios
         WHERE id = $1
         LIMIT 1`,
        [usuarioId]
    );

    return result.rows[0];
};

const actualizarPerfil = async (usuarioId, data) => {
    await pool.query(
        `UPDATE usuarios
         SET nombre = $1,
             apellido = $2,
             telefono = $3,
             tipo_documento = $4,
             numero_documento = $5,
             ciudad = $6
         WHERE id = $7`,
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
