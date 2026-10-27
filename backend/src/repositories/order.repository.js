const pool = require("../config/database");

// LISTAR MEDICAMENTOS
async function listarMedicamentos(ids) {
    if (!ids || ids.length === 0) {
        return [];
    }

    const placeholders =
        ids.map(() => "?").join(",");

    const [rows] = await pool.query(
        `SELECT
            id,
            nombre,
            descripcion,
            categoria_id,
            precio,
            stock,
            imagen,
            estado
         FROM medicamentos
         WHERE id IN (${placeholders})`,
        ids
    );

    return rows;
}

// CREAR PEDIDO Y PAGO
async function crearPedidoConPago({
    usuarioId,
    tipoEntrega,
    direccion,
    observaciones,
    items,
    total,
    pago
}) {
    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        // -----------------------------------------
        // VERIFICAR STOCK
        // -----------------------------------------

        for (const item of items) {
            const [rows] =
                await connection.query(
                    `SELECT
                        id,
                        nombre,
                        precio,
                        stock,
                        estado
                     FROM medicamentos
                     WHERE id = ?
                     FOR UPDATE`,
                    [item.medicamento_id]
                );

            const med = rows[0];

            if (
                !med ||
                med.estado !== "DISPONIBLE"
            ) {
                throw new Error(
                    `El medicamento ${medicamentoId} no está disponible.`
                );
            }

            if (med.stock < item.cantidad) {
                throw new Error(
                    `Stock insuficiente para ${medicamento.nombre}. Disponible: ${medicamento.stock}.`
                );
            }
        }

        // -----------------------------------------
        // CREAR SOLICITUD
        // -----------------------------------------

        const [pedidoResult] =
            await connection.query(
                `INSERT INTO solicitudes
                (
                    usuario_id,
                    estado,
                    tipo_entrega,
                    direccion,
                    observaciones
                )
                VALUES (?, 'APROBADA', ?, ?, ?)`,
                [
                    usuarioId,
                    tipoEntrega,
                    direccion || null,
                    observaciones || null
                ]
            );

        const solicitudId =
            pedidoResult.insertId;

        // -----------------------------------------
        // CREAR DETALLES Y ACTUALIZAR STOCK
        // -----------------------------------------

        for (const item of items) {
            await connection.query(
                `INSERT INTO detalle_solicitud
                (
                    solicitud_id,
                    medicamento_id,
                    cantidad,
                    precio,
                    subtotal
                )
                VALUES (?, ?, ?, ?, ?)`,
                [
                    solicitudId,
                    item.medicamento_id,
                    item.cantidad,
                    item.precio,
                    item.subtotal
                ]
            );

            await connection.query(
                `UPDATE medicamentos
                 SET stock = stock - ?
                 WHERE id = ?`,
                [
                    item.cantidad,
                    item.medicamento_id
                ]
            );
        }

        // -----------------------------------------
        // CREAR PAGO
        // -----------------------------------------

        const [pagoResult] =
            await connection.query(
                `INSERT INTO pagos
                (
                    solicitud_id,
                    usuario_id,
                    referencia,
                    metodo,
                    marca,
                    ultimos_digitos,
                    monto,
                    estado,
                    simulacion
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    solicitudId,
                    usuarioId,
                    pago.referencia,
                    pago.metodo,
                    pago.marca,
                    pago.ultimos_digitos,
                    total,
                    pago.estado
                ]
            );

        await connection.commit();

        return {
            solicitudId,
            pagoId: pagoResult.insertId
        };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
}

// LISTAR PEDIDOS DEL USUARIO
async function listarPedidosUsuario(usuarioId) {
    const [rows] =
        await pool.query(
            `SELECT
                s.id,
                s.fecha,
                s.estado,
                s.tipo_entrega,
                s.direccion,

                COALESCE(
                    SUM(ds.subtotal),
                    0
                ) AS total,

                p.estado AS pago_estado,
                p.metodo AS pago_metodo,
                p.marca AS pago_marca,
                p.ultimos_digitos

             FROM solicitudes s

             LEFT JOIN detalle_solicitud ds
                ON ds.solicitud_id = s.id

             LEFT JOIN pagos p
                ON p.solicitud_id = s.id

             WHERE s.usuario_id = ?

             GROUP BY
                s.id,
                p.id

             ORDER BY s.fecha DESC`,
            [usuarioId]
        );

    return rows;
}

// DETALLE DE UN PEDIDO
// =================================================

async function detallePedidoUsuario(
    usuarioId,
    pedidoId
) {
    const [rows] =
        await pool.query(
            `SELECT
                s.id,
                s.fecha,
                s.estado,
                s.tipo_entrega,
                s.direccion,
                s.observaciones,

                ds.medicamento_id,
                m.nombre,
                m.imagen,
                ds.cantidad,
                ds.precio,
                ds.subtotal,

                p.referencia,
                p.estado AS pago_estado,
                p.metodo,
                p.marca,
                p.ultimos_digitos

             FROM solicitudes s

             JOIN detalle_solicitud ds
                ON ds.solicitud_id = s.id

             JOIN medicamentos m
                ON m.id = ds.medicamento_id

             LEFT JOIN pagos p
                ON p.solicitud_id = s.id

             WHERE
                s.usuario_id = ?
                AND s.id = ?

             ORDER BY ds.id`,
            [
                usuarioId,
                pedidoId
            ]
        );

    return rows;
}

// ELIMINAR PEDIDO DEL USUARIO
// =================================================

async function eliminarPedidoUsuario(
    usuarioId,
    pedidoId
) {
    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        // -----------------------------------------
        // VERIFICAR PROPIEDAD DEL PEDIDO
        // -----------------------------------------

        const [pedidos] =
            await connection.query(
                `SELECT id
                 FROM solicitudes
                 WHERE id = ?
                   AND usuario_id = ?
                 LIMIT 1`,
                [
                    pedidoId,
                    usuarioId
                ]
            );

        if (!pedidos.length) {
            throw new Error(
                "Pedido no encontrado."
            );
        }

        // -----------------------------------------
        // ELIMINAR PAGO
        // -----------------------------------------

        await connection.query(
            `DELETE FROM pagos
             WHERE solicitud_id = ?
               AND usuario_id = ?`,
            [
                pedidoId,
                usuarioId
            ]
        );

        // -----------------------------------------
        // ELIMINAR DETALLES
        // -----------------------------------------

        await connection.query(
            `DELETE FROM detalle_solicitud
             WHERE solicitud_id = ?`,
            [
                pedidoId
            ]
        );

        // -----------------------------------------
        // ELIMINAR SOLICITUD
        // -----------------------------------------

        await connection.query(
            `DELETE FROM solicitudes
             WHERE id = ?
               AND usuario_id = ?`,
            [
                pedidoId,
                usuarioId
            ]
        );

        await connection.commit();

        return true;

    } catch (error) {
        await connection.rollback();
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
