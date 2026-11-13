const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const express=require('express');
const jwt=require('jsonwebtoken');
const {createSessionGuard}=require('../src/middlewares/administrative-session.middleware');
const {createRepository}=require('../src/repositories/administrative.repository');
const {createService}=require('../src/services/administrative.service');
const {createController}=require('../src/controllers/administrative.controller');
const {createRouter}=require('../src/routes/administrative.routes');
const {createLimiter}=require('../src/middlewares/administrative-rate.middleware');
const v=require('../src/validators/administrative.validator');
const out=require('../src/services/administrative-export.service');
const secret='isolated-administrative-test-key';
function response(){return {code:200,body:null,status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(){}};}
test('session uses current database state, role, revocation and signed JWT',async t=>{
  for(const [label,user,claims,status] of [
    ['active admin',{id:1,rol_id:1,estado:'ACTIVO'},{id:1,rol:1},200],
    ['inactive',{id:1,rol_id:1,estado:'INACTIVO'},{id:1,rol:1},403],
    ['undefined state',{id:1,rol_id:1,estado:null},{id:1,rol:1},403],
    ['deleted',null,{id:1,rol:1},403],
    ['changed role',{id:1,rol_id:2,estado:'ACTIVO'},{id:1,rol:1},403],
    ['revoked',{id:1,rol_id:1,estado:'ACTIVO',sesiones_revocadas_at:new Date()},{id:1,rol:1,iat:1},401],
    ['wrong entity role',{id:2,rol_id:2,estado:'ACTIVO'},{id:2,rol:2},403]
  ])await t.test(label,async()=>{
    const guard=createSessionGuard({findUser:async()=>user,verify:token=>jwt.verify(token,secret)});
    const req={headers:{authorization:'Bearer '+jwt.sign(claims,secret,{expiresIn:'1h'})},allowedRoles:[1]},res=response();let next=false;
    await guard(req,res,()=>{next=true;});assert.equal(res.code,status);assert.equal(next,status===200);
  });
  const res=response();await createSessionGuard({findUser:async()=>{throw new Error('private database details');}})({headers:{authorization:'Bearer bad'}},res,()=>assert.fail());assert.ok([401,503].includes(res.code));assert.doesNotMatch(JSON.stringify(res.body),/private/);
});
test('account allowlist rejects privileged roles, hidden fields and invalid identities',()=>{
  const valid={nombre:'Ana',apellido:'Prueba',correo:' ANA@example.test ',cedula:'00123',password:'test-password-long',rol_id:2};
  assert.equal(v.account(valid,true).correo,'ana@example.test');
  assert.equal(v.account(valid,true).cedula,'00123');
  for(const input of [{...valid,rol_id:1},{...valid,password:'short'},{...valid,correo:'invalid'},{...valid,cedula:''},{...valid,hash:'secret'}])assert.throws(()=>v.account(input,true));
  assert.throws(()=>v.account({password:'overwrite'}));assert.throws(()=>v.account({}));
});
test('new accounts are hashed and existing password is not accepted by updates',async()=>{
  let saved;
  const service=createService({createUser:async(actor,data)=>{saved={actor,data};return {id:10};}});
  await service.createUser(1,{nombre:'Ana',apellido:'Test',correo:'a@example.test',cedula:'009',password:'a-long-test-password',rol_id:2});
  assert.match(saved.data.password,/^\$2[aby]\$/);assert.notEqual(saved.data.password,'a-long-test-password');
  assert.throws(()=>service.updateUser(1,10,{password:'not-allowed'}));
});
test('filters validate dates, ranges, page and input lengths',()=>{
  for(const f of [{desde:'2026-02-30'},{desde:'2026-11-20',hasta:'2026-11-01'},{page:0},{buscar:'x'.repeat(121)}])assert.throws(()=>v.filters(f));
  assert.equal(v.filters({limit:999}).limit,100);
});
test('clinical categories and state skips are rejected',()=>{
  const s=createService({});
  assert.throws(()=>s.caseInput({tipo:'SOLICITUD',categoria:'MEDICAMENTOS',asunto:'a',contenido:'b'}));
  assert.doesNotThrow(()=>v.transition('ABIERTA','EN_ATENCION'));
  assert.throws(()=>v.transition('ABIERTA','RESUELTA'));
  assert.throws(()=>v.transition('CERRADA','ABIERTA'));
  assert.throws(()=>s.setting('JWT_SECRET',{value:'x'}));
});
test('CSV neutralizes formulas, quotes fields; PDF is paginated and has valid byte offsets',()=>{
  assert.equal(out.cell('  =IMPORTXML("x")'),'"\'  =IMPORTXML(""x"")"');
  const report={tipo:'usuarios',generadoEn:'2026-11-12',filas:Array.from({length:80},(_,i)=>({id:i,nombre:'Prueba (usuario) \\ test',correo:'a@example.test'})),filtros:{}};
  const csv=out.csv(report);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"id","nombre","correo"/);
  const pdf=out.pdf(report).toString();assert.ok(pdf.startsWith('%PDF-1.4'));assert.match(pdf,/\/Count [2-9]/);
  const start=Number(/startxref\n(\d+)/.exec(pdf)[1]);assert.equal(pdf.slice(start,start+4),'xref');
});
test('repository scopes client cases and notifications, and binds SQL injection payloads',async()=>{
  const calls=[];const prisma={$queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return sql.startsWith('SELECT c.id,c.cliente_id FROM administrative_cases')?[{id:5,cliente_id:44}]:[];},$transaction:fn=>fn(prisma)};
  const repo=createRepository(prisma);const payload="' OR TRUE --";
  await repo.cases(44,false,v.filters({buscar:payload}));
  assert.match(calls[0].sql,/c\.cliente_id=\$1/);assert.ok(calls[0].args.includes(payload));assert.ok(!calls[0].sql.includes(payload));
  await assert.rejects(repo.caseDetail(44,false,5),e=>e.status===404);
  await repo.readNotification(44,5);assert.match(calls.at(-1).sql,/destinatario_id=\$2/);assert.deepEqual(calls.at(-1).args,[5,44]);
  await repo.markRead(44,false,5,7);const read=calls.findLast(c=>c.sql.startsWith('UPDATE administrative_messages'));assert.match(read.sql,/c\.cliente_id=\$1/);assert.deepEqual(read.args,[44,5,7,1]);
});
test('account writes and audit share one transaction; passwords never enter audit fields',async()=>{
  const calls=[];const db={$queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return sql.startsWith('INSERT INTO usuarios')?[{id:9,nombre:'Ana'}]:[];}};
  let transactions=0;const repo=createRepository({$transaction:async(fn)=>{transactions++;return fn(db);}});
  await repo.createUser(1,{nombre:'Ana',apellido:'Test',correo:'a@example.test',cedula:'9',rol_id:2,estado:'ACTIVO',password:'hash'});
  assert.equal(transactions,1);const audit=calls.find(c=>c.sql.startsWith('INSERT INTO administrative_audit'));
  assert.equal(audit.args[0],1);assert.ok(!audit.args[4].includes('password'));assert.ok(!audit.args.includes('hash'));
});
test('editing an administrator is rejected before SQL update',async()=>{
  const calls=[];const db={$queryRawUnsafe:async(sql)=>{calls.push(sql);return sql.startsWith('SELECT id,')?[{id:9,rol_id:1}]:[];}};
  const repo=createRepository({$transaction:fn=>fn(db)});
  await assert.rejects(repo.updateUser(1,9,{estado:'INACTIVO'}),e=>e.status===403);assert.ok(!calls.some(s=>s.startsWith('UPDATE usuarios')));
});
test('missing schema and internal errors return sanitized responses',async()=>{
  for(const [error,code] of [[{code:'P2010',meta:{code:'42P01'}},503],[{code:'P2002'},409],[new Error('private-url'),500]]){
    const c=createController({repo:{dashboard:async()=>{throw error;}}});const res=response();await c.dashboard({usuario:{id:1}},res);assert.equal(res.code,code);assert.doesNotMatch(JSON.stringify(res.body),/private-url/);
  }
});
test('write rate limit is isolated by account and expires',()=>{
  let clock=0;const limit=createLimiter({max:1,windowMs:10,now:()=>clock});let count=0;
  const req={method:'POST',usuario:{id:1}};limit(req,response(),()=>count++);const res=response();limit(req,res,()=>count++);assert.equal(res.code,429);
  limit({...req,usuario:{id:2}},response(),()=>count++);clock=11;limit(req,response(),()=>count++);assert.equal(count,3);
});
test('HTTP role matrix denies client admin operations and pharmacy administrative access',async()=>{
  const users={1:{id:1,rol_id:1,estado:'ACTIVO'},2:{id:2,rol_id:2,estado:'ACTIVO'},3:{id:3,rol_id:3,estado:'ACTIVO'}};
  const guard=createSessionGuard({findUser:async id=>users[id],verify:token=>jwt.verify(token,secret)});
  const guards=(...roles)=>[(req,res,next)=>{req.allowedRoles=roles;next();},guard];
  const controller=new Proxy({},{get:(_,name)=>(req,res)=>res.json({ok:true,handler:name})});
  const app=express();app.use(express.json());app.use('/api/administrativo',createRouter({controller,guards}));
  const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const origin=`http://127.0.0.1:${server.address().port}/api/administrativo`;
    for(const [path,role,method,expected] of [['/usuarios',1,'GET',200],['/usuarios',2,'GET',403],['/atenciones',2,'POST',200],['/atenciones',1,'POST',403],['/atenciones',3,'GET',403],['/notificaciones/1/leida',2,'PATCH',200],['/auditoria',2,'GET',403],['/configuracion/general',2,'PUT',403],['/password',2,'POST',403]]){
      const r=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+jwt.sign({id:role,rol:role},secret,{expiresIn:'1h'})}});assert.equal(r.status,expected,`${method} ${path} role ${role}`);
    }
    assert.equal((await fetch(origin+'/usuarios')).status,401);
  }finally{await new Promise(r=>server.close(r));}
});

test('realtime namespace emits invalidations without personal data and disconnects expired sessions',async()=>{
  const {attachAdministrativeSocket}=require('../src/sockets/administrative.socket');
  const handlers={},emitted=[],rooms=[],joined=[];let middleware,callback,disconnected=false;
  const namespace={use(fn){middleware=fn;},on(name,fn){handlers[name]=fn;},to(room){rooms.push(room);return this;},emit(...args){emitted.push(args);}};
  attachAdministrativeSocket({of:name=>{assert.equal(name,'/administrativo');return namespace;}},{set:(key,value)=>{assert.equal(key,'administrativeEvents');callback=value;}},{guard:(req,res,next)=>{assert.deepEqual(req.allowedRoles,[1,2]);req.usuario={id:42,rol_id:2};next();}});
  const socketEvents={};
  const socket={handshake:{auth:{token:jwt.sign({id:42,rol:2},secret,{expiresIn:-1})}},data:{},join:room=>joined.push(room),on:(name,fn)=>{socketEvents[name]=fn;},disconnect(){disconnected=true;socketEvents.disconnect?.();}};
  await new Promise((resolve,reject)=>middleware(socket,e=>e?reject(e):resolve()));
  handlers.connection(socket);callback({caso_id:7,cliente_id:42});assert.deepEqual(emitted,[['administrativo:actualizado',{caso_id:7}]]);
  assert.deepEqual(rooms,['administrativo:staff','administrativo:cliente:42','administrativo:visitante:7']);assert.deepEqual(joined,['administrativo:cliente:42']);
  await new Promise(r=>setTimeout(r,10));assert.equal(disconnected,true);
});

test('dashboard includes pending historical conversations in request totals',async()=>{
  const calls=[];
  const repo=createRepository({$queryRawUnsafe:async(sql)=>{calls.push(sql);return [{}];}});
  await repo.dashboard(1);
  const sql=calls.find(sql=>sql.includes('FROM administrative_cases'));
  assert.match(sql,/ABIERTA.*EN_ATENCION/);
  assert.doesNotMatch(sql,/tipo=/);
});
test('patient filters accept known authorization states and reject unknown ones',()=>{
  const {validarPaginacion}=require('../src/validators/pacientes-autorizados.validator');
  assert.equal(validarPaginacion({estado:'REVOCADO'}).estado,'REVOCADO');
  assert.throws(()=>validarPaginacion({estado:'ACTIVO'}));
  assert.equal(validarPaginacion({estado:''}).estado,undefined);
});
