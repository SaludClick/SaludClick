// Requires a pre-provisioned, isolated local PostgreSQL test database.
// This suite never loads .env, runs migrations or connects to DATABASE_URL.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {Pool}=require('pg');
const express=require('express');
const http=require('node:http');
const jwt=require('jsonwebtoken');
const {Server}=require('socket.io');
const {getTestDatabaseUrl}=require('./support/postgres-test-safety.cjs');
const {createRepository}=require('../src/repositories/administrative.repository');
const {createController}=require('../src/controllers/administrative.controller');
const {createRouter}=require('../src/routes/administrative.routes');
const {createSessionGuard}=require('../src/middlewares/administrative-session.middleware');
const {attachAdministrativeSocket}=require('../src/sockets/administrative.socket');
const {connectAdministrativeSocket}=require('./support/administrative-socket-client.cjs');

test('administrative chat: isolated PostgreSQL persistence, concurrency, HTTP ownership and real Socket.IO',{timeout:150000},async t=>{
  const pool=new Pool({connectionString:getTestDatabaseUrl(),max:10,connectionTimeoutMillis:5000});
  let server,io;const sockets=[];
  t.after(async()=>{for(const s of sockets)s.close();if(io)await new Promise(resolve=>io.close(resolve));if(server?.listening)await new Promise(resolve=>server.close(resolve));await pool.end();});
  const identity=(await pool.query('SELECT current_database() AS name,current_schema() AS schema')).rows[0];
  assert.deepEqual(identity,{name:'saludclick_test',schema:'public'});
  const required=['usuarios','roles','administrative_cases','administrative_messages','administrative_audit','administrative_notifications','administrative_preferences'];
  const tables=(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[required])).rows.map(r=>r.table_name);
  assert.ok(required.every(table=>tables.includes(table)),'Existing administrative test schema required; this suite will not migrate it.');
  const suffix=randomUUID().slice(0,8),secret=randomUUID();
  await pool.query("INSERT INTO roles(id,nombre) VALUES(1,'admin'),(2,'usuario'),(3,'farmacia'),(4,'EPS') ON CONFLICT(id) DO NOTHING");
  async function user(role,label){return (await pool.query("INSERT INTO usuarios(nombre,apellido,correo,cedula,password,rol_id,estado) VALUES($1,'Chat fixture',$2,$3,$4,$5,'ACTIVO') RETURNING id,rol_id",[label,`${label}.${suffix}@example.test`,`${label}${suffix}`,'$2b$12$'+'.'.repeat(53),role])).rows[0];}
  const admin=await user(1,'admin'),client=await user(2,'client'),outsider=await user(2,'outsider'),pharmacy=await user(3,'pharmacy'),eps=await user(4,'eps');
  const db={$queryRawUnsafe:async(sql,...args)=>(await pool.query(sql,args)).rows,$transaction:async(fn,options)=>{
    const connection=await pool.connect();
    try{await connection.query(options.isolationLevel==='ReadCommitted'?'BEGIN ISOLATION LEVEL READ COMMITTED':'BEGIN ISOLATION LEVEL SERIALIZABLE');const value=await fn({$queryRawUnsafe:async(sql,...args)=>(await connection.query(sql,args)).rows});await connection.query('COMMIT');return value;}
    catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
  }};
  let repo=createRepository(db);
  const guard=createSessionGuard({verify:token=>jwt.verify(token,secret),findUser:async id=>(await pool.query('SELECT u.id,u.rol_id,u.estado,p.sesiones_revocadas_at FROM usuarios u LEFT JOIN administrative_preferences p ON p.usuario_id=u.id WHERE u.id=$1',[id])).rows[0]});
  const guards=(...roles)=>[(req,res,next)=>{req.allowedRoles=roles;next();},guard];
  const app=express();app.use(express.json());
  // Delegate through a replaceable repository to verify recovery after recreation.
  const dynamicRepo=new Proxy({},{get:(_,key)=>(...args)=>repo[key](...args)});
  app.use('/api/administrativo',createRouter({controller:createController({repo:dynamicRepo,emit:(req,event)=>app.get('administrativeEvents')(event)}),guards}));
  app.use(express.static(path.resolve(__dirname,'../../frontend/dist')));
  server=http.createServer(app);io=new Server(server);attachAdministrativeSocket(io,app,{guard,visitorLookup:hash=>repo.visitorCaseId(hash)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const token=user=>jwt.sign({id:user.id,rol:user.rol_id},secret,{expiresIn:'10m'});
  const auth=new Map([admin,client,outsider,pharmacy,eps].map(user=>[user.id,token(user)]));
  async function request(path,user,{method='GET',body,status=200}={}){
    const res=await fetch(origin+'/api/administrativo'+path,{method,headers:{Authorization:'Bearer '+auth.get(user.id),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const data=await res.json();assert.equal(res.status,status,`${method} ${path}`);return data;
  }
  const adminSocket=await connectAdministrativeSocket(origin,auth.get(admin.id));sockets.push(adminSocket);
  const ownerSocket=await connectAdministrativeSocket(origin,auth.get(client.id));sockets.push(ownerSocket);
  const outsiderSocket=await connectAdministrativeSocket(origin,auth.get(outsider.id));sockets.push(outsiderSocket);
  await assert.rejects(connectAdministrativeSocket(origin,auth.get(pharmacy.id)),/denied/);
  await assert.rejects(connectAdministrativeSocket(origin,auth.get(eps.id)),/denied/);
  let conversation;
  await t.test('parallel human-attention requests recover one row and notify only authorized rooms',async()=>{
    const responses=await Promise.all(Array.from({length:8},()=>fetch(origin+'/api/administrativo/conversacion',{method:'POST',headers:{Authorization:'Bearer '+auth.get(client.id),'Content-Type':'application/json'},body:'{}'})));
    assert.equal(responses.filter(r=>r.status===201).length,1);assert.ok(responses.every(r=>[200,201].includes(r.status)));
    const payloads=await Promise.all(responses.map(r=>r.json()));conversation=payloads[0].caso;
    assert.equal(new Set(payloads.map(r=>r.caso.id)).size,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_cases WHERE cliente_id=$1',[client.id])).rows[0].n,1);
    await adminSocket.until(e=>e[0]==='administrativo:actualizado'&&e[1].caso_id===conversation.id);
    await ownerSocket.until(e=>e[1]?.caso_id===conversation.id);
    await new Promise(resolve=>setTimeout(resolve,100));assert.equal(outsiderSocket.events.length,0);
    assert.ok(!JSON.stringify(adminSocket.events).includes('contenido'));
  });
  await t.test('messages persist chronologically with authors, notifications and read markers',async()=>{
    await request(`/atenciones/${conversation.id}/mensajes`,client,{method:'POST',body:{contenido:'Necesito atención humana.'}});
    const inbox=await request('/atenciones?bandeja=PENDIENTES&buscar='+encodeURIComponent('client'),admin);
    assert.ok(inbox.casos.some(c=>c.id===conversation.id&&c.pendientes===1));
    await request(`/atenciones/${conversation.id}/mensajes`,admin,{method:'POST',body:{contenido:'Te atendemos desde Administración.'}});
    const detail=await request('/atenciones/'+conversation.id,client);
    assert.deepEqual(detail.mensajes.map(m=>m.contenido),['Necesito atención humana.','Te atendemos desde Administración.']);
    assert.deepEqual(detail.mensajes.map(m=>m.remitente_id),[client.id,admin.id]);
    assert.ok(detail.mensajes.every(m=>m.created_at&&m.nombre));assert.equal(detail.caso.estado,'EN_ATENCION');
    assert.equal(detail.caso.responsable_id,admin.id);
    await request(`/atenciones/${conversation.id}/leido`,client,{method:'POST',body:{hasta:detail.mensajes.at(-1).id}});
    assert.ok((await request('/atenciones/'+conversation.id,admin)).mensajes.at(-1).leido_at);
    assert.ok((await request('/notificaciones?estado=NO_LEIDA',admin)).sinLeer>0);
    repo=createRepository(db); // No in-memory conversation registry survives.
    assert.equal((await request('/atenciones/'+conversation.id,client)).mensajes.length,2);
  });
  await t.test('client cannot read, send, mark read or reopen another client conversation',async()=>{
    for(const [path,method,body] of [[`/atenciones/${conversation.id}`,'GET'],[`/atenciones/${conversation.id}/mensajes`,'POST',{contenido:'not mine'}],[`/atenciones/${conversation.id}/leido`,'POST',{hasta:999}],[`/atenciones/${conversation.id}/reabrir`,'POST',{}]])await request(path,outsider,{method,body,status:404});
    assert.equal((await request('/atenciones',outsider)).casos.length,0);
    for(const user of [pharmacy,eps])await request('/conversacion',user,{method:'POST',body:{},status:403});
    await request('/conversacion',admin,{method:'POST',body:{},status:403});
    await request('/atenciones/'+conversation.id,client,{method:'PATCH',body:{estado:'CERRADA'},status:403});
  });
  await t.test('closing and reopening retain every message and reuse the same conversation',async()=>{
    await request('/atenciones/'+conversation.id,admin,{method:'PATCH',body:{estado:'CERRADA'}});
    assert.ok((await request('/atenciones?bandeja=ATENDIDAS',admin)).casos.some(c=>c.id===conversation.id));
    await request(`/atenciones/${conversation.id}/mensajes`,client,{method:'POST',body:{contenido:'closed'},status:409});
    const reopened=await request(`/atenciones/${conversation.id}/reabrir`,client,{method:'POST',body:{}});
    assert.equal(reopened.caso.estado,'ABIERTA');assert.equal(reopened.caso.cerrada_at,null);
    await request('/atenciones/'+conversation.id,admin,{method:'PATCH',body:{estado:'CERRADA'}});
    const recovered=await request('/conversacion',client,{method:'POST',body:{}});
    assert.equal(recovered.caso.id,conversation.id);assert.equal(recovered.creada,false);
    assert.equal((await request('/atenciones/'+conversation.id,client)).mensajes.length,2);
  });
  await t.test('legacy history is preserved and older messages load without losing the latest page',async()=>{
    const legacy=(await pool.query("INSERT INTO administrative_cases(cliente_id,tipo,asunto,categoria,estado) VALUES($1,'SOLICITUD','Histórica','CUENTA','CERRADA') RETURNING id",[outsider.id])).rows[0];
    await pool.query("INSERT INTO administrative_messages(caso_id,remitente_id,contenido) SELECT $1,$2,'Histórico '||n FROM generate_series(1,105) n",[legacy.id,outsider.id]);
    const recovered=await request('/conversacion',outsider,{method:'POST',body:{}});assert.equal(recovered.caso.id,legacy.id);
    const latest=await request('/atenciones/'+legacy.id,outsider);assert.equal(latest.mensajes.length,100);assert.ok(latest.hayAnteriores);
    const older=await request(`/atenciones/${legacy.id}?antes=${latest.mensajes[0].id}`,outsider);assert.equal(older.mensajes.length,5);assert.equal(older.hayAnteriores,false);
    const all=[...older.mensajes,...latest.mensajes];assert.equal(new Set(all.map(m=>m.id)).size,105);assert.ok(all.every((m,i)=>i===0||m.id>all[i-1].id));
    const before=(await pool.query('SELECT count(*)::int n FROM administrative_messages WHERE caso_id=$1',[legacy.id])).rows[0].n;
    await request('/atenciones',outsider,{method:'POST',body:{tipo:'CONVERSACION',categoria:'SOPORTE',asunto:'Retry',contenido:'Do not duplicate a new conversation'},status:201});
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_messages WHERE caso_id=$1',[legacy.id])).rows[0].n,before);
  });
  const automatic=await user(2,'vitalix');auth.set(automatic.id,token(automatic));
  const automaticSocket=await connectAdministrativeSocket(origin,auth.get(automatic.id));sockets.push(automaticSocket);
  let automaticCase;
  await t.test('VITALIX sends atomically and concurrent retries produce one message and one notification per administrator',async()=>{
    const key=randomUUID(),body={contenido:'Mensaje automático desde VITALIX',idempotency_key:key};
    const results=await Promise.all(Array.from({length:6},()=>request('/vitalix/mensajes',automatic,{method:'POST',body})));
    automaticCase=results[0].caso;
    assert.equal(new Set(results.map(r=>r.mensaje.id)).size,1);assert.equal(results.filter(r=>!r.mensaje.repetido).length,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_cases WHERE cliente_id=$1',[automatic.id])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_messages WHERE caso_id=$1',[automaticCase.id])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_notifications WHERE caso_id=$1 AND destinatario_id=$2',[automaticCase.id,admin.id])).rows[0].n,1);
    await adminSocket.until(e=>e[1]?.caso_id===automaticCase.id);await automaticSocket.until(e=>e[1]?.caso_id===automaticCase.id);
    repo=createRepository(db);const replay=await request('/vitalix/mensajes',automatic,{method:'POST',body});assert.equal(replay.mensaje.repetido,true);
    await request('/vitalix/mensajes',automatic,{method:'POST',body:{...body,contenido:'Different payload'},status:409});
    await request('/vitalix/mensajes',automatic,{method:'POST',body:{...body,idempotency_key:randomUUID(),cliente_id:outsider.id},status:400});
    for(const other of [admin,pharmacy,eps])await request('/vitalix/mensajes',other,{method:'POST',body,status:403});
    assert.ok(!outsiderSocket.events.some(e=>e[1]?.caso_id===automaticCase.id));
    // A deliberately new send, even with the same text, is a different message.
    await request('/vitalix/mensajes',automatic,{method:'POST',body:{...body,idempotency_key:randomUUID()}});
    const two=await request('/conversacion',automatic);assert.equal(two.mensajes.length,2);
    await request(`/atenciones/${automaticCase.id}/leido`,admin,{method:'POST',body:{hasta:two.mensajes[0].id}});
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_notifications WHERE caso_id=$1 AND destinatario_id=$2 AND leida_at IS NULL',[automaticCase.id,admin.id])).rows[0].n,2,'Older transcript must not clear a newer notification');
    const adminKey=randomUUID(),reply={contenido:'Respuesta administrativa persistente',idempotency_key:adminKey};
    const a=await request(`/atenciones/${automaticCase.id}/mensajes`,admin,{method:'POST',body:reply});
    const b=await request(`/atenciones/${automaticCase.id}/mensajes`,admin,{method:'POST',body:reply});assert.equal(a.mensaje.id,b.mensaje.id);
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_notifications WHERE caso_id=$1 AND destinatario_id=$2',[automaticCase.id,admin.id])).rows[0].n,2);
    const detail=await request('/conversacion',automatic);assert.equal(detail.mensajes.length,3);
    await request(`/atenciones/${automaticCase.id}/leido`,admin,{method:'POST',body:{hasta:detail.mensajes.at(-1).id}});
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_notifications WHERE caso_id=$1 AND destinatario_id=$2 AND leida_at IS NULL',[automaticCase.id,admin.id])).rows[0].n,0);
  });
  await t.test('anonymous capability is isolated, durable and cannot become a registered session',async()=>{
    const {randomBytes}=require('node:crypto');
    const credential=randomBytes(32).toString('hex'),other=randomBytes(32).toString('hex');
    async function guest(path,token=credential,body,status=200){
      const response=await fetch(origin+'/api/administrativo'+path,{method:body?'POST':'GET',headers:{Authorization:'Vitalix '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
    }
    const accounts=(await pool.query('SELECT count(*)::int n FROM usuarios')).rows[0].n;
    await guest('/visitante/conversacion','invalid',undefined,401);
    await guest('/visitante/mensajes',credential,{contenido:'Sin clave de reintento'},400);
    assert.equal((await guest('/visitante/conversacion')).caso,null);
    const body={contenido:'Solicito una cuenta como visitante',idempotency_key:randomUUID()};
    const sends=await Promise.all(Array.from({length:6},()=>guest('/visitante/mensajes',credential,body)));
    const c=sends[0].caso;
    assert.equal((await guest('/visitante/conversacion',require('../src/middlewares/administrative-visitor.middleware').visitorHash(credential))).caso,null);
    assert.equal(c.cliente_id,null);assert.equal(c.visitante_hash,undefined);
    assert.equal(new Set(sends.map(s=>s.mensaje.id)).size,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,accounts);
    assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_notifications WHERE caso_id=$1 AND destinatario_id=$2',[c.id,admin.id])).rows[0].n,1);
    assert.equal((await guest('/visitante/conversacion',other)).caso,null);
    await guest('/atenciones/'+c.id,credential,undefined,401);
    await guest('/usuarios',credential,undefined,401);
    await guest('/visitante/mensajes',credential,{...body,cliente_id:client.id},400);
    await guest('/visitante/mensajes',credential,{...body,contenido:'Changed'},409);
    repo=createRepository(db);
    assert.equal((await guest('/visitante/conversacion')).mensajes.length,1);
    const gs=await connectAdministrativeSocket(origin,{visitorToken:credential});sockets.push(gs);
    await assert.rejects(connectAdministrativeSocket(origin,{visitorToken:other}),/denied/);
    await request(`/atenciones/${c.id}/mensajes`,admin,{method:'POST',body:{contenido:'Respuesta para visitante',idempotency_key:randomUUID()}});
    await gs.until(e=>e[1]?.caso_id===c.id);
    const detail=await guest('/visitante/conversacion');assert.equal(detail.mensajes.length,2);
    assert.ok(detail.mensajes.every(m=>m.created_at&&m.nombre));
    await request(`/atenciones/${c.id}/leido`,admin,{method:'POST',body:{hasta:detail.mensajes.at(-1).id}});
    assert.ok((await guest('/visitante/conversacion')).mensajes[0].leido_at);
    assert.ok((await request('/atenciones',admin)).casos.some(row=>row.id===c.id));
    await pool.query("UPDATE administrative_cases SET visitante_expira_at=now()-interval '1 second' WHERE id=$1",[c.id]);
    assert.equal((await guest('/visitante/conversacion')).caso,null);
    await guest('/visitante/mensajes',credential,{...body,idempotency_key:randomUUID()},410);
    await assert.rejects(connectAdministrativeSocket(origin,{visitorToken:credential}),/denied/);
  });
  if(process.env.ADMIN_CHAT_BROWSER==='1')await t.test('anonymous visitor and authenticated administrator converse in two real browsers without mail or JWT',async()=>{
    const admin=await user(1,'guestadmin');auth.set(admin.id,token(admin));
    const {abrirEdge}=require('./support/afiliados-edge.cjs');
    const visitorBrowser=await abrirEdge();let staffBrowser;
    const accounts=(await pool.query('SELECT count(*)::int n FROM usuarios')).rows[0].n;
    try{
      staffBrowser=await abrirEdge();
      await staffBrowser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(auth.get(admin.id))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:${admin.id},rol:1,nombre:'Admin sintetico'}));`});
      await request('/notificaciones/leidas',admin,{method:'PATCH',body:{}});
      await staffBrowser.send('Page.navigate',{url:origin+'/pages/admin.html#notificaciones'});
      await staffBrowser.until(()=>staffBrowser.evaluate(`!!document.querySelector('#readAllNotifications')`));
      await visitorBrowser.send('Page.navigate',{url:origin+'/index.html'});
      await visitorBrowser.until(()=>visitorBrowser.evaluate(`!!document.querySelector('.vitalix-launcher')`));
      await visitorBrowser.evaluate(`document.querySelector('.vitalix-launcher').click()`);
      await visitorBrowser.until(()=>visitorBrowser.evaluate(`document.querySelector('.vitalix-composer input')?.disabled===false`));
      assert.equal(await visitorBrowser.evaluate(`localStorage.getItem('saludclick_token')||sessionStorage.getItem('saludclick_token')`),null);
      assert.equal(await visitorBrowser.evaluate(`[...document.querySelectorAll('a')].some(a=>a.href.startsWith('mailto:'))`),false);
      async function type(text){
        await visitorBrowser.evaluate(`{const input=document.querySelector('.vitalix-composer input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await visitorBrowser.until(()=>visitorBrowser.evaluate(`!document.querySelector('.vitalix-composer button').disabled`));
      }
      const first='Necesito una cuenta para acceder '+suffix;
      await type(first);
      await visitorBrowser.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
      await visitorBrowser.evaluate(`document.querySelector('.vitalix-composer button').click()`);
      await visitorBrowser.until(()=>visitorBrowser.evaluate(`document.querySelector('.vitalix-note[role=alert]')?.textContent.includes('reintentar')`));
      assert.equal(await visitorBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(first)})`),false);
      assert.equal(await visitorBrowser.evaluate(`document.body.textContent.includes('Mensaje guardado y enviado')`),false);
      await visitorBrowser.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await visitorBrowser.evaluate(`document.querySelector('.vitalix-composer button').click()`);
      await visitorBrowser.until(()=>visitorBrowser.evaluate(`document.body.textContent.includes('Mensaje guardado y enviado')`));
      const visitorToken=await visitorBrowser.evaluate(`JSON.parse(localStorage.getItem('saludclick_vitalix_visitor_v1')).token`);
      const hash=require('../src/middlewares/administrative-visitor.middleware').visitorHash(visitorToken);
      const id=await repo.visitorCaseId(hash);assert.ok(id);
      await staffBrowser.until(()=>staffBrowser.evaluate(`Number(document.querySelector('#adminNotificationCount').textContent)>0&&document.querySelector('#adminNotificationBell').classList.contains('has-unread')`));
      await staffBrowser.until(()=>staffBrowser.evaluate(`!!document.querySelector('a[data-notification-open][href="#solicitudes/${id}"]')`));
      await staffBrowser.evaluate(`document.querySelector('a[data-notification-open][href="#solicitudes/${id}"]').click()`);
      await staffBrowser.until(()=>staffBrowser.evaluate(`document.querySelector('#chatLog')?.textContent.includes(${JSON.stringify(first)})`));
      assert.match(await staffBrowser.evaluate(`document.querySelector('#chatTitle').textContent`),/Visitante/);
      for(const [index,text] of ['Te atendemos desde Administracion','Revisaremos tu solicitud'].entries()){
        await staffBrowser.evaluate(`document.querySelector('#chatReply').value=${JSON.stringify(text)};document.querySelector('#chatComposer').requestSubmit()`);
        await visitorBrowser.until(()=>visitorBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(text)})`));
        const reply='Gracias, continuo en este mismo chat '+index;
        await type(reply);await visitorBrowser.evaluate(`document.querySelector('.vitalix-composer button').click()`);
        await staffBrowser.until(()=>staffBrowser.evaluate(`document.querySelector('#chatLog').textContent.includes(${JSON.stringify(reply)})`));
      }
      await visitorBrowser.until(()=>visitorBrowser.evaluate(`document.querySelector('.vitalix-mode').textContent.includes('En tiempo real')`));
      await visitorBrowser.send('Page.reload');
      await visitorBrowser.until(()=>visitorBrowser.evaluate(`document.querySelector('.vitalix-composer input')?.disabled===false`));
      await visitorBrowser.evaluate(`document.querySelector('.vitalix-launcher').click()`);
      await visitorBrowser.until(()=>visitorBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes('Revisaremos tu solicitud')`));
      await staffBrowser.evaluate(`document.querySelector('#chatClose').click()`);
      await staffBrowser.until(()=>staffBrowser.evaluate(`document.querySelector('#chatReply').disabled`));
      await staffBrowser.evaluate(`document.querySelector('#chatClose').click()`);
      await staffBrowser.until(()=>staffBrowser.evaluate(`!document.querySelector('#chatReply').disabled`));
      const data=await repo.visitorConversation(hash);
      assert.equal(data.mensajes.length,5);assert.equal(new Set(data.mensajes.map(m=>m.id)).size,5);
      assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_cases WHERE visitante_hash=$1',[hash])).rows[0].n,1);
      assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_notifications WHERE caso_id=$1 AND destinatario_id=$2',[id,admin.id])).rows[0].n,3);
      assert.equal((await pool.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,accounts);
      assert.equal(await staffBrowser.evaluate(`document.querySelectorAll('[data-section]').length`),6);
      assert.equal(await visitorBrowser.evaluate(`localStorage.getItem('saludclick_token')||sessionStorage.getItem('saludclick_token')`),null);
      assert.deepEqual(visitorBrowser.errores,[]);assert.deepEqual(staffBrowser.errores,[]);
    }finally{await visitorBrowser.cerrar();await staffBrowser?.cerrar();}
  });
  if(process.env.ADMIN_CHAT_BROWSER==='1')await t.test('real VITALIX composer, administrative bell, Socket.IO reply, reload persistence and API fallback',async()=>{
    const admin=await user(1,'browseradmin');auth.set(admin.id,token(admin));
    const browserUser=await user(2,'browser');auth.set(browserUser.id,token(browserUser));
    let browserCase;
    const {abrirEdge}=require('./support/afiliados-edge.cjs');
    const adminBrowser=await abrirEdge();let clientBrowser;
    try{
      clientBrowser=await abrirEdge();
      async function prepare(browser,user){
        await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(auth.get(user.id))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:${user.id},rol:${user.rol_id},nombre:'Fixture'}));`});
      }
      await prepare(adminBrowser,admin);await prepare(clientBrowser,browserUser);
      await request('/notificaciones/leidas',admin,{method:'PATCH',body:{}});
      await adminBrowser.send('Page.navigate',{url:origin+'/pages/admin.html#notificaciones'});
      await adminBrowser.until(()=>adminBrowser.evaluate(`!!document.querySelector('#readAllNotifications')`));
      await clientBrowser.send('Page.navigate',{url:origin+'/pages/chat.html'});
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-composer input')?.disabled===false`));
      async function clientSend(text){
        await clientBrowser.evaluate(`{const input=document.querySelector('.vitalix-composer input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-composer button').disabled===false`));
        await clientBrowser.evaluate(`document.querySelector('.vitalix-composer button').click()`);
        await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-composer input').value===''&&document.querySelector('.vitalix-composer button').disabled`));
      }
      await clientSend('Olvide mi contrasena');
      await clientBrowser.until(()=>clientBrowser.evaluate(`!document.querySelector('.vitalix-typing')`));
      assert.equal((await request('/conversacion',browserUser)).caso,null);
      assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_cases WHERE cliente_id=$1',[browserUser.id])).rows[0].n,0);
      const message='Quiero hablar con un administrador '+suffix;
      await clientBrowser.evaluate(`{const input=document.querySelector('.vitalix-composer input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(message)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-composer button').disabled===false`));
      await clientBrowser.evaluate(`document.querySelector('.vitalix-composer button').click()`);
      await clientBrowser.until(async()=>{browserCase=(await request('/conversacion',browserUser)).caso;return !!browserCase;});
      await adminBrowser.until(()=>adminBrowser.evaluate(`Number(document.querySelector('#adminNotificationCount').textContent)>0&&document.querySelector('#adminNotificationBell').classList.contains('has-unread')`));
      await adminBrowser.until(()=>adminBrowser.evaluate(`!!document.querySelector('a[data-notification-open][href="#solicitudes/${browserCase.id}"]')`));
      await adminBrowser.evaluate(`document.querySelector('a[data-notification-open][href="#solicitudes/${browserCase.id}"]').click()`);
      await adminBrowser.until(()=>adminBrowser.evaluate(`document.querySelector('#chatLog')?.textContent.includes(${JSON.stringify(message)})`));
      await adminBrowser.until(()=>adminBrowser.evaluate(`Number(document.querySelector('#adminNotificationCount').textContent)===0`));
      assert.equal(await adminBrowser.evaluate(`document.querySelectorAll('[data-section]').length`),6);
      const reply='Respuesta real en VITALIX '+suffix;
      await adminBrowser.evaluate(`document.querySelector('#chatReply').value=${JSON.stringify(reply)};document.querySelector('#chatComposer').requestSubmit();`);
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(reply)})`));
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-mode').textContent.includes('En tiempo real')`));
      assert.match(await adminBrowser.evaluate(`document.querySelector('#chatTitle').textContent`),/browser/);
      for(const [index,text] of ['Necesito revisar mi acceso','Todavia necesito orientacion'].entries()){
        await clientSend(text);
        await adminBrowser.until(()=>adminBrowser.evaluate(`document.querySelector('#chatLog')?.textContent.includes(${JSON.stringify(text)})`));
        if(index===0){
          await adminBrowser.evaluate(`document.querySelector('#chatReply').value='Revisamos tu acceso';document.querySelector('#chatComposer').requestSubmit();`);
          await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes('Revisamos tu acceso')`));
        }
      }
      await adminBrowser.evaluate(`document.querySelector('#chatReply').value='Segundo mensaje consecutivo';document.querySelector('#chatComposer').requestSubmit();`);
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes('Segundo mensaje consecutivo')`));
      await adminBrowser.evaluate(`document.querySelector('#chatReply').value='Confirmacion adicional sin respuesta del usuario';document.querySelector('#chatComposer').requestSubmit();`);
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes('Confirmacion adicional sin respuesta del usuario')`));
      await adminBrowser.evaluate(`document.querySelector('#chatClose').click()`);
      await adminBrowser.until(()=>adminBrowser.evaluate(`document.querySelector('#chatReply').disabled`));
      await adminBrowser.evaluate(`document.querySelector('#chatClose').click()`);
      await adminBrowser.until(()=>adminBrowser.evaluate(`document.querySelector('#chatReply').disabled===false`));
      await adminBrowser.send('Page.reload');
      await adminBrowser.until(()=>adminBrowser.evaluate(`document.querySelector('#chatLog')?.textContent.includes('Segundo mensaje consecutivo')`));
      await clientBrowser.send('Page.reload');await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-transcript')?.textContent.includes(${JSON.stringify(reply)})`));
      assert.equal((await request('/conversacion',browserUser)).mensajes.length,7);
      assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_cases WHERE cliente_id=$1',[browserUser.id])).rows[0].n,1);
      await clientBrowser.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
      const reconnect='Recuperado tras reconexión segura '+suffix;
      await request(`/atenciones/${browserCase.id}/mensajes`,admin,{method:'POST',body:{contenido:reconnect,idempotency_key:randomUUID()}});
      await clientBrowser.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(reconnect)})`));
      io.of('/administrativo').in('administrativo:cliente:'+browserUser.id).disconnectSockets(true);
      const fallback='Sincronización por API sin socket '+suffix;
      await request(`/atenciones/${browserCase.id}/mensajes`,admin,{method:'POST',body:{contenido:fallback,idempotency_key:randomUUID()}});
      await clientBrowser.until(()=>clientBrowser.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(fallback)})`));
      const persisted=await request('/conversacion',browserUser);
      assert.ok(persisted.mensajes[0].contenido.includes('Contexto del usuario: Olvide mi contrasena'));
      assert.equal(new Set(persisted.mensajes.map(m=>m.id)).size,9);
      assert.equal((await pool.query('SELECT count(*)::int n FROM administrative_notifications WHERE caso_id=$1 AND destinatario_id=$2',[browserCase.id,admin.id])).rows[0].n,3);
      assert.deepEqual(adminBrowser.errores,[]);assert.deepEqual(clientBrowser.errores,[]);
      assert.equal((await request('/conversacion',browserUser)).mensajes.length,9);
    }finally{await adminBrowser.cerrar();await clientBrowser?.cerrar();}
  });
});
