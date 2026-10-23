
const prisma = require("../config/prisma");

// =================================================
// LISTAR MEDICAMENTOS
// =================================================

async function listarMedicamentos(ids) {
    if (!ids.length) {
        return [];
    }

    return prisma.medicamento.findMany({
        where: {
            id: { in: ids.map(Number) }
        },
        select: {
            id: true,
            nombre: true,
            descripcion: true,
            categoria_id: true,
            precio: true,
            stock: true,
            imagen: true,
            estado: true
        }
    });
}

// =================================================
// CREAR PEDIDO + PAGO
// =================================================

async function crearPedidoConPago({
    usuarioId,
    tipoEntrega,
    direccion,
    observaciones,
    items,
    total,
    pago
}) {
    return prisma.$transaction(async (tx) => {
        // Verificar stock y disponibilidad.
        // La actualización condicional evita vender más unidades
        // de las que quedan disponibles si hay compras simultáneas.

        for (const item of items) {
            const medicamentoId = Number(item.medicamento_id);
            const cantidad = Number(item.cantidad);

            const medicamento = await tx.medicamento.findUnique({
                where: { id: medicamentoId },
                select: {
                    id: true,
                    nombre: true,
                    precio: true,
                    stock: true,
                    estado: true
                }
            });

            if (!medicamento || medicamento.estado !== "DISPONIBLE") {
                throw new Error(
                    `El medicamento ${medicamentoId} no está disponible.`
                );
            }

            if (medicamento.stock < cantidad) {
                throw new Error(
                    `Stock insuficiente para ${medicamento.nombre}. Disponible: ${medicamento.stock}.`
                );
            }
        }

        // Crear solicitud.
        const solicitud = await tx.solicitud.create({
            data: {
                usuario_id: Number(usuarioId),
                estado: "APROBADA",
                tipo_entrega: tipoEntrega,
                direccion: direccion || null,
                observaciones: observaciones || null
            },
            select: { id: true }
        });

        // Crear detalles y descontar inventario.
        for (const item of items) {
            const medicamentoId = Number(item.medicamento_id);
            const cantidad = Number(item.cantidad);

            const actualizado = await tx.medicamento.updateMany({
                where: {
                    id: medicamentoId,
                    estado: "DISPONIBLE",
                    stock: { gte: cantidad }
                },
                data: {
                    stock: { decrement: cantidad }
                }
            });

            if (actualizado.count !== 1) {
                throw new Error(
                    `Stock insuficiente para el medicamento ${medicamentoId}.`
                );
            }

            await tx.detalleSolicitud.create({
                data: {
                    solicitud_id: solicitud.id,
                    medicamento_id: medicamentoId,
                    cantidad,
                    precio: item.precio,
                    subtotal: item.subtotal
                }
            });
        }

        // Registrar pago simulado.
        const registroPago = await tx.pago.create({
            data: {
                solicitud_id: solicitud.id,
                usuario_id: Number(usuarioId),
                referencia: pago.referencia,
                metodo: pago.metodo,
                marca: pago.marca,
                ultimos_digitos: pago.ultimos_digitos,
                monto: total,
                estado: pago.estado,
                simulacion: true
            },
            select: { id: true }
        });

        return {
            solicitudId: solicitud.id,
            pagoId: registroPago.id
        };
    });
}

// =================================================
// LISTAR PEDIDOS DEL USUARIO
// =================================================

async function listarPedidosUsuario(usuarioId) {
    const solicitudes = await prisma.solicitud.findMany({
        where: {
            usuario_id: Number(usuarioId)
        },
        include: {
            detalles: {
                select: { subtotal: true }
            },
            pagos: {
                select: {
                    id: true,
                    estado: true,
                    metodo: true,
                    marca: true,
                    ultimos_digitos: true
                },
                orderBy: { id: "desc" }
            }
        },
        orderBy: { fecha: "desc" }
    });

    return solicitudes.map((solicitud) => {
        const total = solicitud.detalles.reduce(
            (suma, detalle) => suma + Number(detalle.subtotal),
            0
        );

        const pago = solicitud.pagos[0];

        return {
            id: solicitud.id,
            fecha: solicitud.fecha,
            estado: solicitud.estado,
            tipo_entrega: solicitud.tipo_entrega,
            direccion: solicitud.direccion,
            total,
            pago_estado: pago?.estado ?? null,
            pago_metodo: pago?.metodo ?? null,
            pago_marca: pago?.marca ?? null,
            ultimos_digitos: pago?.ultimos_digitos ?? null
        };
    });
}

// =================================================
// DETALLE DE UN PEDIDO
// =================================================

async function detallePedidoUsuario(usuarioId, pedidoId) {
    const solicitud = await prisma.solicitud.findFirst({
        where: {
            id: Number(pedidoId),
            usuario_id: Number(usuarioId)
        },
        include: {
            detalles: {
                include: {
                    medicamento: {
                        select: {
                            nombre: true,
                            imagen: true
                        }
                    }
                },
                orderBy: { id: "asc" }
            },
            pagos: {
                select: {
                    referencia: true,
                    estado: true,
                    metodo: true,
                    marca: true,
                    ultimos_digitos: true
                },
                orderBy: { id: "desc" }
            }
        }
    });

    if (!solicitud) {
        return [];
    }

    return solicitud.detalles.map((detalle) => {
        const pago = solicitud.pagos[0];

        return {
            id: solicitud.id,
            fecha: solicitud.fecha,
            estado: solicitud.estado,
            tipo_entrega: solicitud.tipo_entrega,
            direccion: solicitud.direccion,
            observaciones: solicitud.observaciones,
            medicamento_id: detalle.medicamento_id,
            nombre: detalle.medicamento.nombre,
            imagen: detalle.medicamento.imagen,
            cantidad: detalle.cantidad,
            precio: detalle.precio,
            subtotal: detalle.subtotal,
            referencia: pago?.referencia ?? null,
            pago_estado: pago?.estado ?? null,
            metodo: pago?.metodo ?? null,
            marca: pago?.marca ?? null,
            ultimos_digitos: pago?.ultimos_digitos ?? null
        };
    });
}

// =================================================
// ELIMINAR PEDIDO DEL USUARIO
// =================================================

async function eliminarPedidoUsuario(usuarioId, pedidoId) {
    return prisma.$transaction(async (tx) => {
        const id = Number(pedidoId);
        const usuario = Number(usuarioId);

        const solicitud = await tx.solicitud.findFirst({
            where: {
                id,
                usuario_id: usuario
            },
            select: { id: true }
        });

        if (!solicitud) {
            throw new Error("Pedido no encontrado.");
        }

        await tx.pago.deleteMany({
            where: {
                solicitud_id: id,
                usuario_id: usuario
            }
        });

        await tx.detalleSolicitud.deleteMany({
            where: { solicitud_id: id }
        });

        await tx.solicitud.delete({
            where: { id }
        });

        return true;
    });
}

// =================================================
// EXPORTAR
// =================================================

module.exports = {
    listarMedicamentos,
    crearPedidoConPago,
    listarPedidosUsuario,
    detallePedidoUsuario,
    eliminarPedidoUsuario
};
