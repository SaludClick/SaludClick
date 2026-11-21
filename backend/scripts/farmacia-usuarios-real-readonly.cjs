// Verificación real del directorio. Solo transacciones READ ONLY; no activa vínculos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const {Pool}=require('pg'),{Prisma}=require('@prisma/client');
const pools=[];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function conexion(raw){
    if(!raw)throw Object.assign(new Error(),{code:'CONEXION_NO_CONFIGURADA'});
    const u=new URL(raw);u.searchParams.delete('options');
    if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))u.searchParams.set('sslmode','verify-full');
    const pool=new Pool({connectionString:u.toString(),max:2,connectionTimeoutMillis:10000});pools.push(pool);return pool;
}
function adapter(pool){
    return {$transaction:async fn=>{
        const c=await pool.connect();
        try{
            await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            await c.query("SET LOCAL statement_timeout='20s'");
            assert.equal((await c.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
            const query=async(q,values=[])=>{
                assert.match(q,/^\s*(SELECT|SET TRANSACTION READ ONLY)/i);
                return(await c.query(q,values)).rows;
            };
            const tagged=async(strings,...values)=>{const q=Array.isArray(strings)?Prisma.sql(strings,...values):strings;return query(q.text,q.values);};
            return await fn({$executeRaw:tagged,$queryRaw:tagged,$executeRawUnsafe:query,$queryRawUnsafe:query});
        }finally{try{await c.query('ROLLBACK');}finally{c.release();}}
    }};
}
async function main(){
    const destino=conexion(process.env.DATABASE_URL),fuente=conexion(process.env.EPS_DATABASE_URL);
    const esquema=process.env.EPS_DATABASE_SCHEMA||'public';
    // Inyecta el pool controlado antes de importar el repositorio de producción.
    const id=require.resolve('../src/config/database');require.cache[id]={id,filename:id,loaded:true,exports:destino};
    const local=adapter(destino),source=require('../src/repositories/afiliados-origen.repository').crearOrigen({obtenerConexion:()=>({esquema,prisma:adapter(fuente)})});
    const cuentas=await require('../src/repositories/administrative-directory.repository').createDirectoryRepository(local).read();
    const originales=await source.leer();
    const directorio=require('../src/services/administrative-directory.service').createDirectoryService({local:{read:async()=>cuentas},source:{leer:async()=>originales}});
    const admin=await directorio.snapshot();
    const datos=await local.$transaction(async tx=>({
        farmacia:(await tx.$queryRawUnsafe('SELECT id,nombre,apellido,rol_id,estado FROM usuarios WHERE id=4'))[0],
        eps:(await tx.$queryRawUnsafe("SELECT id,nombre,activa FROM eps_entidades WHERE id='1'"))[0],
        vinculos:await tx.$queryRawUnsafe('SELECT id,eps_id,farmacia_id,activa,version FROM eps_farmacias WHERE farmacia_id=4'),
        indice:await tx.$queryRawUnsafe("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='eps_farmacias_una_eps_activa_key'"),
        duplicadosVinculosActivos:await tx.$queryRawUnsafe('SELECT farmacia_id,count(*)::int AS n FROM eps_farmacias WHERE activa GROUP BY farmacia_id HAVING count(*)>1'),
        tablasAcceso:await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('usuarios','eps_entidades','eps_farmacias','farmacia_sesiones') ORDER BY tablename"),
        historiaEps:await tx.$queryRawUnsafe("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name IN ('20261114090000_eps_workspace','20261115090000_eps_role_integration','20261115120000_farmacia_eps_unica') ORDER BY migration_name"),
        historiaCompleta:await tx.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name'),
        triggersVinculo:await tx.$queryRawUnsafe("SELECT tgname,pg_get_triggerdef(oid) AS definicion FROM pg_trigger WHERE tgrelid='public.eps_farmacias'::regclass AND NOT tgisinternal ORDER BY tgname"),
        administradores:await tx.$queryRawUnsafe("SELECT id FROM usuarios WHERE rol_id=1 AND estado='ACTIVO' ORDER BY id")
    }));
    const repositorio=require('../src/repositories/farmacia-eps.repository').createRepository(destino,source);
    const actual=await repositorio.consultar(4,{buscar:'',pagina:1,take:50});
    // Evidencia de la fuente propuesta; NO sustituye la respuesta autorizada anterior.
    const preview=await source.leerAutorizados('1',{buscar:'',pagina:1,take:50});
    const activos=originales.afiliados.filter(a=>a.eps_id==='1'&&String(a.estado).trim().toLowerCase()==='activo');
    assert.equal(preview.totalActivos,activos.length);
    const campos=['nombres','apellidos','tipo_documento','documento','correo','estado'];
    for(const p of preview.pacientes){
        const a=activos.find(a=>a.id===p.identificador);assert.ok(a);
        for(const campo of campos)assert.equal(p[campo],a[campo]);
        assert.ok(admin.rows.some(r=>r.afiliados_eps.some(x=>x.id===p.identificador&&x.documento===p.documento)));
    }
    if(actual.vinculacion.estado==='VINCULADA'){
        assert.equal(String(actual.vinculacion.eps.id),'1');
        assert.equal(actual.totalActivos,preview.totalActivos);
        assert.equal(actual.paginacion.total,preview.total);
        assert.equal(actual.pacientes.length,preview.pacientes.length);
        for(const p of actual.pacientes){
            const a=preview.pacientes.find(a=>a.identificador===p.identificador);assert.ok(a);
            for(const campo of campos)assert.equal(p[campo],a[campo]);
        }
    }
    const primero=preview.pacientes[0];
    const filtros=[];
    if(primero){
        for(const campo of ['documento','correo'])if(primero[campo]){
            const respuesta=await source.leerAutorizados('1',{buscar:primero[campo],pagina:1,take:50});
            assert.ok(respuesta.pacientes.some(p=>p.identificador===primero.identificador));filtros.push(campo);
        }
        const respuesta=await source.leerAutorizados('1',{tipo_documento:primero.tipo_documento.trim().toUpperCase(),pagina:1,take:50});
        assert.ok(respuesta.pacientes.length);assert.ok(respuesta.pacientes.every(p=>p.tipo_documento.trim().toUpperCase()===primero.tipo_documento.trim().toUpperCase()));filtros.push('tipo_documento');
    }
    const key=require('../src/services/farmacia-identidad.rules').clave;
    const pacientes=cuentas.filter(u=>u.rol_id===2);
    const correspondencias=pacientes.flatMap(u=>{const k=key(u.tipo_documento,u.cedula),a=originales.afiliados.filter(a=>k&&key(a.tipo_documento,a.documento)===k);return a.length===1&&pacientes.filter(x=>key(x.tipo_documento,x.cedula)===k).length===1?[{usuario_id:u.id,afiliado_id:a[0].id,eps_id:a[0].eps_id}]:[];});
    const operacion=process.env.FARMACIA_OPERACION_ENABLED==='true';
    const aplicadas=datos.historiaCompleta.filter(h=>h.finished_at&&!h.rolled_back_at);
    const historiaLocal=aplicadas.map(h=>{
        const file=/^[A-Za-z0-9_-]+$/.test(h.migration_name)?path.resolve(__dirname,'../prisma/migrations',h.migration_name,'migration.sql'):null;
        const sha256=file&&fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
        return{nombre:h.migration_name,sha256Aplicado:h.checksum,sha256Local:sha256,coincide:sha256===h.checksum};
    });
    const bloqueosAdicionales=[];
    if(datos.farmacia?.rol_id!==3||datos.farmacia?.estado!=='ACTIVO')bloqueosAdicionales.push('FARMACIA_NO_VIGENTE');
    if(datos.eps?.activa!==true)bloqueosAdicionales.push('EPS_NO_VIGENTE');
    if(datos.duplicadosVinculosActivos.length)bloqueosAdicionales.push('RELACIONES_ACTIVAS_DUPLICADAS');
    if(operacion&&!datos.tablasAcceso.some(t=>t.tablename==='farmacia_sesiones'))bloqueosAdicionales.push('SESIONES_REQUERIDAS_POR_BANDERA_SIN_TABLA');
    if(datos.historiaCompleta.some(h=>!h.finished_at&&!h.rolled_back_at))bloqueosAdicionales.push('MIGRACION_INCOMPLETA');
    if(historiaLocal.some(h=>!h.coincide))bloqueosAdicionales.push('HISTORIA_LOCAL_NO_RECONCILIADA_PARA_DDL');
    return {fecha:new Date().toISOString(),soloLectura:true,...datos,
        reconciliacionLocal:{aplicadas:historiaLocal.length,todasCoinciden:historiaLocal.every(h=>h.coincide),migraciones:historiaLocal},
        acceso:{operacionHabilitada:operacion,notificacionesHabilitadas:process.env.FARMACIA_NOTIFICACIONES_ENABLED==='true',bloqueosAdicionalesDetectados:bloqueosAdicionales,limite:'No verifica despliegue remoto ni sesión real del navegador'},
        administrador:{cuentas:cuentas.length,cuentasPaciente:pacientes.length,afiliadosOriginales:originales.afiliados.length,resumen:admin.resumen},
        correspondenciasPorTipoNumeroNoActivadas:correspondencias,
        farmaciaRespuestaReal:{vinculacion:actual.vinculacion,pacientes:actual.pacientes.length,totalActivos:actual.totalActivos},
        fuentePropuestaSinActivar:{epsId:'1',totalActivos:preview.totalActivos,registrosComprobados:preview.pacientes.length,todosPresentesEnAdministrador:true,camposIguales:campos,filtrosComprobados:filtros,huellaSnapshot:hash(preview.pacientes)},
        conclusion:actual.vinculacion.estado==='VINCULADA'?'CONSULTA_REAL_AUTORIZADA_VERIFICADA':'BLOQUEADO_POR_VINCULO_NO_ACTIVO_NO_DECLARAR_TERMINADO'};
}
main().then(result=>{
    const out=process.argv[2];if(out)fs.writeFileSync(path.resolve(out),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(result,null,2));
}).catch(e=>{console.error(JSON.stringify({estado:'NO_VERIFICADO',codigo:/^[A-Z0-9_]{3,50}$/.test(e.code||'')?e.code:'VERIFICACION_FALLIDA'}));process.exitCode=2;}).finally(async()=>{await Promise.all(pools.map(p=>p.end()));});
