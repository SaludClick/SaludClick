const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const http=require('node:http');
const jwt=require('jsonwebtoken');
const Module=require('node:module');
const {createController}=require('../src/controllers/administrative.controller');
const originalLoad=Module._load,previousSecret=process.env.JWT_SECRET;
let server,origin,created=[],updated=[];
const repo={
 users:async()=>({usuarios:[{id:6,nombre:'Ana',rol_id:2}],total:1}),
 createUser:async(actor,data)=>{if(data.correo==='duplicate@example.test')throw {code:'P2002'};created.push({actor,data});const {password,...safe}=data;return {id:20,...safe};},
 updateUser:async(actor,id,data)=>{updated.push({actor,id,data});return {id,...data};},
 recordFailure:async()=>{}
};
before(async()=>{
 process.env.JWT_SECRET='isolated-admin-routes-key';
 Module._load=function(request,parent,isMain){
  if(request.endsWith('/administrative-session.middleware'))return require('./support/administrative-session-fixture.cjs');
  if(request==='../controllers/administrative.controller')return {createController:()=>createController({repo})};
  return originalLoad.call(this,request,parent,isMain);
 };
 const router=require('../src/routes/admin.routes');Module._load=originalLoad;
 const app=express();app.use(express.json());app.use('/api/admin',router);server=http.createServer(app);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}/api/admin`;
});
after(async()=>{Module._load=originalLoad;if(server)await new Promise(r=>server.close(r));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
async function call(path,{role=1,method='GET',body}={}){
 const headers={};if(role)headers.Authorization='Bearer '+jwt.sign({id:17,rol:role},process.env.JWT_SECRET,{expiresIn:'1h'});if(body)headers['Content-Type']='application/json';
 const response=await fetch(origin+path,{method,headers,body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};
}
test('administrator cannot read or update medication orders through compatibility routes',async()=>{
 for(const [path,method] of [['/pedidos','GET'],['/pedidos/4','PATCH']])assert.equal((await call(path,{method,body:method==='PATCH'?{estado:'ENTREGADA'}:undefined})).status,403);
});
test('account list and mutations deny anonymous and non-admin roles',async()=>{
 for(const role of [null,2,3,4])for(const [path,method] of [['/cuentas','GET'],['/cuentas','POST'],['/cuentas/6','PATCH'],['/cuentas/6','DELETE']])assert.equal((await call(path,{role,method,body:method==='GET'?undefined:{}})).status,role?403:401);
 assert.equal((await call('/cuentas')).data.usuarios[0].id,6);
 assert.equal((await call('/cuentas/6',{method:'DELETE'})).status,405);
});
test('new account contract validates document, hashes password and excludes privileged roles',async()=>{
 const input={nombre:'Ana',apellido:'Test',correo:'a@example.test',cedula:'0006',password:'long-test-password',rol_id:2};
 for(const rol_id of [2,3,4]){const r=await call('/cuentas',{method:'POST',body:{...input,rol_id}});assert.equal(r.status,201);assert.ok(!Object.hasOwn(r.data.usuario,'password'));assert.match(created.at(-1).data.password,/^\$2[aby]\$/);assert.equal(created.at(-1).actor,17);}
 assert.equal((await call('/cuentas',{method:'POST',body:{...input,rol_id:1}})).status,403);
 assert.equal((await call('/cuentas',{method:'POST',body:{...input,cedula:''}})).status,400);
 assert.equal((await call('/cuentas',{method:'POST',body:{...input,correo:'duplicate@example.test'}})).status,409);
});
test('account updates activate, deactivate and change allowed roles without accepting passwords',async()=>{
 for(const body of [{estado:'ACTIVO'},{estado:'INACTIVO'},{rol_id:4}]){assert.equal((await call('/cuentas/6',{method:'PATCH',body})).status,200);assert.equal(updated.at(-1).actor,17);}
 assert.equal((await call('/cuentas/6',{method:'PATCH',body:{password:'overwrite'}})).status,400);
 assert.equal((await call('/cuentas/6',{method:'PATCH',body:{rol_id:1}})).status,403);
});
