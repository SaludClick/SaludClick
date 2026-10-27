const pool = require("../config/database");

async function crear(data) {
    // Definimos la ruta del archivo para llenar la columna obligatoria 'ruta_archivo'
    const rutaArchivo = `private_uploads/${data.nombreArchivo}`;

    const [r] = await pool.query(
        `INSERT INTO formulas_medicas
         (usuario_id, nombre_archivo, nombre_original, tipo_mime, ruta_archivo, tamano, descripcion, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
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
    return r.insertId;
}

async function listarUsuario(usuarioId) {
    const [rows] = await pool.query(
        `SELECT id, nombre_original AS nombre, tipo_mime, tamano, descripcion, estado, fecha_subida AS created_at
         FROM formulas_medicas 
         WHERE usuario_id = ? AND estado <> 'ELIMINADA' 
         ORDER BY fecha_subida DESC`,
        [usuarioId]
    );
    return rows;
}

async function buscarPropia(usuarioId, id) {
    const [rows] = await pool.query(
        `SELECT * FROM formulas_medicas WHERE id = ? AND usuario_id = ? AND estado <> 'ELIMINADA' LIMIT 1`,
        [id, usuarioId]
    );
    return rows[0];
}

async function listarAdmin() {
    const [rows] = await pool.query(
        `SELECT f.id, f.nombre_original AS nombre, f.tipo_mime AS f_tipo_mime, f.tamano, f.descripcion, f.estado, f.fecha_subida AS created_at,
                u.id AS usuario_id, CONCAT(u.nombre, ' ', u.apellido) AS usuario, u.correo
         FROM formulas_medicas f 
         JOIN usuarios u ON u.id = f.usuario_id
         WHERE f.estado <> 'ELIMINADA' 
         ORDER BY f.fecha_subida DESC`
    );
    return rows;
}

async function actualizarEstado(id, estado) {
    const [r] = await pool.query(
        `UPDATE formulas_medicas SET estado = ? WHERE id = ?`,
        [estado, id]
    );
    return r.affectedRows;
}

module.exports = {
    crear,
    listarUsuario,
    buscarPropia,
    listarAdmin,
    actualizarEstado
};
