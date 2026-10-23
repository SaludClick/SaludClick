
const prisma = require("../config/prisma");

async function statsUsuario(usuarioId) {
    const id = Number(usuarioId);

    const [totalPedidos, pedidosActivos, totalFormulas, gasto] =
        await Promise.all([
            prisma.solicitud.count({
                where: { usuario_id: id }
            }),

            prisma.solicitud.count({
                where: {
                    usuario_id: id,
                    estado: {
                        notIn: ["ENTREGADA", "CANCELADA"]
                    }
                }
            }),

            prisma.formulaMedica.count({
                where: {
                    usuario_id: id,
                    estado: { not: "ELIMINADA" }
                }
            }),

            prisma.pago.aggregate({
                where: {
                    usuario_id: id,
                    estado: "APROBADO"
                },
                _sum: { monto: true }
            })
        ]);

    return {
        pedidos: totalPedidos,
        pedidosActivos,
        formulas: totalFormulas,
        totalPagado: Number(gasto._sum.monto ?? 0)
    };
}

async function statsAdmin() {
    const haceCincoMeses = new Date();
    haceCincoMeses.setDate(1);
    haceCincoMeses.setHours(0, 0, 0, 0);
    haceCincoMeses.setMonth(haceCincoMeses.getMonth() - 5);

    const [
        totalUsuarios,
        usuariosActivos,
        totalPedidos,
        pedidosActivos,
        ventas,
        totalMedicamentos,
        medicamentosDisponibles,
        unidades,
        totalFormulas,
        formulasPendientes,
        pagosMes,
        estadosPedidos
    ] = await Promise.all([
        prisma.usuario.count(),

        prisma.usuario.count({
            where: { estado: "ACTIVO" }
        }),

        prisma.solicitud.count(),

        prisma.solicitud.count({
            where: {
                estado: {
                    in: ["PENDIENTE", "APROBADA", "PREPARANDO", "LISTA"]
                }
            }
        }),

        prisma.pago.aggregate({
            where: { estado: "APROBADO" },
            _sum: { monto: true }
        }),

        prisma.medicamento.count(),

        prisma.medicamento.count({
            where: { estado: "DISPONIBLE" }
        }),

        prisma.medicamento.aggregate({
            _sum: { stock: true }
        }),

        prisma.formulaMedica.count(),

        prisma.formulaMedica.count({
            where: { estado: "PENDIENTE" }
        }),

        prisma.pago.findMany({
            where: {
                estado: "APROBADO",
                created_at: { gte: haceCincoMeses }
            },
            select: {
                created_at: true,
                monto: true
            },
            orderBy: { created_at: "asc" }
        }),

        prisma.solicitud.groupBy({
            by: ["estado"],
            _count: { _all: true },
            orderBy: {
                estado: "asc"
            }
        })
    ]);

    const resumenMes = new Map();

    for (const pago of pagosMes) {
        if (!pago.created_at) continue;

        const periodo = `${pago.created_at.getFullYear()}-${String(
            pago.created_at.getMonth() + 1
        ).padStart(2, "0")}`;

        if (!resumenMes.has(periodo)) {
            resumenMes.set(periodo, {
                periodo,
                pedidos: 0,
                ventas: 0
            });
        }

        const resumen = resumenMes.get(periodo);
        resumen.pedidos += 1;
        resumen.ventas += Number(pago.monto);
    }

    const ventasMes = Array.from(resumenMes.values());

    const estados = estadosPedidos.map((item) => ({
        estado: item.estado,
        cantidad: item._count._all
    }));

    return {
        usuarios: {
            total: totalUsuarios,
            activos: usuariosActivos
        },
        pedidos: {
            total: totalPedidos,
            activos: pedidosActivos
        },
        ventas: Number(ventas._sum.monto ?? 0),
        inventario: {
            total: totalMedicamentos,
            disponibles: medicamentosDisponibles,
            unidades: unidades._sum.stock ?? 0
        },
        formulas: {
            total: totalFormulas,
            pendientes: formulasPendientes
        },
        ventasMes,
        estados
    };
}

module.exports = { statsUsuario, statsAdmin };
