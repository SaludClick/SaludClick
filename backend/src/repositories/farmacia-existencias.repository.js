const prisma = require('../config/prisma');
const DISPONIBILIDAD = {
    disponibles: { estado: 'DISPONIBLE', stock: { gt: 0 } },
    agotados: { estado: { in: ['DISPONIBLE', 'AGOTADO'] }, stock: 0 },
    inactivos: { estado: 'INACTIVO', stock: { gte: 0 } },
    inconsistentes: { OR: [{ stock: { lt: 0 } }, { estado: 'AGOTADO', stock: { gt: 0 } }] },
    desconocidos: { estado: null, stock: { gte: 0 } }
};
const baseSelect = { id: true, nombre: true, presentacion: true, stock: true, estado: true,
    requiere_formula: true, categoria: { select: { nombre: true } } };
const catalogoSelect = { ...baseSelect, descripcion: true, nombre_generico: true,
    principio_activo: true, concentracion: true, forma_farmaceutica: true, via_administracion: true,
    registro_sanitario: true, estado_registro_invima: true, catalogo_verificado: true };
const detailSelect = { ...catalogoSelect, cum: true, ium: true, titular_registro: true,
    modalidad_comercializacion: true, created_at: true, updated_at: true };

function whereFor({ buscar, disponibilidad, formula }) {
    const conditions = [];
    if (buscar) conditions.push({ OR: ['nombre', 'nombre_generico', 'principio_activo', 'presentacion', 'registro_sanitario', 'cum']
        .map(field => ({ [field]: { contains: buscar, mode: 'insensitive' } })) });
    if (disponibilidad !== 'todas') conditions.push(DISPONIBILIDAD[disponibilidad]);
    if (formula !== 'todas') conditions.push({ requiere_formula: formula === 'desconocido' ? null : formula === 'requiere' });
    return conditions.length ? { AND: conditions } : {};
}
async function listar(options, catalogo = false) {
    const where = whereFor(options);
    return prisma.$transaction(async tx => {
        const [medicamentos, total, totalCatalogo, disponibles, agotados, inactivos, inconsistentes, desconocidos] = await Promise.all([
            tx.medicamento.findMany({ where, skip: options.skip, take: options.take, orderBy: [{ nombre: 'asc' }, { id: 'asc' }], select: catalogo ? catalogoSelect : baseSelect }),
            tx.medicamento.count({ where }), tx.medicamento.count(),
            ...['disponibles', 'agotados', 'inactivos', 'inconsistentes', 'desconocidos'].map(key => tx.medicamento.count({ where: DISPONIBILIDAD[key] }))
        ]);
        return { medicamentos, total, resumen: { total: totalCatalogo, disponibles, agotados, inactivos, inconsistentes, desconocidos } };
    }, { isolationLevel: 'RepeatableRead' });
}
const detalle = id => prisma.medicamento.findUnique({ where: { id }, select: detailSelect });
module.exports = { listar, detalle };
