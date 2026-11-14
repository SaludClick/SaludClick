const prisma = require('../config/prisma');
const select = { id: true, tipo: true, titulo: true, mensaje: true, created_at: true, leida_at: true };

function createRepository(db = prisma) {
    const owned = destinatario_id => ({ destinatario_id });
    return {
        usuarioVigente(id) {
            return db.usuario.findUnique({ where: { id }, select: { id: true, rol_id: true, estado: true } });
        },
        async listar(destinatario, { estado, skip, take }) {
            const where = { ...owned(destinatario), ...(estado === 'no-leidas' ? { leida_at: null } : estado === 'leidas' ? { leida_at: { not: null } } : {}) };
            return db.$transaction(async tx => {
                const [notificaciones, total, noLeidas] = await Promise.all([
                    tx.notificacionFarmacia.findMany({ where, skip, take, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], select }),
                    tx.notificacionFarmacia.count({ where }),
                    tx.notificacionFarmacia.count({ where: { ...owned(destinatario), leida_at: null } })
                ]);
                return { notificaciones, total, noLeidas };
            }, { isolationLevel: 'RepeatableRead' });
        },
        contar(destinatario) {
            return db.notificacionFarmacia.count({ where: { ...owned(destinatario), leida_at: null } });
        },
        async leer(destinatario, id) {
            return db.$transaction(async tx => {
                await tx.notificacionFarmacia.updateMany({ where: { ...owned(destinatario), id, leida_at: null }, data: { leida_at: new Date() } });
                return tx.notificacionFarmacia.findFirst({ where: { ...owned(destinatario), id }, select });
            });
        },
        async leerTodas(destinatario) {
            const result = await db.notificacionFarmacia.updateMany({ where: { ...owned(destinatario), leida_at: null }, data: { leida_at: new Date() } });
            return result.count;
        },
        async registrarCambio(tx, solicitudId, estado) {
            // The existing pharmacy queue is shared by active pharmacy staff.
            // Never copy patient identities, addresses, prescriptions or chat bodies.
            const destinatarios = await tx.usuario.findMany({ where: { rol_id: 3, estado: 'ACTIVO' }, select: { id: true } });
            if (!destinatarios.length) return [];
            await tx.notificacionFarmacia.createMany({
                data: destinatarios.map(({ id }) => ({
                    destinatario_id: id, tipo: 'SOLICITUD_ESTADO', titulo: 'Solicitud actualizada',
                    mensaje: 'Una solicitud cambió de estado. Consulta el listado de solicitudes.',
                    referencia_evento: `solicitud:${solicitudId}:estado:${estado}`
                })), skipDuplicates: true
            });
            return destinatarios.map(({ id }) => id);
        }
    };
}
module.exports = { createRepository, ...createRepository() };
