const pool = require("../config/database");

function orderConflict(message) {
    return Object.assign(new Error(message), { status: 409 });
}

async function buscarPedidoIdempotenteEn(queryable, usuarioId, key, hash) {
    const { rows } = await queryable.query(
        `SELECT s.id AS "solicitudId", s.idempotency_hash, s.estado AS solicitud_estado,
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
    if (pedido.solicitud_estado === 'CANCELADA') {
        throw orderConflict('El pedido asociado a esta clave fue cancelado. Inicia un pedido nuevo.');
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
    idempotencyKey, idempotencyHash, formula
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
            const precio = typeof medicamento.precio === "number" ||
                (typeof medicamento.precio === "string" && /^-?\d+(?:\.\d+)?$/.test(medicamento.precio))
                ? Number(medicamento.precio)
                : NaN;
            if (!Number.isFinite(precio) || precio < 0.01) {
                throw orderConflict(`${medicamento.nombre} no tiene un precio comercial valido.`);
            }
            if (precio !== Number(item.precio)) {
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
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
             RETURNING id`,
            [solicitudId, usuarioId, pago.referencia, pago.metodo, pago.marca,
                pago.ultimos_digitos, total, pago.estado]
        );

        let asignacion = {};
        if (require('../config/farmacia-solicitudes').habilitadas()) {
            const farmacia = require('./farmacia-operacion.repository').createRepository();
            if (formula) {
                await farmacia.autorizarFormulaEn(connection, usuarioId, solicitudId, formula.id, formula.permiteDescarga, { pdfRequerido: true });
            }
            asignacion = await farmacia.asignarNuevaEn(connection, solicitudId, usuarioId);
        }
        await connection.query("COMMIT");
        return {
            ...asignacion,
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
                p.estado AS pago_estado, p.simulacion AS pago_simulado, p.metodo AS pago_metodo,
                p.marca AS pago_marca, p.ultimos_digitos
         FROM solicitudes s
         LEFT JOIN detalle_solicitud ds ON ds.solicitud_id = s.id
         LEFT JOIN pagos p ON p.solicitud_id = s.id
         WHERE s.usuario_id = $1
         ${require('../config/farmacia-operacion').habilitada()?'AND NOT EXISTS (SELECT 1 FROM solicitudes_ocultas_paciente o WHERE o.usuario_id=s.usuario_id AND o.solicitud_id=s.id)':''}
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

async function eliminarPedidoUsuario(usuarioId, pedidoId, ocultar = false) {
    const connection = await pool.connect();
    try {
        await connection.query("BEGIN");
        const { rows: [pedido] } = await connection.query(
            'SELECT id, estado FROM solicitudes WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
            [pedidoId, usuarioId]
        );
        if (!pedido) throw Object.assign(new Error('Pedido no encontrado.'), { status: 404 });
        if (ocultar) {
            require('../config/farmacia-operacion').disponible();
            await connection.query(
                'INSERT INTO solicitudes_ocultas_paciente(usuario_id, solicitud_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [usuarioId, pedidoId]
            );
        } else if (pedido.estado !== 'CANCELADA') {
            if (require('../config/farmacia-solicitudes').habilitadas()) {
                const { rows: asignaciones } = await connection.query(
                    'SELECT 1 FROM farmacia_asignaciones WHERE solicitud_id = $1 LIMIT 1',
                    [pedidoId]
                );
                if (asignaciones.length) {
                    throw Object.assign(new Error('El pedido conserva un registro de Farmacia y no se puede cancelar.'), { status: 409 });
                }
            }
            const { rows: pagosReales } = await connection.query(
                'SELECT id FROM pagos WHERE solicitud_id = $1 AND simulacion IS DISTINCT FROM TRUE LIMIT 1',
                [pedidoId]
            );
            if (!['PENDIENTE', 'APROBADA'].includes(pedido.estado) || pagosReales.length) {
                throw Object.assign(new Error('El pedido no puede cancelarse desde el historial. Contacta a soporte.'), { status: 409 });
            }
            const { rows: items } = await connection.query(
                'SELECT medicamento_id, SUM(cantidad)::int AS cantidad FROM detalle_solicitud WHERE solicitud_id = $1 GROUP BY medicamento_id ORDER BY medicamento_id',
                [pedidoId]
            );
            for (const item of items) {
                await connection.query('UPDATE medicamentos SET stock = stock + $1 WHERE id = $2', [item.cantidad, item.medicamento_id]);
            }
            await connection.query("UPDATE solicitudes SET estado = 'CANCELADA', updated_at = NOW() WHERE id = $1", [pedidoId]);
        }
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
