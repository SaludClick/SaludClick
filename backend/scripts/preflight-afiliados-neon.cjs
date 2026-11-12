// Solo lectura en el destino configurado. No ejecuta DDL, importaciones ni UPDATE.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CAMPOS, leerCsv } = require('../src/services/afiliados-import.service');
const q = s => '"' + s.replaceAll('"', '""') + '"';
async function main() {
    const bytes = fs.readFileSync(process.env.AFILIADOS_CSV);
    const originales = leerCsv(bytes.toString('utf8'));
    const pool = require('../src/config/database');
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const url = new URL(process.env.DATABASE_URL);
        const { rows: [identidad] } = await cliente.query('SELECT current_database() AS base, current_schema() AS esquema, current_setting(\'server_version\') AS version');
        const { rows: tablas } = await cliente.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_%' ORDER BY table_schema,table_name");
        const { rows: columnas } = await cliente.query("SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_%' ORDER BY table_schema,table_name,ordinal_position");
        const { rows: restricciones } = await cliente.query("SELECT n.nspname AS esquema, r.relname AS tabla, c.conname AS nombre, c.contype AS tipo, pg_get_constraintdef(c.oid) AS definicion FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' ORDER BY n.nspname,r.relname,c.conname");
        const { rows: indices } = await cliente.query("SELECT schemaname AS esquema,tablename AS tabla,indexname AS nombre,indexdef AS definicion FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_%' ORDER BY schemaname,tablename,indexname");
        const { rows: roles } = await cliente.query('SELECT id,nombre FROM public.roles ORDER BY id');
        const inventario = [], comparaciones = [], originalesEncontrados = [];
        for (const t of tablas) {
            const nombre = q(t.table_schema) + '.' + q(t.table_name);
            const cols = columnas.filter(c => c.table_schema === t.table_schema && c.table_name === t.table_name);
            const { rows:[conteo] } = await cliente.query(`SELECT count(*)::int AS total, md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) AS huella FROM ${nombre} t`);
            inventario.push({ esquema:t.table_schema,tabla:t.table_name,total:conteo.total,huella:conteo.huella,columnas:cols.map(c => c.column_name) });
            for (const c of cols.filter(c => ['documento','cedula','numero_documento'].includes(c.column_name.toLowerCase()))) {
                const { rows:[coinciden] } = await cliente.query(`SELECT count(*)::int AS coincidencias, count(DISTINCT ${q(c.column_name)}::text)::int AS documentos_distintos FROM ${nombre} WHERE ${q(c.column_name)}::text = ANY($1::text[])`,[originales.map(a=>a.documento)]);
                comparaciones.push({ esquema:t.table_schema,tabla:t.table_name,campo:c.column_name,...coinciden });
            }
            if (CAMPOS.every(c => cols.some(col=>col.column_name===c))) {
                const {rows} = await cliente.query(`SELECT ${CAMPOS.map(c=>`${q(c)}::text AS ${q(c)}`).join(',')} FROM ${nombre} WHERE documento::text = ANY($1::text[])`,[originales.map(a=>a.documento)]);
                originalesEncontrados.push({ esquema:t.table_schema,tabla:t.table_name,total:conteo.total,documentos_coincidentes:new Set(rows.map(r=>r.documento)).size,registros_identicos:originales.filter(a=>rows.some(r=>CAMPOS.every(c=>r[c]===a[c]))).length,conflictos:rows.filter(r=>!originales.some(a=>CAMPOS.every(c=>r[c]===a[c]))).length });
            }
        }
        let migraciones = [];
        if(tablas.some(t=>t.table_schema==='public' && t.table_name==='_prisma_migrations')) migraciones = (await cliente.query('SELECT migration_name,checksum,finished_at IS NOT NULL AS finalizada,rolled_back_at IS NOT NULL AS revertida FROM public._prisma_migrations ORDER BY started_at')).rows;
        const directorio = path.resolve(__dirname,'../prisma/migrations');
        const locales = fs.readdirSync(directorio,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>{ const bytes=fs.readFileSync(path.join(directorio,d.name,'migration.sql')); return {nombre:d.name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sha256_lf:crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex')}; });
        const candidatosEps = inventario.filter(t=>/(^|_)eps($|_)|entidad.*promotora/i.test(t.tabla));
        const informe = { destino:{servidor:url.hostname,puerto:url.port||'5432',...identidad},csv:{registros:originales.length,campos:CAMPOS,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),eps_distintas:new Set(originales.map(a=>a.eps_id)).size},inventario,comparacion_documentos:comparaciones,tablas_con_los_13_campos:originalesEncontrados,maestros_eps:candidatosEps,restricciones,indices,roles,migraciones_aplicadas:migraciones,migraciones_locales:locales };
        await cliente.query('ROLLBACK');
        if(process.env.AFILIADOS_PREFLIGHT_REPORT) fs.writeFileSync(process.env.AFILIADOS_PREFLIGHT_REPORT,JSON.stringify(informe,null,2)+'\n');
        console.log(JSON.stringify(informe));
    } finally { cliente.release(); await pool.end(); }
}
main().catch(e=>{console.error(JSON.stringify({error:'Preflight cancelado; no se publican datos personales ni credenciales.',codigo:e.code||e.name}));process.exitCode=1;});
