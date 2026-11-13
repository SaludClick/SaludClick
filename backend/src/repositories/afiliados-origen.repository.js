const { Prisma } = require('@prisma/client');
const { CAMPOS } = require('../services/afiliados-import.service');
const { obtenerConexionEPS } = require('../config/eps-prisma');
const fallo = mensaje => Object.assign(new Error(mensaje), { status:503, codigo:'EPS_SOURCE_SCHEMA_INVALID' });
function crearOrigen({ obtenerConexion = obtenerConexionEPS } = {}) {
    async function leer() {
        const { prisma, esquema, servidor, puerto } = obtenerConexion();
        // Los identificadores provienen exclusivamente de la configuración validada
        // y la lista fija de campos; los datos nunca se interpolan como SQL.
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(esquema)) throw fallo('Esquema EPS inválido.');
        const tabla = nombre => Prisma.raw(`"${esquema}"."${nombre}"`);
        return prisma.$transaction(async tx => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const [identidad] = await tx.$queryRaw`SELECT current_database() AS base`;
            const columnas = await tx.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ${esquema} AND table_name IN ('afiliados', 'eps')`;
            if (CAMPOS.some(c => !columnas.some(x => x.table_name === 'afiliados' && x.column_name === c))) throw fallo('La fuente EPS configurada no permite consultar afiliados con sus 13 campos originales. Revisa la base, EPS_DATABASE_SCHEMA y los permisos SELECT; no se ejecutarán migraciones ni importaciones.');
            const epsDisponible = ['id','nombre'].every(c => columnas.some(x => x.table_name === 'eps' && x.column_name === c));
            const campos = Prisma.join(CAMPOS.map(c => Prisma.sql`${Prisma.raw(`a."${c}"`)}::text AS ${Prisma.raw(`"${c}"`)}`));
            const consulta = epsDisponible
                ? Prisma.sql`SELECT ${campos}, e.id::text AS "_eps_id", e.nombre::text AS "_eps_nombre" FROM ${tabla('afiliados')} a LEFT JOIN ${tabla('eps')} e ON a.eps_id::text = e.id::text ORDER BY a.id`
                : Prisma.sql`SELECT ${campos}, NULL::text AS "_eps_id", NULL::text AS "_eps_nombre" FROM ${tabla('afiliados')} a ORDER BY a.id`;
            const filas = await tx.$queryRaw(consulta);
            if (filas.some(a => !a.id || !a.documento) || new Set(filas.map(a => a.id)).size !== filas.length || new Set(filas.map(a => a.documento)).size !== filas.length) throw fallo('La fuente EPS contiene identificadores o documentos ausentes o duplicados. Requiere revisión antes de vincular cuentas.');
            const afiliados = filas.map(a => ({ ...Object.fromEntries(CAMPOS.map(c => [c,a[c]])), eps:a._eps_id !== null && a._eps_nombre ? { id:a._eps_id, nombre:a._eps_nombre } : null }));
            return { afiliados, conexion:{ servidor, puerto, base:identidad.base, esquema, tabla:`${esquema}.afiliados`, catalogoEps:epsDisponible } };
        }, { isolationLevel:'RepeatableRead', timeout:20000 }).catch(e=>{
            if(e.code==='P2010'&&e.meta?.code==='42501')throw Object.assign(new Error('La conexión EPS requiere permisos USAGE del esquema y SELECT de afiliados y eps. No se cambiarán permisos automáticamente.'),{status:503,codigo:'EPS_SOURCE_PERMISSIONS'});
            throw e;
        });
    }
    return { leer };
}
module.exports = { crearOrigen, ...crearOrigen() };
