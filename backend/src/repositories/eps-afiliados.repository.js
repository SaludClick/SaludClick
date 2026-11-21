async function buscarEntidadVigente(usuarioId, db = require('../config/database')) {
    const { rows } = await db.query(
        `SELECT e.id, e.nombre
         FROM usuarios u
         JOIN eps_accesos a ON a.usuario_id = u.id
         JOIN eps_entidades e ON e.id = a.eps_id
         WHERE u.id = $1 AND u.rol_id = 4 AND u.estado = 'ACTIVO'
           AND a.activo AND e.activa`,
        [usuarioId]
    );
    return rows.length === 1 ? rows[0] : null;
}

module.exports = { buscarEntidadVigente };
