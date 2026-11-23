// Genera archivos LOCALES para revisión. No abre conexiones PostgreSQL.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'docs/calidad/activacion-farmacia-2026-11-17');
const epsDependencias='20261116170000_eps_dependencias_lectura';
const epsTablas=['farmacia_asignaciones','farmacia_solicitud_eventos','farmacia_formulas_autorizadas','afiliado_cuentas_origen'];
const names=['20261114120000_farmacia_notificaciones','20261115120000_farmacia_eps_unica','20261116170000_eps_dependencias_lectura','20261116180000_farmacia_operacion_autorizada','20261117180000_farmacia_inventario_propio','20261117200000_farmacia_ingreso_referencia_unica'];
const tables=['notificaciones_farmacia','farmacia_asignaciones','farmacia_solicitud_eventos','farmacia_formulas_autorizadas','farmacia_catalogo_autorizaciones','farmacia_catalogo_ambitos','farmacia_catalogo_auditoria','farmacia_sesiones','farmacia_rutas_eps','farmacia_autorizacion_eventos','solicitudes_ocultas_paciente','afiliado_cuentas_origen','farmacia_existencias','farmacia_stock_eventos'];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const hash=content=>crypto.createHash('sha256').update(content).digest('hex');
function preparar(auditoria=fs.readFileSync(path.join(out,'auditoria-readonly.json'))){
    const audit=JSON.parse(auditoria.toString('utf8'));
    const epsAplicada=audit.destino.historial.some(h=>h.migration_name===epsDependencias && h.finished_at && !h.rolled_back_at);
    const pendientes=names.filter(nombre=>!epsAplicada || nombre!==epsDependencias);
    const tablasNuevas=tables.filter(tabla=>!epsAplicada || !epsTablas.includes(tabla));
    const migrations=pendientes.map(nombre=>{const file=path.join(root,'backend/prisma/migrations',nombre,'migration.sql');const bytes=fs.readFileSync(file);return {nombre,sha256:hash(bytes),sql:bytes.toString('utf8')};});
    const known=fs.readdirSync(path.join(root,'backend/prisma/migrations'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>{const content=fs.readFileSync(path.join(root,'backend/prisma/migrations',d.name,'migration.sql'));return {nombre:d.name,sha256:hash(content)};});
    const manifest={estado:'PREPARADO_NO_AUTORIZADO',auditoria:hash(auditoria),migraciones:migrations.map(({sql,...m})=>m),tablasNuevas,secuenciasNuevas:['notificaciones_farmacia_id_seq','farmacia_solicitud_eventos_id_seq','farmacia_catalogo_auditoria_id_seq','farmacia_autorizacion_eventos_id_seq','farmacia_stock_eventos_id_seq'].filter(s=>!epsAplicada || s!=='farmacia_solicitud_eventos_id_seq'),indicesEsperadosTotales:29,archivosPendientesHistoricos:audit.destino.historial.filter(h=>!known.some(k=>k.nombre===h.migration_name)).map(h=>h.migration_name),hashesHistoricosDiferentes:audit.destino.historial.filter(h=>known.some(k=>k.nombre===h.migration_name&&k.sha256!==h.checksum)).map(h=>h.migration_name)};
    const sql=`-- SOLO PREPARADO. NO EJECUTAR SIN AUTORIZACIÓN EXPLÍCITA Y RESPALDO VERIFICADO.
-- No modifica pacientes, roles, permisos, vínculos ni existencias.
-- Replica los migration.sql pendientes; sus hashes están en manifest.json.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=public,pg_catalog;
SELECT pg_advisory_xact_lock(17112026,4);
DO $guard$
DECLARE faltante text;
BEGIN
 IF nullif(current_setting('saludclick.aprobacion_esquema',true),'') IS NULL THEN
  RAISE EXCEPTION 'Falta aprobación externa del esquema y respaldo; no se aplicó DDL';
 END IF;
 IF to_regclass('public._prisma_migrations') IS NULL THEN RAISE EXCEPTION 'No existe historial para reconciliar'; END IF;
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Hay migraciones incompletas'; END IF;
 IF EXISTS(
  SELECT 1 FROM public._prisma_migrations p LEFT JOIN (VALUES
   ${known.map(k=>`(${quote(k.nombre)},${quote(k.sha256)})`).join(',\n   ')}
  ) AS local(nombre,checksum) ON local.nombre=p.migration_name
  WHERE p.rolled_back_at IS NULL AND p.finished_at IS NOT NULL AND (local.nombre IS NULL OR local.checksum<>p.checksum)
 ) THEN RAISE EXCEPTION 'Historial no reconciliado: archivo ausente o checksum diferente. No cambiar checksums para eludir este control'; END IF;
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name IN (${pendientes.map(quote).join(',')}) AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Una migración pendiente ya está registrada: revisar, no reejecutar'; END IF;
 SELECT t INTO faltante FROM unnest(ARRAY['usuarios','solicitudes','detalle_solicitud','pagos','medicamentos','formulas_medicas','eps_entidades','eps_farmacias','administrative_audit']) t WHERE to_regclass('public.'||t) IS NULL LIMIT 1;
 IF faltante IS NOT NULL THEN RAISE EXCEPTION 'Falta dependencia %',faltante; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[${tablasNuevas.map(quote).join(',')}]) t WHERE to_regclass('public.'||t) IS NOT NULL) OR to_regclass('public.eps_farmacias_una_eps_activa_key') IS NOT NULL THEN RAISE EXCEPTION 'El esquema pendiente no está vacío: revisar sin sobrescribir'; END IF;
 IF EXISTS(SELECT 1 FROM public.eps_farmacias WHERE activa GROUP BY farmacia_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Hay farmacias con varias EPS activas; no se reparan automáticamente'; END IF;
END $guard$;

${migrations.map(m=>`-- ${m.nombre} | SHA256 ${m.sha256}\n${m.sql}`).join('\n\n')}

-- Comprobaciones antes de confirmar. El registro en Prisma es una operación
-- separada, autorizada SOLO después de verificar este DDL y la historia previa.
DO $verify$
BEGIN
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename=ANY(ARRAY[${tables.map(quote).join(',')}]))<>14 THEN RAISE EXCEPTION 'No están las 14 tablas esperadas'; END IF;
 IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND (tablename=ANY(ARRAY[${tables.map(quote).join(',')}]) OR indexname='eps_farmacias_una_eps_activa_key'))<>29 THEN RAISE EXCEPTION 'No están los 29 índices esperados'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=ANY(ARRAY[${tables.map(quote).join(',')}]) AND NOT c.convalidated) THEN RAISE EXCEPTION 'Restricciones no validadas'; END IF;
END $verify$;
COMMIT;
`;
    return {sql,manifest};
}
function archivos(folder,prefix=''){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(f=>f.isDirectory()?archivos(path.join(folder,f.name),prefix+f.name+'/'):f.isFile()&&f.name!=='manifest.json'&&/\.(sql|md|json)$/.test(f.name)?[prefix+f.name]:[]);}
if(require.main===module){const {sql,manifest}=preparar();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'10-esquema-pendiente.sql'),sql);manifest.sqlSha256=hash(sql);manifest.archivosRevisables=archivos(out).sort().map(nombre=>({nombre,sha256:hash(fs.readFileSync(path.join(out,nombre)))}));fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({estado:manifest.estado,tablas:manifest.tablasNuevas.length,indices:manifest.indicesEsperadosTotales,derivas:manifest.hashesHistoricosDiferentes,ausentes:manifest.archivosPendientesHistoricos,sqlSha256:manifest.sqlSha256}));}
module.exports={preparar,tables,names};
