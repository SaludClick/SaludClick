// Real PostgreSQL + production HTTP routes, read-only. No migrations, fixtures,
// exports that record audits, account mutations or persistent JWTs.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict');
const http=require('node:http');
const jwt=require('jsonwebtoken');
const {createHash}=require('node:crypto');
async function main(){
  const prisma=require('../src/config/prisma'),pool=require('../src/config/database'),eps=require('../src/config/eps-prisma');
  let server;
  try{
    const source=require('../src/repositories/afiliados-origen.repository');
    const fingerprint=async()=>(await prisma.$queryRawUnsafe("SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY id)::text,'[]')) AS value FROM usuarios u"))[0].value;
    const sourceFingerprint=async()=>createHash('sha256').update(JSON.stringify((await source.leer()).afiliados)).digest('hex');
    const before=await fingerprint(),epsBefore=await sourceFingerprint();
    const admins=await prisma.$queryRawUnsafe("SELECT id,rol_id FROM usuarios WHERE rol_id=1 AND estado='ACTIVO' ORDER BY id");
    assert.equal(admins.length,1,'Exactly one active administrative account required for this verification');
    const token=jwt.sign({id:admins[0].id,rol:1},process.env.JWT_SECRET,{expiresIn:'10m'});
    const app=require('../src/app');server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    async function get(path,{status=200,auth=token}={}){
      const res=await fetch(origin+path,{headers:auth?{Authorization:'Bearer '+auth}:{},signal:AbortSignal.timeout(20000)});
      assert.equal(res.status,status,`GET ${path.split('?')[0]}`);return res.headers.get('content-type')?.includes('application/json')?res.json():res.text();
    }
    const first=await get('/api/administrativo/usuarios?limit=20');const all=[...first.usuarios];
    for(let page=2;page<=Math.ceil(first.total/20);page++)all.push(...(await get('/api/administrativo/usuarios?limit=20&page='+page)).usuarios);
    assert.equal(all.length,first.total);assert.equal(new Set(all.map(r=>r.clave)).size,first.total);
    assert.equal(first.resumen.afiliados_eps,50);
    assert.equal(first.total,first.resumen.cuentas_acceso+50-first.resumen.coincidencias);
    assert.equal(new Set(all.flatMap(r=>r.afiliados_eps.map(a=>a.id))).size,50);
    assert.ok(all.filter(r=>r.id===null).every(r=>r.estado_cuenta==='SIN_CUENTA'&&r.rol_id===null&&!r.acciones.editar));
    const epsRows=await get('/api/administrativo/usuarios?origen=EPS&limit=100');assert.equal(epsRows.total,50);
    const localRows=await get('/api/administrativo/usuarios?origen=SALUDCLICK&limit=100');assert.equal(localRows.total,first.resumen.cuentas_acceso);
    assert.equal((await get('/api/admin/cuentas?limit=100')).total,first.resumen.cuentas_acceso);
    const example=epsRows.usuarios[0];
    assert.ok((await get('/api/administrativo/usuarios?buscar='+encodeURIComponent(example.cedula))).usuarios.some(r=>r.clave===example.clave));
    if(example.correo)assert.ok((await get('/api/administrativo/usuarios?buscar='+encodeURIComponent(example.correo))).usuarios.some(r=>r.clave===example.clave));
    const detail=await get('/api/administrativo/usuarios/directorio/'+encodeURIComponent(example.clave));assert.equal(detail.registro.clave,example.clave);assert.ok(!('password' in detail.registro));
    const dashboard=(await get('/api/administrativo/dashboard')).estadisticas;assert.deepEqual(dashboard.directorio,first.resumen);assert.ok(!('pacientes' in dashboard));
    for(const type of ['usuarios','afiliados','origenes']){
      const {informe}=await get('/api/administrativo/informes/'+type);
      assert.equal(informe.resumen.total,type==='afiliados'?50:first.total);
    }
    await get('/api/admin/pacientes',{status:403});await get('/api/admin/pacientes/1',{status:403});
    await get('/api/admin/afiliados',{status:403});
    await get('/api/administrativo/usuarios',{status:401,auth:null});
    for(const role of [2,3,4]){
      const altered=jwt.sign({id:admins[0].id,rol:role},process.env.JWT_SECRET,{expiresIn:'2m'});
      await get('/api/administrativo/usuarios',{status:403,auth:altered});
    }
    const html=await get('/pages/admin.html');assert.deepEqual([...html.matchAll(/data-section="([^"]+)"/g)].map(m=>m[1]),['dashboard','usuarios','solicitudes','notificaciones','informes','configuracion']);
    const retired=await get('/pages/admin-pacientes.html');assert.ok(!retired.includes('id="patientsTable"'));assert.ok(retired.includes('admin-pacientes.js'));
    assert.equal(await fingerprint(),before,'All local account fields must remain unchanged');assert.equal(await sourceFingerprint(),epsBefore,'All original EPS fields must remain unchanged');
    console.log(JSON.stringify({soloLectura:true,modulos:6,registrosVisibles:first.total,cuentasLocales:first.resumen.cuentas_acceso,afiliadosEPS:first.resumen.afiliados_eps,coincidencias:first.resumen.coincidencias,revisionIdentidad:first.resumen.revision_identidad,paginacionBusquedaFiltros:true,detalleSoloLecturaEPS:true,dashboardInformes:true,permisos:true,huellaCuentasSinCambios:true,huellaEPSSinCambios:true,migracionesEjecutadas:0,registrosModificados:0},null,2));
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await eps.cerrarConexionEPS();await prisma.$disconnect();await pool.end();}
}
main().catch(error=>{console.error(JSON.stringify({estado:'VERIFICACION_NO_COMPLETADA',codigo:error.code||error.name,comprobacion:error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:undefined}));process.exitCode=1;});
