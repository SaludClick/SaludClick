// Inspección de preparación. No contiene escrituras ni activa módulos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const migrationRoot=path.resolve(__dirname,'../prisma/migrations');
const migrations=fs.readdirSync(migrationRoot,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>({nombre:d.name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationRoot,d.name,'migration.sql'))).digest('hex')})).sort((a,b)=>a.nombre.localeCompare(b.nombre));
const tables=['roles','usuarios','eps_entidades','eps_farmacias','afiliados','pacientes_autorizados','administrative_audit','solicitudes','detalle_solicitud','pagos','formulas_medicas','medicamentos','categorias','_prisma_migrations','notificaciones_farmacia','farmacia_asignaciones','farmacia_solicitud_eventos','farmacia_formulas_autorizadas','farmacia_catalogo_autorizaciones','farmacia_catalogo_ambitos','farmacia_catalogo_auditoria','farmacia_sesiones','farmacia_rutas_eps','farmacia_autorizacion_eventos','solicitudes_ocultas_paciente','afiliado_cuentas_origen','farmacia_existencias','farmacia_stock_eventos'];
async function open(raw,operation){
    if(!raw)return {disponible:false,codigo:'CONEXION_NO_CONFIGURADA'};
    let pool;try{
        const u=new URL(raw);if(!['postgres:','postgresql:'].includes(u.protocol))throw new Error();u.searchParams.delete('options');if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))u.searchParams.set('sslmode','verify-full');
        pool=new Pool({connectionString:u.toString(),max:1,connectionTimeoutMillis:10000});const c=await pool.connect();
        try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='20s'");if((await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only!=='on')throw new Error();const data=await operation(c);await c.query('ROLLBACK');return {disponible:true,soloLectura:true,...data};}finally{c.release();}
    }catch(e){return {disponible:false,codigo:/^[A-Z0-9_]{3,40}$/.test(e.code||'')?e.code:'INSPECCION_NO_DISPONIBLE'};}finally{await pool?.end();}
}
async function main(){
    let accounts=[];
    const destino=await open(process.env.DATABASE_URL,async c=>{
        const presentes=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",[tables])).rows.map(r=>r.tablename);
        const columnas=(await c.query("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",[tables])).rows;
        const restricciones=(await c.query("SELECT t.relname AS tabla,x.conname AS nombre,x.contype AS tipo,x.convalidated AS validada,pg_get_constraintdef(x.oid) AS definicion FROM pg_constraint x JOIN pg_class t ON t.oid=x.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=ANY($1::text[]) ORDER BY t.relname,x.conname",[tables])).rows;
        const indices=(await c.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename,indexname",[tables])).rows;
        const permisos=(await c.query("SELECT t.relname AS tabla,t.relrowsecurity AS rls,t.relforcerowsecurity AS rls_forzada,pg_has_role(current_user,t.relowner,'USAGE') AS propietario_o_miembro,has_table_privilege(t.oid,'SELECT') AS leer,has_table_privilege(t.oid,'INSERT') AS insertar,has_table_privilege(t.oid,'UPDATE') AS actualizar,has_table_privilege(t.oid,'DELETE') AS borrar FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind='r' AND t.relname=ANY($1::text[]) ORDER BY t.relname",[tables])).rows;
        const rol=(await c.query('SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
        const historial=presentes.includes('_prisma_migrations')?(await c.query('SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations ORDER BY started_at')).rows.map(r=>({...r,archivoLocal:migrations.find(m=>m.nombre===r.migration_name)?.sha256===r.checksum})):[];
        const identidad=(await c.query("SELECT u.id,u.nombre,u.apellido,u.rol_id,r.nombre AS rol,u.estado,u.cedula IS NOT NULL AND length(btrim(u.cedula))>0 AS documentoRegistrado,u.correo FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=4")).rows.map(({correo,...r})=>({...r,correoEnmascarado:correo?correo.slice(0,1)+'***@'+correo.split('@').at(-1):null}));
        const eps=(await c.query('SELECT id::text,nombre,activa FROM eps_entidades ORDER BY id')).rows;
        const vinculos=(await c.query('SELECT id,eps_id::text,farmacia_id,activa,version,vinculada_at FROM eps_farmacias ORDER BY farmacia_id,eps_id')).rows;
        const duplicados=(await c.query('SELECT farmacia_id,count(*)::int AS n FROM eps_farmacias WHERE activa=true GROUP BY farmacia_id HAVING count(*)>1')).rows;
        const pacientes=(await c.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE cedula IS NOT NULL AND length(btrim(cedula))>0)::int AS conDocumento,count(DISTINCT cedula) FILTER(WHERE cedula IS NOT NULL AND length(btrim(cedula))>0)::int AS documentosUnicos FROM usuarios WHERE rol_id=2 AND estado='ACTIVO'")).rows[0];
        accounts=(await c.query("SELECT id,cedula,tipo_documento FROM usuarios WHERE rol_id=2 AND estado='ACTIVO' AND cedula IS NOT NULL AND length(btrim(cedula))>0")).rows;
        const solicitudes=(await c.query('SELECT estado,count(*)::int AS n FROM solicitudes GROUP BY estado ORDER BY estado')).rows;
        const pagos=(await c.query('SELECT estado,simulacion,count(*)::int AS n FROM pagos GROUP BY estado,simulacion ORDER BY estado,simulacion')).rows;
        const catalogo=(await c.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE requiere_formula=true)::int AS requiereFormula,count(*) FILTER(WHERE requiere_formula=false)::int AS noRequiere,count(*) FILTER(WHERE requiere_formula IS NULL)::int AS desconocido,count(*) FILTER(WHERE stock<0)::int AS stockNegativo FROM medicamentos")).rows[0];
        return {presentes,ausentes:tables.filter(t=>!presentes.includes(t)),columnas,restricciones,indices,permisos,rol,historial,identidad,eps,vinculos,duplicadosVinculosActivos:duplicados,pacientesCuentas:pacientes,solicitudes,pagos,catalogo};
    });
    const schema=process.env.EPS_DATABASE_SCHEMA||'public';
    const fuente=/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)?await open(process.env.EPS_DATABASE_URL,async c=>{
        const columnas=(await c.query("SELECT table_name,column_name,data_type,udt_name,is_nullable FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ('afiliados','eps') ORDER BY table_name,ordinal_position",[schema])).rows;
        const count=(await c.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE lower(btrim(estado::text))='activo')::int AS activos,count(DISTINCT id)::int AS idsUnicos,count(DISTINCT documento)::int AS documentosUnicos FROM "${schema}".afiliados`)).rows[0];
        const eps=(await c.query(`SELECT eps_id::text,count(*)::int AS afiliados FROM "${schema}".afiliados GROUP BY eps_id ORDER BY eps_id`)).rows;
        const catalogoEps=(await c.query(`SELECT id::text,nombre,estado FROM "${schema}".eps ORDER BY id`)).rows;
        const permisos=(await c.query("SELECT has_schema_privilege($1,'USAGE') AS usoEsquema,has_table_privilege(format('%I.afiliados',$1),'SELECT') AS leerAfiliados,has_table_privilege(format('%I.afiliados',$1),'INSERT') AS insertarAfiliados,has_table_privilege(format('%I.afiliados',$1),'UPDATE') AS actualizarAfiliados,has_table_privilege(format('%I.afiliados',$1),'DELETE') AS borrarAfiliados",[schema])).rows[0];
        // Compara en memoria y por parámetros. Nunca publica documentos ni nombres.
        const matches=(await c.query(`SELECT id::text,documento::text,tipo_documento::text,eps_id::text FROM "${schema}".afiliados WHERE documento::text=ANY($1::text[]) AND lower(btrim(estado::text))='activo'`,[accounts.map(a=>a.cedula)])).rows;
        const key=require('../src/services/farmacia-identidad.rules').clave;
        const candidatos=accounts.flatMap(a=>{const k=key(a.tipo_documento,a.cedula),hits=matches.filter(m=>k&&key(m.tipo_documento,m.documento)===k);return hits.length===1&&accounts.filter(x=>k&&key(x.tipo_documento,x.cedula)===k).length===1?[{usuario_id:a.id,afiliado_id:hits[0].id,eps_id:hits[0].eps_id}]:[];});
        return {columnas,conteos:count,eps,catalogoEps,permisos,candidatosIdentidadNoAutorizados:candidatos,cuentasSinCoincidenciaUnica:accounts.length-candidatos.length};
    }):{disponible:false,codigo:'ESQUEMA_EPS_INVALIDO'};
    console.log(JSON.stringify({fecha:new Date().toISOString(),ramaEsperada:'integracion/farmacia-pendientes',migracionesLocales:migrations,banderas:{operacion:process.env.FARMACIA_OPERACION_ENABLED==='true',notificaciones:process.env.FARMACIA_NOTIFICACIONES_ENABLED==='true',stockPropio:process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED==='true'},destino,fuente},null,2));
    if(!destino.disponible||!fuente.disponible)process.exitCode=2;
}
main().catch(()=>{console.error('Inspección no completada; no se imprimen credenciales ni documentos.');process.exitCode=2;});
