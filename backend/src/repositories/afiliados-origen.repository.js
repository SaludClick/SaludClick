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
    async function leerAutorizados(epsId, {buscar='',pagina=1,take=25,inicial='',tipo_documento='',identificador,estadisticas=false}={}) {
        if(typeof epsId!=='string'||!epsId||epsId.length>80)throw fallo('EPS no válida.');
        const {prisma,esquema}=obtenerConexion();
        if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(esquema))throw fallo('Esquema EPS inválido.');
        const tabla=Prisma.raw(`"${esquema}"."afiliados"`);
        return prisma.$transaction(async tx=>{
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const where=Prisma.sql`a.eps_id::text=${epsId} AND lower(btrim(a.estado::text))='activo'`;
            const filtro = identificador === undefined
                ? Prisma.sql`(${buscar}='' OR strpos(lower(concat_ws(' ',a.nombres,a.apellidos,a.documento,a.correo)),lower(${buscar}))>0) AND (${inicial}='' OR left(lower(a.apellidos),1)=lower(${inicial})) AND (${tipo_documento}='' OR upper(btrim(a.tipo_documento::text))=${tipo_documento})`
                : Prisma.sql`a.id::text = ${identificador}`;
            const [counts]=await tx.$queryRaw`SELECT count(*)::int AS activos,count(DISTINCT a.id)::int AS unicos,count(*) FILTER(WHERE ${filtro})::int AS filtrados FROM ${tabla} a WHERE ${where}`;
            if(counts.activos!==counts.unicos)throw fallo('La fuente EPS contiene identificadores ausentes o duplicados. Se requiere revisión.');
            const pacientes=await tx.$queryRaw`SELECT a.id::text AS identificador,a.nombres::text,a.apellidos::text,a.documento::text,a.tipo_documento::text,a.correo::text,a.estado::text FROM ${tabla} a WHERE ${where} AND ${filtro} ORDER BY a.apellidos,a.nombres,a.id LIMIT ${take} OFFSET ${(pagina-1)*take}`;
            if(pacientes.some(p=>typeof p.identificador!=='string'||!p.identificador||p.identificador.length>256||/[\x00-\x1f\x7f]/.test(p.identificador))||new Set(pacientes.map(p=>p.identificador)).size!==pacientes.length)throw fallo('La fuente EPS contiene identificadores inválidos o duplicados.');
            const resultado = {pacientes,totalActivos:counts.activos,total:counts.filtrados};
            if (estadisticas) {
                const [afiliados] = await tx.$queryRaw`
                    SELECT count(*)::int AS total,
                           count(*) FILTER(WHERE lower(btrim(estado::text))='inactivo')::int AS inactivos
                    FROM ${tabla} WHERE eps_id::text=${epsId}`;
                resultado.afiliados = { ...afiliados, activos: counts.activos };
            }
            return resultado;
        },{isolationLevel:'RepeatableRead',timeout:20000});
    }
    async function cuentaAutorizada(epsId,afiliadoId,documento,tipoDocumento) {
        if(!require('../services/farmacia-identidad.rules').clave(tipoDocumento,documento))return false;
        const {prisma,esquema}=obtenerConexion();
        if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(esquema))throw fallo('Esquema EPS inválido.');
        const tabla=Prisma.raw(`"${esquema}"."afiliados"`);
        return prisma.$transaction(async tx=>{
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            const rows=await tx.$queryRaw`SELECT a.id::text AS id FROM ${tabla} a WHERE a.eps_id::text=${epsId} AND a.documento::text=${documento} AND upper(btrim(a.tipo_documento::text))=${tipoDocumento.trim().toUpperCase()} AND lower(btrim(a.estado::text))='activo' LIMIT 2`;
            return rows.length===1&&rows[0].id===afiliadoId;
        },{isolationLevel:'RepeatableRead',timeout:20000});
    }
    return { leer, leerAutorizados, cuentaAutorizada };
}
module.exports = { crearOrigen, ...crearOrigen() };
