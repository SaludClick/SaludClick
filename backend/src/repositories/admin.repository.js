
const pool = require("../config/database");

async function pedidos() {
    const result = await pool.query(`
        SELECT
            s.id,
            s.fecha,
            s.estado,
            s.tipo_entrega,
            CONCAT(
                u.nombre,
                ' ',
                COALESCE(u.apellido, '')
            ) AS usuario,
            u.correo,
            COALESCE(SUM(ds.subtotal), 0) AS total,
            COALESCE(p.estado, 'SIN PAGO') AS pago
        FROM solicitudes s
        JOIN usuarios u
            ON u.id = s.usuario_id
        LEFT JOIN detalle_solicitud ds
            ON ds.solicitud_id = s.id
        LEFT JOIN pagos p
            ON p.solicitud_id = s.id
        GROUP BY
            s.id, p.id, u.nombre, u.apellido, u.correo
        ORDER BY s.fecha DESC
        LIMIT 50
    `);

    return result.rows;
}

async function estadoPedido(id, estado) {
    const result = await pool.query(
        `UPDATE solicitudes
         SET estado = $1
         WHERE id = $2`,
        [estado, id]
    );

    return result.rowCount;
}

module.exports = {
    pedidos,
    estadoPedido
};
