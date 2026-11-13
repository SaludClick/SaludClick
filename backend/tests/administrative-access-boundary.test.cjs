const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
const Module=require('node:module');
const {createSessionGuard}=require('../src/middlewares/administrative-session.middleware');
const {administrativeScope}=require('../src/middlewares/administrative-scope.middleware');
const previousSecret=process.env.JWT_SECRET;
const secret='isolated-access-boundary-test';
let server,origin;
const users={1:{id:1,rol_id:1,estado:'ACTIVO'},2:{id:2,rol_id:2,estado:'ACTIVO'},3:{id:3,rol_id:3,estado:'ACTIVO'},4:{id:4,rol_id:4,estado:'ACTIVO'},5:{id:5,rol_id:1,estado:null}};
before(async()=>{
  process.env.JWT_SECRET=secret;
  const session=createSessionGuard({verify:token=>jwt.verify(token,secret),findUser:async id=>users[id]});
  const originalLoad=Module._load;
  try{
    Module._load=function(request,parent,isMain){
      if(request.endsWith('/administrative-session.middleware'))return {session,roles:(...roles)=>[(req,res,next)=>{req.allowedRoles=roles;next();},session]};
      if(request==='../services/afiliados-consulta.service')throw new Error('Forbidden affiliate service must never be loaded');
      return originalLoad.call(this,request,parent,isMain);
    };
    const app=express();app.use(express.json());app.use('/api',administrativeScope);
    app.use('/api/admin',require('../src/routes/admin.routes'));
    app.use('/api/admin/afiliados',require('../src/routes/afiliados.routes'));
    // A protected sentinel detects any escape past the shared admin boundary.
    app.use('/api',(req,res)=>res.json({ok:true}));
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin=`http://127.0.0.1:${server.address().port}/api`;
  }finally{Module._load=originalLoad;}
});
after(async()=>{if(server)await new Promise(r=>server.close(r));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
async function request(path,role,method='GET',claims){
  const token=role?jwt.sign(claims||{id:role,rol_id:role},secret,{expiresIn:'5m'}):null;
  return fetch(origin+path,{method,headers:token?{Authorization:'Bearer '+token}:{}});
}
test('retired affiliate routes reject every role and method before source or account access',async()=>{
  for(const role of [null,1,2,3,4])for(const path of ['/admin/afiliados','/admin/afiliados/1','/admin/afiliados/diagnostico/conexion','/admin/afiliados/1/cuenta','/ADMIN/AFILIADOS/1/cuenta'])for(const method of ['GET','POST','PUT','PATCH','DELETE']){
    assert.equal((await request(path,role,method)).status,role?403:401,`${role} ${method} ${path}`);
  }
});
test('clinical and pharmacy boundaries deny administrator including case variants',async()=>{
  for(const path of ['/citas','/medicamentos','/formulas/1','/pedidos','/farmacia/inventario','/eps/verificar-acceso','/MeDiCaMeNtOs','/FARMACIA/inventario'])for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await request(path,1,method)).status,403);
});
test('shared boundary preserves other roles and the six administrative API groups',async()=>{
  for(const [role,path] of [[2,'/medicamentos'],[2,'/formulas'],[2,'/pedidos'],[3,'/farmacia/inventario'],[4,'/eps/verificar-acceso'],[2,'/chat/conversaciones']])assert.equal((await request(path,role)).status,200);
  for(const path of ['/administrativo/dashboard','/administrativo/usuarios','/administrativo/atenciones','/administrativo/notificaciones','/administrativo/informes/usuarios','/administrativo/configuracion'])assert.equal((await request(path,1)).status,200);
});
test('retired administrative patient routes deny every method without reaching patient storage',async()=>{
  for(const path of ['/admin/pacientes','/admin/pacientes/1'])for(const method of ['GET','POST','PUT','PATCH','DELETE'])assert.equal((await request(path,1,method)).status,403);
  for(const role of [2,3,4])assert.equal((await request('/admin/pacientes',role)).status,403);
  assert.equal((await request('/admin/pacientes',null)).status,401);
});
test('retired route fails closed for altered claims, expired JWT and undefined account state',async()=>{
  assert.equal((await request('/admin/afiliados',4,'GET',{id:1,rol_id:4})).status,403);
  assert.equal((await request('/admin/afiliados',1,'GET',{id:5,rol_id:1})).status,403);
  const expired=jwt.sign({id:4,rol_id:4},secret,{expiresIn:-1});
  assert.equal((await fetch(origin+'/admin/afiliados',{headers:{Authorization:'Bearer '+expired}})).status,401);
});
