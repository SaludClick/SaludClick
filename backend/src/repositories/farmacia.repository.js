const prisma = require('../config/prisma');

async function listarPedidos({ estado, skip, take }) {
    const where = { estado: estado || { in: ['APROBADA', 'PREPARANDO', 'LISTA'] } };
    const [pedidos, total] = await Promise.all([
        prisma.solicitud.findMany({
            where, skip, take, orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
            select: {
                id: true, fecha: true, estado: true, tipo_entrega: true, direccion: true,
                usuario: { select: { nombre: true, apellido: true } },
                detalles: { select: {
                    cantidad: true,
                    medicamento: { select: { id: true, nombre: true, descripcion: true } }
                } }
            }
        }),
        prisma.solicitud.count({ where })
    ]);
    return { pedidos, total };
}

async function listarInventario({ buscar, skip, take }) {
    const where = buscar ? { nombre: { contains: buscar, mode: 'insensitive' } } : {};
    const [medicamentos, total] = await Promise.all([
        prisma.medicamento.findMany({
            where, skip, take, orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
            select: { id: true, nombre: true, stock: true, estado: true,
                categoria: { select: { nombre: true } } }
        }),
        prisma.medicamento.count({ where })
    ]);
    return { medicamentos, total };
}

async function avanzarPedido(id, actual, siguiente) {
    // Comparar y actualizar en una sola operación evita sobrescribir una
    // transición concurrente realizada por otra farmacia o el administrador.
    const result = await prisma.solicitud.updateMany({
        where: { id, estado: actual, pagos: { some: { estado: 'APROBADO' } } },
        data: { estado: siguiente, updated_at: new Date() }
    });
    return result.count;
}
module.exports = { listarPedidos, listarInventario, avanzarPedido };
