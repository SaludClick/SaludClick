const pool = require("../config/database");

async function listarMedicamentos(ids) {
    if (!ids || ids.length === 0) return [];

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(",");
    const { rows } = await pool.query(
        `SELECT id, nombre, descripcion, categoria_id, precio, stock, imagen, estado
         FROM medicamentos WHERE id IN (${placeholders})`,
        ids
    );
    return rows;
}

async function crearPedidoConPago({
    usuarioId, tipoEntrega, direccion, observaciones, items, total, pago
}) {
    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");

        for (const item of items) {
            const { rows } = await connection.query(
                `SELECT id, nombre, precio, stock, estado
                 FROM medicamentos WHERE id = $1 FOR UPDATE`,
                [item.medicamento_id]
            );
            const medicamento = rows[0];

            if (!medicamento || medicamento.estado !== "DISPONIBLE") {
                throw new Error(`El medicamento ${item.medicamento_id} no está disponible.`);
            }
            if (medicamento.stock < item.cantidad) {
                throw new Error(
                    `Stock insuficiente para ${medicamento.nombre}. Disponible: ${medicamento.stock}.`
                );
            }
        }

        const pedidoResult = await connection.query(
            `INSERT INTO solicitudes
                (usuario_id, estado, tipo_entrega, direccion, observaciones)
             VALUES ($1, 'APROBADA', $2, $3, $4)
             RETURNING id`,
            [usuarioId, tipoEntrega, direccion || null, observaciones || null]
        );
        const solicitudId = pedidoResult.rows[0].id;

        for (const item of items) {
            await connection.query(
                `INSERT INTO detalle_solicitud
                    (solicitud_id, medicamento_id, cantidad, precio, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [solicitudId, item.medicamento_id, item.cantidad, item.precio, item.subtotal]
            );
            await connection.query(
                `UPDATE medicamentos SET stock = stock - $1 WHERE id = $2`,
                [item.cantidad, item.medicamento_id]
            );
        }

        const pagoResult = await connection.query(
            `INSERT INTO pagos
                (solicitud_id, usuario_id, referencia, metodo, marca,
                 ultimos_digitos, monto, estado, simulacion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
             RETURNING id`,
            [solicitudId, usuarioId, pago.referencia, pago.metodo, pago.marca,
                pago.ultimos_digitos, total, pago.estado]
        );

        await connection.query("COMMIT");
        return { solicitudId, pagoId: pagoResult.rows[0].id };
    } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
    } finally {
        connection.release();
    }
}

async function listarPedidosUsuario(usuarioId) {
    const { rows } = await pool.query(
        `SELECT s.id, s.fecha, s.estado, s.tipo_entrega, s.direccion,
                COALESCE(SUM(ds.subtotal), 0) AS total,
                p.estado AS pago_estado, p.metodo AS pago_metodo,
                p.marca AS pago_marca, p.ultimos_digitos
         FROM solicitudes s
         LEFT JOIN detalle_solicitud ds ON ds.solicitud_id = s.id
         LEFT JOIN pagos p ON p.solicitud_id = s.id
         WHERE s.usuario_id = $1
         GROUP BY s.id, p.id
         ORDER BY s.fecha DESC`,
        [usuarioId]
    );
    return rows;
}

async function detallePedidoUsuario(usuarioId, pedidoId) {
    const { rows } = await pool.query(
        `SELECT s.id, s.fecha, s.estado, s.tipo_entrega, s.direccion,
                s.observaciones, ds.medicamento_id, m.nombre, m.imagen,
                ds.cantidad, ds.precio, ds.subtotal, p.referencia,
                p.estado AS pago_estado, p.metodo, p.marca, p.ultimos_digitos
         FROM solicitudes s
         JOIN detalle_solicitud ds ON ds.solicitud_id = s.id
         JOIN medicamentos m ON m.id = ds.medicamento_id
         LEFT JOIN pagos p ON p.solicitud_id = s.id
         WHERE s.usuario_id = $1 AND s.id = $2
         ORDER BY ds.id`,
        [usuarioId, pedidoId]
    );
    return rows;
}

async function eliminarPedidoUsuario(usuarioId, pedidoId) {
    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");
        const { rows: pedidos } = await connection.query(
            `SELECT id FROM solicitudes
             WHERE id = $1 AND usuario_id = $2 LIMIT 1`,
            [pedidoId, usuarioId]
        );
        if (!pedidos.length) throw new Error("Pedido no encontrado.");

        await connection.query(
            "DELETE FROM pagos WHERE solicitud_id = $1 AND usuario_id = $2",
            [pedidoId, usuarioId]
        );
        await connection.query(
            "DELETE FROM detalle_solicitud WHERE solicitud_id = $1",
            [pedidoId]
        );
        await connection.query(
            "DELETE FROM solicitudes WHERE id = $1 AND usuario_id = $2",
            [pedidoId, usuarioId]
        );
        await connection.query("COMMIT");
        return true;
    } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    listarMedicamentos,
    crearPedidoConPago,
    listarPedidosUsuario,
    detallePedidoUsuario,
    eliminarPedidoUsuario
};
