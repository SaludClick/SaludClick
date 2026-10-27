
<<<<<<< HEAD
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
=======
const prisma = require("../config/prisma");

async function pedidos() {
    const solicitudes = await prisma.solicitud.findMany({
        take: 50,
        orderBy: { fecha: "desc" },
        include: {
            usuario: {
                select: {
                    nombre: true,
                    apellido: true,
                    correo: true
                }
            },
            detalles: { select: { subtotal: true } },
            pagos: { select: { estado: true } }
        }
    });

    return solicitudes.map((solicitud) => ({
        id: solicitud.id,
        fecha: solicitud.fecha,
        estado: solicitud.estado,
        tipo_entrega: solicitud.tipo_entrega,
        usuario: `${solicitud.usuario.nombre} ${solicitud.usuario.apellido}`,
        correo: solicitud.usuario.correo,
        total: solicitud.detalles.reduce(
            (suma, detalle) => suma + Number(detalle.subtotal),
            0
        ),
        pago: solicitud.pagos[0]?.estado ?? "SIN PAGO"
    }));
}

async function estadoPedido(id, estado) {
    const resultado = await prisma.solicitud.updateMany({
        where: { id: Number(id) },
        data: { estado }
    });

    return resultado.count;
}

async function listarCuentas() {
    return prisma.usuario.findMany({
        where: { rol_id: { in: [2, 3] } },
        select: {
            id: true,
            nombre: true,
            apellido: true,
            correo: true,
            telefono: true,
            ciudad: true,
            estado: true,
            rol_id: true,
            created_at: true,
            _count: {
                select: {
                    solicitudes: true,
                    pagos: true,
                    formulas_medicas: true,
                    recordatorios: true
                }
            }
        },
        orderBy: { id: "desc" }
    });
}

async function buscarCuentaParaEliminar(id) {
    return prisma.usuario.findUnique({
        where: { id: Number(id) },
        select: {
            id: true,
            nombre: true,
            apellido: true,
            correo: true,
            rol_id: true,
            _count: {
                select: {
                    solicitudes: true,
                    pagos: true
                }
            }
        }
    });
}

// Eliminación transaccional de cuentas sin historial comercial.
async function eliminarCuenta(id) {
    return prisma.$transaction(async (tx) => {
        const cuenta = await tx.usuario.findUnique({
            where: { id },
            select: {
                id: true,
                rol_id: true,
                _count: {
                    select: {
                        solicitudes: true,
                        pagos: true
                    }
                },
                formulas_medicas: {
                    select: { nombre_archivo: true }
                }
            }
        });

        if (!cuenta) {
            const error = new Error("La cuenta no existe.");
            error.code = "CUENTA_NO_ENCONTRADA";
            throw error;
        }

        if (![2, 3].includes(cuenta.rol_id)) {
            const error = new Error(
                "Solo se pueden eliminar cuentas de usuarios o farmacias."
            );
            error.code = "CUENTA_NO_PERMITIDA";
            throw error;
        }

        if (
            cuenta._count.solicitudes > 0 ||
            cuenta._count.pagos > 0
        ) {
            const error = new Error(
                "La cuenta tiene pedidos o pagos registrados y no se puede eliminar."
            );
            error.code = "CUENTA_CON_HISTORIAL";
            throw error;
        }

        await tx.recordatorio.deleteMany({
            where: { usuario_id: id }
        });

        await tx.tokenRecuperacion.deleteMany({
            where: { usuario_id: id }
        });

        await tx.formulaMedica.deleteMany({
            where: { usuario_id: id }
        });

        await tx.usuario.delete({
            where: { id }
        });

        return {
            id: cuenta.id,
            archivosFormula: cuenta.formulas_medicas.map(
                (formula) => formula.nombre_archivo
            )
        };
    }, {
        isolationLevel: "Serializable"
    });
}

module.exports = {
    pedidos,
    estadoPedido,
    listarCuentas,
    buscarCuentaParaEliminar,
    eliminarCuenta
>>>>>>> feature/neon-prisma
};
