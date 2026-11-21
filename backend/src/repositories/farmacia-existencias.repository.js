const prisma = require('../config/prisma');
const { UMBRAL_BAJO } = require('../config/farmacia-inventario');
const DISPONIBILIDAD = {
    bajos: { estado: 'DISPONIBLE', stock: { gt: 0, lte: UMBRAL_BAJO } },
    disponibles: { estado: 'DISPONIBLE', stock: { gt: 0 } },
    agotados: { estado: { in: ['DISPONIBLE', 'AGOTADO'] }, stock: 0 },
    inactivos: { estado: 'INACTIVO', stock: { gte: 0 } },
    inconsistentes: { OR: [{ stock: { lt: 0 } }, { estado: 'AGOTADO', stock: { gt: 0 } }] },
    desconocidos: { estado: null, stock: { gte: 0 } }
};
const baseSelect = { id: true, nombre: true, descripcion: true, codigo_fuente: true, imagen: true, presentacion: true, stock: true, estado: true,
    requiere_formula: true, categoria: { select: { nombre: true } } };
const catalogoSelect = { ...baseSelect, descripcion: true, nombre_generico: true,
    principio_activo: true, concentracion: true, forma_farmaceutica: true, via_administracion: true,
    registro_sanitario: true, estado_registro_invima: true, catalogo_verificado: true };
const detailSelect = { ...catalogoSelect, categoria_id: true, precio: true, cum: true, ium: true, titular_registro: true,
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
    return prisma.$transaction(async tx => {
        const bajosCatalogo=catalogo?await tx.$queryRawUnsafe(`SELECT id FROM medicamentos m WHERE estado='DISPONIBLE'
            AND stock>0 AND stock<=COALESCE((to_jsonb(m)->>'stock_minimo')::int,0)`):null;
        const baseWhere=whereFor(bajosCatalogo&&options.disponibilidad==='bajos'?{...options,disponibilidad:'todas'}:options);
        const where=bajosCatalogo&&options.disponibilidad==='bajos'
            ?{...baseWhere,id:{in:bajosCatalogo.map(row=>row.id)}}:baseWhere;
        const [medicamentos, total, totalCatalogo, disponibles, agotados, inactivos, inconsistentes, desconocidos, bajos] = await Promise.all([
            tx.medicamento.findMany({ where, skip: options.skip, take: options.take, orderBy: [{ nombre: 'asc' }, { id: 'asc' }], select: catalogo ? catalogoSelect : baseSelect }),
            tx.medicamento.count({ where }), tx.medicamento.count(),
            ...['disponibles', 'agotados', 'inactivos', 'inconsistentes', 'desconocidos'].map(key => tx.medicamento.count({ where: DISPONIBILIDAD[key] })),
            bajosCatalogo?.length??tx.medicamento.count({ where: DISPONIBILIDAD.bajos })
        ]);
        if(catalogo&&medicamentos.length){
            const minimos=await minimosDe(tx,medicamentos.map(med=>med.id));
            for(const med of medicamentos)med.stock_minimo=minimos.get(med.id)??0;
        }
        return { medicamentos, total, resumen: { total: totalCatalogo, disponibles, agotados, inactivos, inconsistentes, desconocidos, bajos } };
    }, { isolationLevel: 'RepeatableRead' });
}
async function minimosDe(tx,ids){
    const rows=await tx.$queryRawUnsafe(`SELECT id, COALESCE((to_jsonb(m)->>'stock_minimo')::int,0) AS stock_minimo
        FROM medicamentos m WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)::int)`,JSON.stringify(ids));
    return new Map(rows.map(row=>[row.id,row.stock_minimo]));
}
async function detalle(id,catalogo=false){
    const get=tx=>tx.medicamento.findUnique({ where:{id},select:detailSelect });
    if(!catalogo)return get(prisma);
    return prisma.$transaction(async tx=>{
        const med=await get(tx);
        if(med)med.stock_minimo=(await minimosDe(tx,[id])).get(id)??0;
        return med;
    },{isolationLevel:'RepeatableRead'});
}
async function exportar(options) {
    return prisma.$transaction(tx => tx.medicamento.findMany({where:whereFor(options),take:50001,orderBy:[{nombre:'asc'},{id:'asc'}],select:baseSelect}),{isolationLevel:'RepeatableRead'});
}
module.exports = { listar, detalle, exportar };
