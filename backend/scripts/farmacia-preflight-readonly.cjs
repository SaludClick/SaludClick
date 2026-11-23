// Verificación exclusivamente SELECT. Nunca aplica esquema, permisos o vínculos.
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const {Pool}=require('pg');
const farmaciaId=Number(process.argv.find(a=>a.startsWith('--farmacia-id='))?.split('=')[1]||4);
if(!Number.isSafeInteger(farmaciaId)||farmaciaId<1)throw new Error('Identificador de farmacia inválido.');
async function readOnly(raw,operation){
    if(!raw)return {disponible:false,codigo:'CONEXION_NO_CONFIGURADA'};
    let pool;
    try{
        const url=new URL(raw);
        if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('URL_INVALIDA');
        if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))url.searchParams.set('sslmode','verify-full');
        // Los poolers no siempre admiten options en startup. La primera orden
        // de la sesión inicia READ ONLY; todas las consultas corren dentro de ella.
        url.searchParams.delete('options');
        pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:10000});
        const c=await pool.connect();
        try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='15s'");const mode=(await c.query('SHOW transaction_read_only')).rows[0];if(mode.transaction_read_only!=='on')throw new Error('LECTURA_NO_GARANTIZADA');const data=await operation(c);await c.query('ROLLBACK');return {disponible:true,soloLectura:true,...data};}
        finally{c.release();}
    }catch(e){return {disponible:false,codigo:/^[A-Z0-9_]{3,40}$/.test(e.code||'')?e.code:'VERIFICACION_NO_DISPONIBLE'};}
    finally{await pool?.end();}
}
async function main(){
    let epsIds=[];
    const target=await readOnly(process.env.DATABASE_URL,async c=>{
        const tables=['usuarios','eps_entidades','eps_farmacias','afiliado_cuentas_origen','farmacia_asignaciones','farmacia_solicitud_eventos','farmacia_formulas_autorizadas','farmacia_catalogo_autorizaciones','farmacia_catalogo_ambitos','farmacia_catalogo_auditoria','farmacia_autorizacion_eventos','farmacia_rutas_eps','farmacia_sesiones','notificaciones_farmacia','farmacia_existencias','farmacia_stock_eventos'];
        const found=(await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[tables])).rows.map(r=>r.table_name);
        const esquema=Object.fromEntries(tables.map(t=>[t,found.includes(t)]));
        const cuenta=esquema.usuarios?(await c.query('SELECT rol_id,estado FROM usuarios WHERE id=$1',[farmaciaId])).rows[0]:null;
        let vinculosActivos=null,identidades=null,solicitudesAsignadas=null,enCurso=null,stockPropio=null;
        if(esquema.eps_farmacias){const links=(await c.query('SELECT eps_id::text FROM eps_farmacias WHERE farmacia_id=$1 AND activa=true',[farmaciaId])).rows;vinculosActivos=links.length;epsIds=links.map(r=>r.eps_id);}
        if(esquema.afiliado_cuentas_origen)identidades=(await c.query('SELECT count(*)::int AS n FROM afiliado_cuentas_origen WHERE eps_id=ANY($1::text[]) AND verificado_at IS NOT NULL',[epsIds])).rows[0].n;
        if(esquema.farmacia_asignaciones){solicitudesAsignadas=(await c.query('SELECT count(*)::int AS n FROM farmacia_asignaciones WHERE farmacia_id=$1 AND activa=true',[farmaciaId])).rows[0].n;enCurso=(await c.query("SELECT count(*)::int AS n FROM solicitudes s JOIN farmacia_asignaciones fa ON fa.solicitud_id=s.id WHERE fa.farmacia_id=$1 AND fa.activa=true AND s.estado IN ('PREPARANDO','LISTA')",[farmaciaId])).rows[0].n;}
        if(esquema.farmacia_existencias)stockPropio=(await c.query('SELECT count(*)::int AS n FROM farmacia_existencias WHERE farmacia_id=$1',[farmaciaId])).rows[0].n;
        const index=(await c.query("SELECT i.indisunique AND i.indisvalid AND i.indisready AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='farmacia_id') AND pg_get_expr(i.indpred,i.indrelid) IN ('activa','(activa = true)') AS valido FROM pg_index i WHERE i.indexrelid=to_regclass('public.eps_farmacias_una_eps_activa_key') AND i.indrelid=to_regclass('public.eps_farmacias')")).rows[0]?.valido===true;
        const epsDisponibles=esquema.eps_entidades?(await c.query('SELECT id::text,nombre FROM eps_entidades WHERE activa=true ORDER BY id')).rows:[];
        return {esquema,cuentaFarmaciaVigente:cuenta?.rol_id===3&&cuenta?.estado==='ACTIVO',vinculosActivos,indiceVinculoUnico:index,identidades,solicitudesAsignadas,solicitudesEnCurso:enCurso,referenciasStockPropio:stockPropio,epsDisponibles};
    });
    const schema=process.env.EPS_DATABASE_SCHEMA||'public';
    const source=/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)?await readOnly(process.env.EPS_DATABASE_URL,async c=>{
        const columns=(await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='afiliados'",[schema])).rows.map(r=>r.column_name);
        const required=['id','nombres','apellidos','documento','estado','eps_id'];
        if(required.some(k=>!columns.includes(k)))return {esquemaCompleto:false};
        const {rows}=await c.query(`SELECT count(*)::int AS total,count(DISTINCT id)::int AS identificadoresUnicos,count(DISTINCT documento)::int AS documentosUnicos,count(*) FILTER(WHERE lower(btrim(estado::text))='activo')::int AS activos,count(*) FILTER(WHERE eps_id::text=ANY($1::text[]) AND lower(btrim(estado::text))='activo')::int AS activosEnEpsVinculada FROM "${schema}".afiliados`,[epsIds]);
        const epsOrigen=(await c.query(`SELECT eps_id::text,count(*)::int AS afiliados,count(*) FILTER(WHERE lower(btrim(estado::text))='activo')::int AS activos FROM "${schema}".afiliados GROUP BY eps_id ORDER BY eps_id`)).rows;
        return {esquemaCompleto:true,...rows[0],epsOrigen};
    }):{disponible:false,codigo:'ESQUEMA_EPS_INVALIDO'};
    console.log(JSON.stringify({fecha:new Date().toISOString(),farmaciaId,banderas:{operacion:process.env.FARMACIA_OPERACION_ENABLED==='true',notificaciones:process.env.FARMACIA_NOTIFICACIONES_ENABLED==='true',inventarioPropio:process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED==='true'},destino:target,fuenteEps:source},null,2));
    if(!target.disponible||!source.disponible)process.exitCode=2;
}
main().catch(()=>{console.error('No se completó la verificación de solo lectura. No se imprimen credenciales ni datos personales.');process.exitCode=2;});
