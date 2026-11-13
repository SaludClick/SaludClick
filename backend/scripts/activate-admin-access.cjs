// One account, one changed field. No migrations, password changes or EPS writes.
require('dotenv').config({quiet:true});
const assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const {Client}=require('pg');
const jwt=require('jsonwebtoken');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const path=require('node:path');

function validateCandidate(rows,candidates){
  if(rows.length!==1||candidates.length!==1||candidates[0].id!==1)throw new Error('AMBIGUOUS_ADMINISTRATOR');
  const {account,role}=rows[0];
  if(account.id!==1||account.rol_id!==1||account.estado!==null||!['admin','administrador'].includes(role.toLowerCase()))throw new Error('ADMIN_ID_ROLE_OR_STATE_MISMATCH');
  if(typeof account.password!=='string'||!/^\$2[aby]\$(1[0-5])\$[./A-Za-z0-9]{53}$/.test(account.password))throw new Error('EXISTING_PASSWORD_REQUIRES_REVIEW');
  return account;
}
async function activate(db,{verify=async()=>{}}={}){
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await db.query("SET LOCAL statement_timeout='15000'");
    await db.query('SELECT pg_advisory_xact_lock(72411014)');
    const candidates=(await db.query('SELECT id FROM usuarios WHERE rol_id=$1 AND estado IS NULL ORDER BY id',[1])).rows;
    const rows=(await db.query('SELECT to_jsonb(u) AS account,r.nombre AS role FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=$1 FOR UPDATE OF u',[1])).rows;
    const before=validateCandidate(rows,candidates);
    const fingerprint=async()=>(await db.query("SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id)::text,'[]')) AS value FROM usuarios u WHERE u.id<>$1",[1])).rows[0].value;
    const otherAccounts=await fingerprint();
    const result=await db.query('UPDATE usuarios SET estado=$1::"EstadoUsuario" WHERE id=$2 AND rol_id=$3 AND estado IS NULL RETURNING to_jsonb(usuarios) AS account',['ACTIVO',1,1]);
    if(result.rowCount!==1||result.rows.length!==1)throw new Error('EXPECTED_EXACTLY_ONE_UPDATED_ACCOUNT');
    if(!isDeepStrictEqual(result.rows[0].account,{...before,estado:'ACTIVO'}))throw new Error('UNAUTHORIZED_ACCOUNT_FIELD_CHANGE');
    if(await fingerprint()!==otherAccounts)throw new Error('OTHER_ACCOUNT_CHANGED');
    await db.query('INSERT INTO administrative_audit(actor_id,accion,entidad,registro_id,campos,resultado) VALUES($1,$2,$3,$4,$5::text[],$6)',[1,'ACCESO_ADMIN_ACTIVADO','USUARIO','1',['estado'],'EXITO']);
    // Verify the real HTTP routes against the uncommitted state. Any critical
    // failure rolls back activation and its audit record together.
    const checks=await verify();
    await db.query('COMMIT');
    return {id:1,rol:1,estadoAnterior:null,estadoNuevo:'ACTIVO',registrosActualizados:1,otrosCamposConservados:true,otrasCuentasConservadas:true,verificaciones:checks};
  }catch(error){await db.query('ROLLBACK');throw error;}
}
async function verifyHttp(origin,token){
  const allowed=['/api/administrativo/dashboard','/api/administrativo/usuarios','/api/admin/pacientes','/api/administrativo/atenciones','/api/administrativo/notificaciones','/api/administrativo/informes/usuarios','/api/administrativo/configuracion'];
  const denied=['/api/admin/afiliados','/api/admin/afiliados/1','/api/admin/afiliados/diagnostico/conexion','/api/ADMIN/AFILIADOS','/api/medicamentos','/api/MeDiCaMeNtOs','/api/formulas','/api/citas','/api/farmacia/inventario','/api/pedidos','/api/eps/verificar-acceso','/api/chat/conversaciones'];
  async function request(route,status,method='GET',authorization=token){
    const response=await fetch(origin+route,{method,headers:authorization?{Authorization:'Bearer '+authorization}:{},signal:AbortSignal.timeout(15000)});
    await response.arrayBuffer();
    assert.equal(response.status,status,`${method} ${route}: unexpected access result`);
  }
  for(const route of allowed)await request(route,200);
  for(const route of denied)await request(route,403);
  for(const method of ['POST','PUT','PATCH','DELETE'])await request('/api/admin/afiliados/1/cuenta',403,method);
  await request('/api/administrativo/dashboard',401,'GET',null);
  await request('/api/administrativo/dashboard',401,'GET',token+'altered');
  const expired=jwt.sign({id:1,rol:1},process.env.JWT_SECRET,{expiresIn:-1});
  await request('/api/administrativo/dashboard',401,'GET',expired);
  const policy=await import(pathToFileURL(path.resolve(__dirname,'../../frontend/public/js/roles.js')).href);
  assert.equal(policy.puedeAcceder('/pages/admin-afiliados.html',{rol:1}),false);
  const html=await(await fetch(origin+'/pages/admin.html')).text();
  const menu=[...html.matchAll(/data-section="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(menu,['dashboard','usuarios','pacientes','solicitudes','notificaciones','informes','configuracion']);
  const retired=await(await fetch(origin+'/pages/admin-afiliados.html')).text();
  assert.ok(!retired.includes('id="crearCuenta"'));
  return {modulosPermitidos:7,lecturasAutorizadas:allowed.length,rutasDenegadas:denied.length,creacionVinculadaBloqueada:true,jwtInvalidoExpiradoAusenteBloqueado:true,menuSieteSecciones:true};
}
async function main(){
  if(!process.env.DATABASE_URL||!process.env.JWT_SECRET)throw new Error('PRIVATE_CONFIGURATION_REQUIRED');
  const url=new URL(process.env.DATABASE_URL);
  if(['prefer','require','verify-ca'].includes(url.searchParams.get('sslmode')))url.searchParams.set('sslmode','verify-full');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:10000});
  let server,prisma,pool,previousRaw;
  try{
    await db.connect();
    if(!process.argv.includes('--apply')){
      await db.query('BEGIN READ ONLY');
      const rows=(await db.query('SELECT to_jsonb(u) AS account,r.nombre AS role FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=$1',[1])).rows;
      const candidates=(await db.query('SELECT id FROM usuarios WHERE rol_id=$1 AND estado IS NULL ORDER BY id',[1])).rows;
      const account=validateCandidate(rows,candidates);await db.query('ROLLBACK');
      console.log(JSON.stringify({soloLectura:true,id:account.id,rol:account.rol_id,estado:account.estado,candidatoUnico:true,hashExistenteValido:true,registrosActualizados:0}));return;
    }
    prisma=require('../src/config/prisma');pool=require('../src/config/database');
    const app=require('../src/app');server=http.createServer(app);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const token=jwt.sign({id:1,rol:1},process.env.JWT_SECRET,{expiresIn:'5m'});
    previousRaw=prisma.$queryRawUnsafe;
    const result=await activate(db,{verify:async()=>{
      // Only this isolated verification server uses this transaction connection.
      // The production guards and SQL stay unchanged; nothing is authenticated
      // via a mocked identity or by bypassing role/state validation.
      let pending=Promise.resolve();
      prisma.$queryRawUnsafe=(sql,...args)=>{
        const query=pending.then(()=>db.query(sql,args));
        pending=query.catch(()=>{});
        return query.then(result=>result.rows);
      };
      try{return await verifyHttp(origin,token);}finally{prisma.$queryRawUnsafe=previousRaw;}
    }});
    // Recheck the committed state through the ordinary Prisma connection.
    result.accesoTrasCommit=await verifyHttp(origin,token);
    console.log(JSON.stringify(result,null,2));
  }finally{
    if(prisma&&previousRaw)prisma.$queryRawUnsafe=previousRaw;
    if(server)await new Promise(resolve=>server.close(resolve));
    await db.end();if(prisma)await prisma.$disconnect();if(pool)await pool.end();
  }
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({estado:'OPERACION_NO_COMPLETADA',codigo:error.code||error.name,motivo:typeof error.message==='string'&&/^[A-Z_]+$/.test(error.message)?error.message:undefined}));process.exitCode=1;});
module.exports={activate,validateCandidate};
