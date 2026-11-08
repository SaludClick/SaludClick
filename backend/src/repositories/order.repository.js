const pool = require("../config/database");

function orderConflict(message) {
    return Object.assign(new Error(message), { status: 409 });
}

async function buscarPedidoIdempotenteEn(queryable, usuarioId, key, hash) {
    const { rows } = await queryable.query(
        `SELECT s.id AS "solicitudId", s.idempotency_hash,
                p.id AS "pagoId", p.monto AS total, p.estado,
                p.metodo, p.marca, p.ultimos_digitos, p.referencia
         FROM solicitudes s
         LEFT JOIN pagos p ON p.solicitud_id = s.id AND p.usuario_id = s.usuario_id
         WHERE s.usuario_id = $1 AND s.idempotency_key = $2`,
        [usuarioId, key]
    );
    if (!rows.length) return null;

    const pedido = rows[0];
    if (pedido.idempotency_hash !== hash) {
        throw orderConflict(
            "La clave Idempotency-Key ya fue utilizada con otros datos."
        );
    }
    if (pedido.pagoId == null) {
        throw new Error("No se pudo recuperar el resultado del pedido anterior.");
    }

    return {
        solicitudId: pedido.solicitudId,
        pagoId: pedido.pagoId,
        total: Number(pedido.total),
        pago: {
            estado: pedido.estado,
            metodo: pedido.metodo,
            marca: pedido.marca,
            ultimos_digitos: pedido.ultimos_digitos,
            referencia: pedido.referencia
        },
        replayed: true
    };
}

async function buscarPedidoIdempotente(usuarioId, key, hash) {
    return buscarPedidoIdempotenteEn(pool, usuarioId, key, hash);
}

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
    usuarioId, tipoEntrega, direccion, observaciones, items, total, pago,
    idempotencyKey, idempotencyHash
}) {
    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");

        const pedidoResult = await connection.query(
            `INSERT INTO solicitudes
                (usuario_id, estado, tipo_entrega, direccion, observaciones,
                 idempotency_key, idempotency_hash)
             VALUES ($1, 'APROBADA', $2, $3, $4, $5, $6)
             ON CONFLICT (usuario_id, idempotency_key) DO NOTHING
             RETURNING id`,
            [usuarioId, tipoEntrega, direccion || null, observaciones || null,
                idempotencyKey, idempotencyHash]
        );

        if (!pedidoResult.rows.length) {
            const existing = await buscarPedidoIdempotenteEn(
                connection,
                usuarioId,
                idempotencyKey,
                idempotencyHash
            );
            if (!existing) {
                throw new Error("No se pudo recuperar el resultado del pedido anterior.");
            }
            await connection.query("COMMIT");
            return existing;
        }

        const solicitudId = pedidoResult.rows[0].id;
        const orderedItems = [...items].sort(
            (a, b) => a.medicamento_id - b.medicamento_id
        );

        for (const item of orderedItems) {
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
                throw orderConflict(
                    `Stock insuficiente para ${medicamento.nombre}. Disponible: ${medicamento.stock}.`
                );
            }
            if (Number(medicamento.precio) !== Number(item.precio)) {
                throw orderConflict(
                    `El precio de ${medicamento.nombre} cambió. Actualiza el carrito.`
                );
            }
        }

        for (const item of orderedItems) {
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
        return {
            solicitudId,
            pagoId: pagoResult.rows[0].id,
            replayed: false
        };
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
    buscarPedidoIdempotente,
    crearPedidoConPago,
    listarPedidosUsuario,
    detallePedidoUsuario,
    eliminarPedidoUsuario
};
