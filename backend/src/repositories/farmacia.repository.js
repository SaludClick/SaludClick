const prisma = require('../config/prisma');
const notifications = require('./farmacia-notificaciones.repository');
const { habilitadas } = require('../config/farmacia-notificaciones');
const { ESTADOS_OPERATIVOS } = require('../config/farmacia-solicitudes');

// The queue needs no personal identifiers, contacts, addresses or payment cards.
const solicitudSelect = {
    id: true, fecha: true, estado: true, tipo_entrega: true,
    pagos: { select: { estado: true, simulacion: true } },
    detalles: { select: { cantidad: true, medicamento: { select: {
        id: true, nombre: true, descripcion: true, requiere_formula: true
    } } } }
};

async function listarPedidos({ estado, id, skip, take }) {
    const where = { estado: estado === 'todas' ? { in: ESTADOS_OPERATIVOS } : estado || { in: ESTADOS_OPERATIVOS.slice(0, 3) }, ...(id === undefined ? {} : { id }) };
    return prisma.$transaction(async tx => {
        const [pedidos, total, grupos] = await Promise.all([
            tx.solicitud.findMany({ where, skip, take, orderBy: [{ fecha: 'asc' }, { id: 'asc' }], select: solicitudSelect }),
            tx.solicitud.count({ where }),
            tx.solicitud.groupBy({ by: ['estado'], where: { estado: { in: ESTADOS_OPERATIVOS } }, _count: { _all: true } })
        ]);
        const counts = Object.fromEntries(grupos.map(group => [group.estado, group._count._all]));
        return { pedidos, total, resumen: { pendientes: counts.APROBADA || 0, preparando: counts.PREPARANDO || 0, listas: counts.LISTA || 0, entregadas: counts.ENTREGADA || 0 } };
    }, { isolationLevel: 'RepeatableRead' });
}

async function detallePedido(id) {
    return prisma.solicitud.findFirst({ where: { id, estado: { in: ESTADOS_OPERATIVOS } },
        select: { ...solicitudSelect, direccion: true, usuario: { select: { nombre: true, apellido: true } } } });
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
    const update = async tx => {
        const result = await tx.solicitud.updateMany({
            // A simulated approval never authorizes preparation or dispensing.
            where: {
                id, estado: actual, pagos: { some: { estado: 'APROBADO', simulacion: false } },
                // No authorized prescription-to-order validation exists. Fail closed
                // for prescription-required, unknown requirements and empty orders.
                detalles: {
                    some: {}, every: { medicamento: { requiere_formula: false } },
                    // Explicit NULL exclusion also protects a concurrent change to
                    // an unknown requirement, independently of SQL's NULL logic.
                    none: { medicamento: { requiere_formula: null } }
                }
            },
            data: { estado: siguiente, updated_at: new Date() }
        });
        const destinatarios = result.count && habilitadas()
            ? await notifications.registrarCambio(tx, id, siguiente) : [];
        return { count: result.count, destinatarios };
    };
    // When enabled, state and notifications either both commit or both roll back.
    // Before activation, existing operations do not touch the proposed table.
    return habilitadas() ? prisma.$transaction(update) : update(prisma);
}
module.exports = { listarPedidos, detallePedido, listarInventario, avanzarPedido };
