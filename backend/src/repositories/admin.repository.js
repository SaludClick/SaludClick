
const prisma = require("../config/prisma");

async function pedidos() {
    const solicitudes = await prisma.solicitud.findMany({
        take: 50,
        orderBy: {
            fecha: "desc"
        },
        include: {
            usuario: {
                select: {
                    nombre: true,
                    apellido: true,
                    correo: true
                }
            },
            detalles: {
                select: {
                    subtotal: true
                }
            },
            pagos: {
                select: {
                    estado: true
                }
            }
        }
    });

    return solicitudes.map((solicitud) => {
        const total = solicitud.detalles.reduce(
            (suma, detalle) => suma + Number(detalle.subtotal),
            0
        );

        return {
            id: solicitud.id,
            fecha: solicitud.fecha,
            estado: solicitud.estado,
            tipo_entrega: solicitud.tipo_entrega,
            usuario: `${solicitud.usuario.nombre} ${solicitud.usuario.apellido}`,
            correo: solicitud.usuario.correo,
            total,
            pago: solicitud.pagos[0]?.estado ?? "SIN PAGO"
        };
    });
}

async function estadoPedido(id, estado) {
    const resultado = await prisma.solicitud.updateMany({
        where: {
            id: Number(id)
        },
        data: {
            estado
        }
    });

    return resultado.count;
}

module.exports = {
    pedidos,
    estadoPedido
};
