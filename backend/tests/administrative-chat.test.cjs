const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRepository}=require('../src/repositories/administrative.repository');
const {createController}=require('../src/controllers/administrative.controller');
const v=require('../src/validators/administrative.validator');
function fixture(existing){
  const calls=[];let caseRow=existing,inserted=0,messages=0;
  const db={$queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});
    if(sql.startsWith('SELECT * FROM administrative_cases'))return caseRow?[caseRow]:[];
    if(sql.startsWith('INSERT INTO administrative_cases')){inserted++;caseRow={id:9,cliente_id:42,estado:'ABIERTA',tipo:args[1]};return [caseRow];}
    if(sql.startsWith('INSERT INTO administrative_messages')){messages++;return [{id:7}];}
    if(sql.startsWith('UPDATE administrative_cases')){caseRow={...caseRow,estado:'ABIERTA',cerrada_at:null,resuelta_at:null};return [caseRow];}
    return [];
  }};
  const adapter={...db,$transaction:async(fn,options)=>{calls.push({isolation:options.isolationLevel});return fn(db);}};
  return {repo:createRepository(adapter),calls,get inserted(){return inserted;},get messages(){return messages;}};
}
test('human-attention retries and the legacy POST reuse one conversation without duplicating the first message',async()=>{
  const f=fixture();
  const first=await f.repo.ensureConversation(42);const second=await f.repo.ensureConversation(42);
  assert.equal(first.creada,true);assert.equal(second.creada,false);assert.equal(first.caso.id,second.caso.id);assert.equal(f.inserted,1);
  await f.repo.createCase(42,{tipo:'CONVERSACION',categoria:'SOPORTE',asunto:'Retry',contenido:'Retry content'});
  assert.equal(f.inserted,1);assert.equal(f.messages,0);
  const lock=f.calls.findIndex(c=>c.sql?.includes('pg_advisory_xact_lock'));
  const lookup=f.calls.findIndex(c=>c.sql?.startsWith('SELECT * FROM administrative_cases'));
  assert.ok(lock<lookup);assert.ok(f.calls.filter(c=>c.isolation).every(c=>c.isolation==='ReadCommitted'));
  assert.deepEqual(f.calls[lock].args,[42]);
});
test('closed historical threads reopen in place and never delete stored messages',async()=>{
  const f=fixture({id:17,cliente_id:42,tipo:'SOLICITUD',estado:'CERRADA'});
  const result=await f.repo.ensureConversation(42);
  assert.equal(result.caso.id,17);assert.equal(result.caso.estado,'ABIERTA');assert.equal(result.creada,false);
  assert.equal(f.inserted,0);assert.ok(!f.calls.some(c=>/DELETE|TRUNCATE|ALTER|CREATE TABLE/.test(c.sql||'')));
  assert.ok(f.calls.some(c=>c.args?.includes('CONVERSACION_REABIERTA')));
});
test('reopening checks ownership in the locked query and returns 404 for an unrelated client',async()=>{
  const calls=[];const db={$queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return [];}};
  const repo=createRepository({$transaction:fn=>fn(db)});
  await assert.rejects(repo.reopenConversation(99,false,17),e=>e.status===404);
  assert.match(calls[0].sql,/c\.cliente_id=\$1/);assert.deepEqual(calls[0].args,[99,17]);assert.match(calls[0].sql,/FOR UPDATE/);
});
test('read updates emit scoped invalidations without exposing internal event metadata in HTTP responses',async()=>{
  let emitted,body;
  const controller=createController({repo:{markRead:async()=>[{id:5,cliente_id:42}]},emit:(req,event)=>{emitted=event;}});
  const res={headersSent:false,json(value){body=value;}};
  await controller.read({usuario:{id:1,rol_id:1},params:{id:'17'},body:{hasta:5}},res);
  assert.deepEqual(emitted,{caso_id:17,cliente_id:42,actor_id:1});assert.deepEqual(body,{ok:true,leidos:1});
});
test('inbox accepts only the pending/attended groups',()=>{
  assert.equal(v.filters({bandeja:'PENDIENTES'}).bandeja,'PENDIENTES');
  assert.equal(v.filters({bandeja:'ATENDIDAS'}).bandeja,'ATENDIDAS');
  assert.throws(()=>v.filters({bandeja:'clinical'}));
});
test('message validation rejects identity spoofing, empty content, control characters and invalid retry keys',()=>{
  const key='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  assert.deepEqual(v.message({contenido:' Hola ',idempotency_key:key},true),{contenido:'Hola',key});
  for(const body of [{contenido:'x',idempotency_key:key,cliente_id:99},{contenido:' '},{contenido:'x'.repeat(2001),idempotency_key:key},{contenido:'\u0000',idempotency_key:key},{contenido:'x',idempotency_key:'bad'},{contenido:'x'}])assert.throws(()=>v.message(body,true));
});
test('an idempotent receipt suppresses a duplicate realtime event',async()=>{
  let emitted=0,body;
  const controller=createController({repo:{receiveVitalix:async()=>({caso:{id:1,cliente_id:42},mensaje:{id:5,repetido:true}})},emit:()=>emitted++});
  await controller.vitalixMessage({usuario:{id:42,rol_id:2},body:{contenido:'hola',idempotency_key:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'}},{headersSent:false,json(v){body=v;}});
  assert.equal(emitted,0);assert.equal(body.mensaje.id,5);
});
