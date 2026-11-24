const { PublicError } = require("../utils/public-error");
const pool = require("../config/database");

const buscarPorCorreo = async (correo) => {
    const { rows } = await pool.query(
        "SELECT * FROM usuarios WHERE correo = $1",
        [correo]
    );
    return rows[0];
};

const buscarPorGoogle = async (subject) => {
    const { rows } = await pool.query(
        "SELECT id, nombre, apellido, correo, estado, rol_id FROM usuarios WHERE google_subject = $1",
        [subject]
    );
    return rows[0];
};

const vincularGoogle = async (usuario, subject) => {
    const { rows } = await pool.query(
        `UPDATE usuarios SET google_subject = $1
         WHERE id = $2 AND password = $3 AND correo = $4
           AND rol_id = 2 AND estado = 'ACTIVO' AND google_subject IS NULL
         RETURNING id, nombre, apellido, correo, estado, rol_id`,
        [subject, usuario.id, usuario.password, usuario.correo]
    );
    return rows[0];
};

const register = async (usuario) => {
    const resultado = await pool.query(
        `INSERT INTO usuarios
        (nombre, apellido, correo, telefono, tipo_documento, cedula, ciudad, password, rol_id)
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
    return resultado.rows[0].id;
};

const login = async (correo) => {
    const { rows } = await pool.query(
        "SELECT * FROM usuarios WHERE correo = $1",
        [correo]
    );
    return rows[0];
};

async function transaccionRecuperacion(usuarioId, operacion) {
    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");
        await connection.query("SELECT id FROM usuarios WHERE id = $1 FOR UPDATE", [usuarioId]);
        await operacion(connection);
        await connection.query("COMMIT");
    } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
    } finally {
        connection.release();
    }
}

const crearTokenRecuperacion = (usuarioId, tokenHash, expiraEn) =>
    transaccionRecuperacion(usuarioId, async connection => {
        await connection.query("DELETE FROM tokens_recuperacion WHERE usuario_id = $1", [usuarioId]);
        await connection.query(
            "INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en) VALUES ($1, $2, $3::timestamptz AT TIME ZONE 'UTC')",
            [usuarioId, tokenHash, expiraEn.toISOString()]
        );
    });

const buscarTokenRecuperacion = async (tokenHash) => {
    const { rows } = await pool.query(
        `SELECT tr.id AS token_id, tr.usuario_id, u.correo, u.password
         FROM tokens_recuperacion tr
         INNER JOIN usuarios u ON u.id = tr.usuario_id
         WHERE tr.token_hash = $1 AND tr.expira_en > (NOW() AT TIME ZONE 'UTC')
         LIMIT 1`,
        [tokenHash]
    );
    return rows[0];
};

const actualizarPassword = (usuarioId, passwordHash, tokenId) =>
    transaccionRecuperacion(usuarioId, async connection => {
        const consumed = await connection.query(
            "DELETE FROM tokens_recuperacion WHERE id = $1 AND usuario_id = $2 AND expira_en > (clock_timestamp() AT TIME ZONE 'UTC') RETURNING id",
            [tokenId, usuarioId]
        );
        if (!consumed.rows.length) throw new PublicError("El enlace es inválido o ya expiró.");
        await connection.query(
            `UPDATE usuarios SET password = $1,
             estado = CASE WHEN password = '!ACTIVACION_PENDIENTE' THEN 'ACTIVO' ELSE estado END
             WHERE id = $2`,
            [passwordHash, usuarioId]
        );
        await connection.query(
            "DELETE FROM tokens_recuperacion WHERE usuario_id = $1",
            [usuarioId]
        );
    });

const buscarPerfil = async (usuarioId) => {
    const { rows } = await pool.query(
        `SELECT id, nombre, apellido, correo, telefono, tipo_documento,
                cedula AS "numeroDocumento", ciudad, estado, rol_id
         FROM usuarios WHERE id = $1 LIMIT 1`,
        [usuarioId]
    );
    return rows[0];
};

const actualizarPerfil = async (usuarioId, data) => {
    await pool.query(
        `UPDATE usuarios
         SET nombre = $1, apellido = $2, telefono = $3,
             tipo_documento = $4, cedula = CASE WHEN $8 THEN $5 ELSE cedula END, ciudad = $6
         WHERE id = $7`,
        [
            data.nombre,
            data.apellido || null,
            data.telefono || null,
            data.tipoDocumento || null,
            data.numeroDocumento || data.cedula || null,
            data.ciudad || null,
            usuarioId,
            Object.hasOwn(data, 'numeroDocumento') || Object.hasOwn(data, 'cedula')
        ]
    );
    return buscarPerfil(usuarioId);
};

module.exports = {
    buscarPorCorreo,
    buscarPorGoogle,
    vincularGoogle,
    register,
    login,
    crearTokenRecuperacion,
    buscarTokenRecuperacion,
    actualizarPassword,
    buscarPerfil,
    actualizarPerfil
};
