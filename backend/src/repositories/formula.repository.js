
const pool = require("../config/database");

async function crear(data) {
    const rutaArchivo = `private_uploads/${data.nombreArchivo}`;

    const result = await pool.query(
        `INSERT INTO formulas_medicas
         (
             usuario_id,
             nombre_archivo,
             nombre_original,
             tipo_mime,
             ruta_archivo,
             tamano,
             descripcion,
             estado
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDIENTE')
         RETURNING id`,
        [
            data.usuarioId,
            data.nombreArchivo,
            data.nombreOriginal,
            data.tipoMime,
            rutaArchivo,
            data.tamano,
            data.descripcion || null
        ]
    );

    return result.rows[0]?.id;
}

async function listarUsuario(usuarioId) {
    const result = await pool.query(
        `SELECT
             id,
             nombre_original AS nombre,
             tipo_mime,
             tamano,
             descripcion,
             estado,
             fecha_subida AS created_at
         FROM formulas_medicas
         WHERE usuario_id = $1
           AND estado <> 'ELIMINADA'
         ORDER BY fecha_subida DESC`,
        [usuarioId]
    );

    return result.rows;
}

async function buscarPropia(usuarioId, id) {
    const result = await pool.query(
        `SELECT *
         FROM formulas_medicas
         WHERE id = $1
           AND usuario_id = $2
           AND estado <> 'ELIMINADA'
         LIMIT 1`,
        [id, usuarioId]
    );

    return result.rows[0];
}

async function listarAdmin() {
    const result = await pool.query(
        `SELECT
             f.id,
             f.nombre_original AS nombre,
             f.tipo_mime AS f_tipo_mime,
             f.tamano,
             f.descripcion,
             f.estado,
             f.fecha_subida AS created_at,
             u.id AS usuario_id,
             CONCAT(
                 u.nombre,
                 ' ',
                 COALESCE(u.apellido, '')
             ) AS usuario,
             u.correo
         FROM formulas_medicas f
         JOIN usuarios u
             ON u.id = f.usuario_id
         WHERE f.estado <> 'ELIMINADA'
         ORDER BY f.fecha_subida DESC`
    );

    return result.rows;
}

async function actualizarEstado(id, estado) {
    const result = await pool.query(
        `UPDATE formulas_medicas
         SET estado = $1
         WHERE id = $2`,
        [estado, id]
    );

    return result.rowCount;
}

module.exports = {
    crear,
    listarUsuario,
    buscarPropia,
    listarAdmin,
    actualizarEstado
};
