// Explicit PostgreSQL integration: all fixture writes are rolled back, never
// activate or edit existing accounts. Run separately from the isolated suite.
require('dotenv').config({quiet:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const http=require('node:http');
const express=require('express');
const jwt=require('jsonwebtoken');
const bcrypt=require('bcrypt');
const prisma=require('../src/config/prisma');
const {createRepository}=require('../src/repositories/administrative.repository');
const {createRepository:createPatients}=require('../src/repositories/pacientes-autorizados.repository');
const {createController}=require('../src/controllers/administrative.controller');
const {createRouter}=require('../src/routes/administrative.routes');
const {createSessionGuard}=require('../src/middlewares/administrative-session.middleware');

test('seven administrative modules use PostgreSQL, with all fixture data rolled back',{timeout:120000},async()=>{
  const rollback=new Error('ROLLBACK_TEST_FIXTURES');
  let completed=false;
  try{
    await assert.rejects(prisma.$transaction(async tx=>{
      const suffix=randomUUID().slice(0,8),secret=randomUUID();
      const password='integration-password-only';
      const admin=await tx.usuario.create({data:{nombre:'Integration',apellido:'Administrator',correo:`admin.${suffix}@example.test`,cedula:`A${suffix}`,password:await bcrypt.hash(password,12),rol_id:1,estado:'ACTIVO'}});
      let databaseError;
      const db={$queryRawUnsafe:async(...args)=>{try{return await tx.$queryRawUnsafe(...args);}catch(error){databaseError??={code:error.code,meta:error.meta};throw error;}},$transaction:fn=>fn(db)};
      const repo=createRepository(db);
      const patients=createPatients({...tx,$transaction:fn=>Array.isArray(fn)?Promise.all(fn):fn(tx)});
      const patient=await patients.crear({nombres:'Integration',apellidos:'Patient',tipo_documento:'CC',cedula:`P${suffix}`},admin.id);
      const guard=createSessionGuard({verify:token=>jwt.verify(token,secret),findUser:async id=>(await tx.$queryRawUnsafe('SELECT u.id,u.rol_id,u.estado,p.sesiones_revocadas_at FROM usuarios u LEFT JOIN administrative_preferences p ON p.usuario_id=u.id WHERE u.id=$1',id))[0]});
      const guards=(...roles)=>[(req,res,next)=>{req.allowedRoles=roles;next();},guard];
      const app=express();app.use(express.json());app.use('/api/administrativo',createRouter({controller:createController({repo}),guards}));
      const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const origin=`http://127.0.0.1:${server.address().port}/api/administrativo`;
      // PostgreSQL now() is fixed at the outer transaction's start. Issue fixture
      // tokens earlier so revocation has the same chronology as a real session.
      const token=(id,rol)=>jwt.sign({id,rol,iat:Math.floor(Date.now()/1000)-120},secret,{expiresIn:'10m'});
      const adminToken=token(admin.id,1);
      async function request(path,{method='GET',body,auth=adminToken,status=200}={}){
        const response=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
        assert.equal(response.status,status,`${method} ${path}${response.status===500?' '+JSON.stringify(databaseError):''}`);
        if(response.headers.get('content-type')?.includes('application/json'))return response.json();
        return Buffer.from(await response.arrayBuffer());
      }
      try{
        const baseline=(await request('/dashboard')).estadisticas;
        assert.ok(baseline.pacientes.total>=1);
        const {usuario:client}=await request('/usuarios',{method:'POST',status:201,body:{nombre:'Integration',apellido:'Client',correo:`client.${suffix}@example.test`,cedula:patient.cedula,rol_id:2,estado:'ACTIVO',password}});
        assert.ok(!('password' in client));
        assert.equal((await request('/usuarios/'+client.id)).usuario.correo,client.correo);
        assert.equal((await request('/usuarios?buscar='+suffix+'&rol_id=2&estado=ACTIVO')).total,1);
        await request('/usuarios',{method:'POST',status:409,body:{nombre:'Duplicate',apellido:'Client',correo:client.correo,cedula:'D'+suffix,rol_id:2,password}});
        assert.equal((await patients.listar({busqueda:client.correo,page:1,limit:20,estado:'AUTORIZADO'})).paginacion.total,1);
        await patients.actualizar(patient.id,{apellidos:'Updated',estado:'REVOCADO'},admin.id);
        assert.equal((await patients.buscarPorId(patient.id)).estado,'REVOCADO');
        const clientToken=token(client.id,2);
        await request('/dashboard',{auth:clientToken,status:403});
        await request('/usuarios/'+client.id,{auth:clientToken,status:403});
        await request('/notificaciones/leidas',{auth:token(admin.id,3),method:'PATCH',status:403});
        const {caso}=await request('/atenciones',{auth:clientToken,method:'POST',status:201,body:{tipo:'SOLICITUD',categoria:'SOPORTE',asunto:'Integration '+suffix,contenido:'Administrative support'}});
        assert.equal((await request('/atenciones?buscar='+suffix+'&estado=ABIERTA')).total,1);
        assert.equal((await request('/dashboard')).estadisticas.solicitudes.pendientes,baseline.solicitudes.pendientes+1);
        await request('/atenciones/'+caso.id,{method:'PATCH',body:{estado:'EN_ATENCION',responsable_id:admin.id}});
        await request(`/atenciones/${caso.id}/mensajes`,{method:'POST',body:{contenido:'Administrative reply'}});
        const detail=await request('/atenciones/'+caso.id);
        assert.equal(detail.mensajes.length,2);assert.equal(detail.caso.responsable_id,admin.id);assert.ok(detail.historial.length>=3);
        await request(`/atenciones/${caso.id}/leido`,{method:'POST',body:{hasta:detail.mensajes.at(-1).id}});
        await request('/atenciones/'+caso.id,{method:'PATCH',body:{estado:'RESUELTA'}});
        assert.equal((await request('/dashboard')).estadisticas.solicitudes.resueltas,baseline.solicitudes.resueltas+1);
        assert.ok((await request('/notificaciones?estado=NO_LEIDA')).sinLeer>=1);
        await request('/notificaciones/leidas',{method:'PATCH'});
        assert.equal((await request('/notificaciones')).sinLeer,0);
        for(const type of ['usuarios','pacientes','estados','roles','solicitudes','atendidas','tiempos']){
          const {informe}=await request('/informes/'+type+'?buscar='+suffix);
          assert.ok(informe.resumen.total>=1,type);assert.ok(informe.columnas.length>0);
          const csv=await request('/informes/'+type+'?formato=csv&buscar='+suffix);assert.ok(csv.length>0);
          const pdf=await request('/informes/'+type+'?formato=pdf&buscar='+suffix);assert.ok(pdf.toString().startsWith('%PDF'));
        }
        const empty=(await request('/informes/pacientes?buscar=missing-'+randomUUID())).informe;
        assert.equal(empty.filas.length,0);assert.equal(empty.resumen.total,0);assert.ok(empty.columnas.length);
        await request('/perfil',{method:'PUT',body:{nombre:'Updated',apellido:'Admin',telefono:'123',ciudad:'Bogota'}});
        assert.equal((await request('/perfil')).usuario.nombre,'Updated');
        await request('/preferencias',{method:'PUT',body:{notificaciones:false,compacto:true}});
        assert.equal((await request('/preferencias')).preferencias.compacto,true);
        await request('/configuracion/general',{method:'PUT',body:{valor:{nombrePanel:'Admin integration',mensajeSoporte:'Administrative support'}}});
        await request('/configuracion/faq',{method:'PUT',body:{valor:[{pregunta:'Support?',respuesta:'Open a request.'}]}});
        assert.equal((await request('/faq',{auth:clientToken})).preguntas.length,1);
        await request('/configuracion/private',{method:'PUT',status:403,body:{valor:'hidden'}});
        await request('/password',{method:'POST',body:{actual:password,nueva:'another-integration-password'}});
        await request('/perfil',{status:401});
        assert.ok(await bcrypt.compare('another-integration-password',(await tx.usuario.findUnique({where:{id:admin.id}})).password));
        completed=true;
      }finally{await new Promise(resolve=>server.close(resolve));}
      throw rollback;
    },{timeout:110000,isolationLevel:'Serializable'}),error=>error===rollback);
    assert.ok(completed);
  }finally{await prisma.$disconnect();await require('../src/config/database').end();}
});
