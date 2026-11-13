const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDirectoryService,unifiedRows}=require('../src/services/administrative-directory.service');
const {createDirectoryRepository}=require('../src/repositories/administrative-directory.repository');
const {createController}=require('../src/controllers/administrative.controller');
const {csv,pdf}=require('../src/services/administrative-export.service');
const accounts=[{id:1,nombre:'Admin',apellido:'Local',correo:'admin@example.test',cedula:'A1',tipo_documento:'CC',rol_id:1,estado:'ACTIVO',created_at:'2026-11-01T12:00:00Z'},{id:2,nombre:'Cuenta',apellido:'Local',correo:'client@example.test',cedula:'001',tipo_documento:'CC',rol_id:2,estado:null,created_at:'2026-11-02T12:00:00Z'}];
const affiliates=Array.from({length:50},(_,i)=>({id:String(i+1),nombres:`Persona ${i+1}`,apellidos:'EPS',documento:`D${String(i+1).padStart(3,'0')}`,tipo_documento:'CC',correo:`eps${i+1}@example.test`,estado:i%2?'Inactivo':'Activo',eps_id:'1'}));
const service=(local=accounts,eps=affiliates)=>createDirectoryService({local:{read:async()=>local},source:{leer:async()=>({afiliados:eps})}});
test('one paginated directory contains every EPS record and local account with stable source keys',async()=>{
  const before=JSON.stringify({accounts,affiliates}),dir=service(),all=[];
  for(let page=1;page<=3;page++){const r=await dir.list({page,limit:20});all.push(...r.usuarios);assert.equal(r.total,52);assert.equal(r.resumen.afiliados_eps,50);}
  assert.equal(new Set(all.map(r=>r.clave)).size,52);assert.equal(all.filter(r=>r.origen==='EPS').length,50);
  assert.ok(all.filter(r=>r.origen==='EPS').every(r=>r.id===null&&r.rol_id===null&&r.estado_cuenta==='SIN_CUENTA'&&!r.acciones.editar));
  assert.equal(JSON.stringify({accounts,affiliates}),before);
  const detail=await dir.detail('EPS:1');assert.equal(detail.afiliados_eps[0].documento,affiliates[0].documento);assert.ok(!('password' in detail));
});
test('document and type deduplicate matching identities while keeping both original projections',()=>{
  const eps=[{...affiliates[0],nombres:'Nombre original EPS',documento:'001',tipo_documento:'CC',correo:'different@example.test'}];
  const {rows,resumen}=unifiedRows(accounts,eps);assert.equal(rows.length,2);assert.equal(resumen.coincidencias,1);
  const match=rows.find(r=>r.id===2);assert.equal(match.origen,'SaludClick y EPS');assert.equal(match.nombre,'Cuenta');assert.equal(match.afiliados_eps[0].nombres,'Nombre original EPS');assert.equal(match.estado_cuenta,'SIN_ESTADO');assert.equal(resumen.cuentas_activas,1);
});
test('EPS reports retain original names and emails even when the account has different data',async()=>{
  const original={...affiliates[0],nombres:'Nombre original',apellidos:'EPS original',documento:'001',correo:'original@example.test'};
  const r=await service(accounts,[original]).report('afiliados',{});
  assert.equal(r.filas.length,1);assert.equal(r.filas[0].nombre,original.nombres);assert.equal(r.filas[0].correo,original.correo);assert.equal(r.resumen.coincidencias,1);
});
test('leading zeroes, incompatible types, same email and ambiguous documents never cause an unsafe merge',()=>{
  for(const eps of [{...affiliates[0],documento:'1'},{...affiliates[0],documento:'001',tipo_documento:'TI'},{...affiliates[0],correo:accounts[1].correo}])assert.equal(unifiedRows(accounts,[eps]).resumen.coincidencias,0);
  const ambiguous=[...accounts,{...accounts[1],id:3,cedula:' 001 '}];
  const result=unifiedRows(ambiguous,[{...affiliates[0],documento:'001'}]);assert.equal(result.resumen.coincidencias,0);assert.equal(result.resumen.revision_identidad,1);
});
test('search, source, account role, affiliation state and register-type filters are independent',async()=>{
  const dir=service();
  assert.equal((await dir.list({origen:'EPS'})).total,50);assert.equal((await dir.list({origen:'SALUDCLICK'})).total,2);
  assert.equal((await dir.list({buscar:'eps50@example.test'})).total,1);assert.equal((await dir.list({buscar:'Persona 50'})).total,1);assert.equal((await dir.list({buscar:'D050'})).total,1);
  assert.equal((await dir.list({estado:'ACTIVO'})).total,1);assert.equal((await dir.list({estado:'SIN_CUENTA'})).total,50);
  assert.equal((await dir.list({rol_id:2})).total,1);assert.equal((await dir.list({estado_afiliacion:'Activo'})).total,25);
  assert.equal((await dir.list({tipo_registro:'VINCULADOS'})).total,0);assert.equal((await dir.list({tipo_registro:'CUENTAS'})).total,2);
  await assert.rejects(dir.list({origen:'invented'}));await assert.rejects(dir.list({rol_id:99}));await assert.rejects(dir.detail('SALUDCLICK:0'));
});
test('reports and dashboard summaries distinguish accounts and affiliates and never invent EPS dates',async()=>{
  const dir=service();const r=await dir.report('usuarios',{});assert.equal(r.resumen.total,52);assert.equal(r.resumen.cuentas_acceso,2);assert.equal(r.resumen.afiliados_eps,50);
  assert.equal((await dir.report('afiliados',{})).filas.length,50);
  const dated=await dir.report('afiliados',{desde:'2020-01-01',hasta:'2030-12-31'});assert.equal(dated.filas.length,0);assert.equal(dated.resumen.sin_fecha_excluidos,50);assert.ok(dated.aviso);
  assert.ok(csv(dated).includes('tipo_registro'));assert.ok(pdf(r).toString().startsWith('%PDF'));
  const origins=await dir.report('origenes',{});assert.equal(origins.resumen.total,52);assert.equal(origins.filas.at(-1).total,52);
});
test('an unavailable EPS source fails explicitly instead of returning fictional zeros',async()=>{
  const dir=createDirectoryService({local:{read:async()=>accounts},source:{leer:async()=>{throw new Error('private connection URL');}}});
  await assert.rejects(dir.list({}),e=>e.status===503&&!e.message.includes('private'));
});
test('local read repository uses a read-only transaction and never reads credentials or performs writes',async()=>{
  const calls=[];const dir=createDirectoryRepository({$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'RepeatableRead');return fn({$executeRawUnsafe:async sql=>calls.push(sql),$queryRawUnsafe:async sql=>{calls.push(sql);return accounts;}});}});
  assert.equal((await dir.read()).length,2);assert.equal(calls[0],'SET TRANSACTION READ ONLY');assert.match(calls[1],/^SELECT /);assert.doesNotMatch(calls[1],/password|INSERT|UPDATE|DELETE/);
});
test('controller uses the unified directory for list/detail/dashboard/reports and preserves local compatibility reads',async()=>{
  let localReads=0;const repo={dashboard:async()=>({usuarios:{total:2},solicitudes:{}}),users:async()=>{localReads++;return {usuarios:accounts,total:2};}};
  const controller=createController({repo,directory:service()});
  const req={usuario:{id:1,rol_id:1},query:{},params:{}};
  function response(){return {headersSent:false,status(){return this;},json(v){this.body=v;}};}
  const res=response();await controller.users(req,res);assert.equal(res.body.total,52);assert.equal(localReads,0);
  const dash=response();await controller.dashboard(req,dash);assert.equal(dash.body.estadisticas.directorio.afiliados_eps,50);
  const old=response();await controller.localUsers(req,old);assert.equal(old.body.total,2);assert.equal(localReads,1);
});
