// Explicitly authorized post-migration verification. Only one synthetic chat is written.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {Client}=require('pg');
const jwt=require('jsonwebtoken');
const {env,migration,checksum,config,fingerprints,epsFingerprint}=require('./enable-vitalix-visitors.cjs');
const privateDir=path.resolve(__dirname,'../database/backups/vitalix-visitors-20261113');
let phase='preflight';
async function main(){
  const applied=JSON.parse(fs.readFileSync(path.join(privateDir,'migration-applied.json'),'utf8'));
  const sessionFile=path.join(privateDir,'primary-test-session.private.json');
  const saved=fs.existsSync(sessionFile)?JSON.parse(fs.readFileSync(sessionFile,'utf8')):null;
  const label=saved?.label||'[VERIFICACION VITALIX '+new Date().toISOString()+']';
  const seen=new Set();
  const url=config(env.DATABASE_URL);
  assert.equal(url.hostname,applied.primaryHost);assert.equal(url.pathname,'/neondb');assert.equal(applied.migration,migration);assert.equal(applied.checksum,checksum);
  for(const [key,value] of Object.entries(env))if(['DATABASE_URL','EPS_DATABASE_URL','EPS_DATABASE_SCHEMA','JWT_SECRET'].includes(key))process.env[key]=value;
  process.env.DATABASE_URL=url.toString();
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000});
  let server,io,visitor,administrator;
  try{
    await db.connect();await db.query('BEGIN READ ONLY');const before=await fingerprints(db);await db.query('ROLLBACK');const epsBefore=await epsFingerprint();
    const admins=(await db.query("SELECT id FROM usuarios WHERE id=1 AND rol_id=1 AND estado='ACTIVO'")).rows;assert.equal(admins.length,1);assert.equal(before.usuarios.count,5);assert.equal(epsBefore.afiliados.count,50);
    const token=jwt.sign({id:1,rol:1},env.JWT_SECRET,{expiresIn:'10m'});
    // Configure only this temporary process's exact origin before loading the normal CORS guard.
    server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    process.env.CORS_ORIGINS=[env.CORS_ORIGINS,origin].filter(Boolean).join(',');
    const app=require('../src/app');server.on('request',app);
    const {Server}=require('socket.io');io=new Server(server);require('../src/sockets/administrative.socket').attachAdministrativeSocket(io,app);
    const {abrirEdge}=require('../tests/support/afiliados-edge.cjs');visitor=await abrirEdge();administrator=await abrirEdge();
    const socketDiagnostic=`window.__socketChecks=[];let originalIo;Object.defineProperty(window,'io',{configurable:true,get(){return originalIo;},set(factory){originalIo=(...args)=>{const socket=factory(...args);socket.on('connect',()=>window.__socketChecks.push('connected'));socket.on('connect_error',error=>window.__socketChecks.push(error.message));return socket;};}});`;
    await visitor.send('Page.addScriptToEvaluateOnNewDocument',{source:socketDiagnostic});
    await administrator.send('Page.addScriptToEvaluateOnNewDocument',{source:socketDiagnostic});
    if(saved)await visitor.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('saludclick_vitalix_visitor_v1',${JSON.stringify(JSON.stringify(saved.session))});`});
    await administrator.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token)});sessionStorage.setItem('saludclick_user',JSON.stringify({id:1,rol:1,nombre:'Administrador'}));`});
    phase='open-admin-notifications';
    await administrator.send('Page.navigate',{url:origin+'/pages/admin.html#notificaciones'});
    await administrator.until(()=>administrator.evaluate(`!!document.querySelector('#readAllNotifications')`),30000);
    phase='open-visitor-home';await visitor.send('Page.navigate',{url:origin+'/index.html'});
    await visitor.until(()=>visitor.evaluate(`!!document.querySelector('.vitalix-launcher')`));
    phase='open-visitor-widget';await visitor.evaluate(`document.querySelector('.vitalix-launcher').click()`);
    await visitor.until(()=>visitor.evaluate(`document.querySelector('.vitalix-composer input')?.disabled===false`));
    assert.equal(await visitor.evaluate(`localStorage.getItem('saludclick_token')||sessionStorage.getItem('saludclick_token')`),null);
    assert.equal(await visitor.evaluate(`[...document.querySelectorAll('a')].some(a=>a.href.startsWith('mailto:'))`),false);
    async function userSend(text){
      if(seen.has(text))return;
      await visitor.evaluate(`{const input=document.querySelector('.vitalix-composer input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));}`);
      await visitor.until(()=>visitor.evaluate(`!document.querySelector('.vitalix-composer button').disabled`));
      await visitor.evaluate(`document.querySelector('.vitalix-composer button').click()`);
      await visitor.until(()=>visitor.evaluate(`document.querySelector('.vitalix-composer input').value===''&&!document.querySelector('.vitalix-typing')`),30000);
      seen.add(text);
    }
    async function staffSend(text){
      if(!seen.has(text)){await administrator.evaluate(`document.querySelector('#chatReply').value=${JSON.stringify(text)};document.querySelector('#chatComposer').requestSubmit()`);seen.add(text);}
      await visitor.until(()=>visitor.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(text)})`),30000);
    }
    phase='bot-without-conversation';if(!saved?.caseId)await userSend('Hola');
    const credential=await visitor.evaluate(`JSON.parse(localStorage.getItem('saludclick_vitalix_visitor_v1')).token`);
    const hash=require('../src/middlewares/administrative-visitor.middleware').visitorHash(credential);
    if(!saved?.caseId)assert.equal((await db.query('SELECT count(*)::int n FROM administrative_cases WHERE visitante_hash=$1',[hash])).rows[0].n,0);
    const session=await visitor.evaluate(`JSON.parse(localStorage.getItem('saludclick_vitalix_visitor_v1'))`);
    fs.writeFileSync(sessionFile,JSON.stringify({label,session,caseId:saved?.caseId||null}));
    phase='visitor-handoff-and-bell';const first=label+' Quiero hablar con Administracion para verificar el chat publico.';
    if(!saved?.caseId){await userSend(first);await visitor.until(()=>visitor.evaluate(`document.body.textContent.includes('Mensaje guardado y enviado')`));}
    const own=(await db.query('SELECT id FROM administrative_cases WHERE visitante_hash=$1',[hash])).rows;assert.equal(own.length,1);const id=own[0].id;
    fs.writeFileSync(sessionFile,JSON.stringify({label,session,caseId:id}));
    for(const message of (await db.query('SELECT contenido FROM administrative_messages WHERE caso_id=$1',[id])).rows)seen.add(message.contenido);
    if(!saved?.caseId){
      await administrator.until(()=>administrator.evaluate(`Number(document.querySelector('#adminNotificationCount').textContent)>0&&document.querySelector('#adminNotificationBell').classList.contains('has-unread')`),30000);
      await administrator.until(()=>administrator.evaluate(`!!document.querySelector('a[data-notification-open][href="#solicitudes/${id}"]')`));
      await administrator.evaluate(`document.querySelector('a[data-notification-open][href="#solicitudes/${id}"]').click()`);
    }else await administrator.evaluate(`location.hash='solicitudes/${id}'`);
    await administrator.until(()=>administrator.evaluate(`document.querySelector('#chatLog')?.textContent.includes(${JSON.stringify(first)})`),30000);
    assert.match(await administrator.evaluate(`document.querySelector('#chatTitle').textContent`),/Visitante/);
    phase='bidirectional-messages';
    await staffSend(label+' Respuesta 1 del administrador: mensaje recibido.');
    const second=label+' Mensaje 2 del visitante: respuesta recibida en VITALIX.';await userSend(second);
    await administrator.until(()=>administrator.evaluate(`document.querySelector('#chatLog').textContent.includes(${JSON.stringify(second)})`));
    await staffSend(label+' Respuesta 2 del administrador: continuamos en el mismo chat.');
    const third=label+' Mensaje 3 del visitante: historial y notificaciones comprobados.';await userSend(third);
    await administrator.until(()=>administrator.evaluate(`document.querySelector('#chatLog').textContent.includes(${JSON.stringify(third)})`));
    phase='socket-live-status';await visitor.until(()=>visitor.evaluate(`document.querySelector('.vitalix-mode').textContent.includes('En tiempo real')`),30000);
    phase='reload-and-reconnect';
    await visitor.send('Page.reload');await visitor.until(()=>visitor.evaluate(`document.querySelector('.vitalix-composer input')?.disabled===false`));
    await visitor.evaluate(`document.querySelector('.vitalix-launcher').click()`);
    await visitor.until(()=>visitor.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(third)})`));
    await visitor.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    const reconnect=label+' Respuesta 3 del administrador: recuperada tras reconexion.';
    await administrator.evaluate(`document.querySelector('#chatReply').value=${JSON.stringify(reconnect)};document.querySelector('#chatComposer').requestSubmit()`);
    await administrator.until(()=>administrator.evaluate(`document.querySelector('#chatLog').textContent.includes(${JSON.stringify(reconnect)})`));
    await visitor.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await visitor.until(()=>visitor.evaluate(`document.querySelector('.vitalix-transcript').textContent.includes(${JSON.stringify(reconnect)})`),30000);
    phase='durable-retry-and-isolation';
    const stored=(await db.query('SELECT id,contenido FROM administrative_messages WHERE caso_id=$1 ORDER BY id',[id])).rows;assert.equal(stored.length,6);
    const receipt=(await db.query("SELECT campos FROM administrative_audit WHERE entidad='MENSAJE_ADMINISTRATIVO' AND registro_id=$1 AND accion='MENSAJE_CONFIRMADO'",[String(stored[0].id)])).rows[0];
    const key=receipt.campos.find(v=>v.startsWith('request:')).slice(8);
    const retry=await fetch(origin+'/api/administrativo/visitante/mensajes',{method:'POST',headers:{Authorization:'Vitalix '+credential,'Content-Type':'application/json'},body:JSON.stringify({contenido:stored[0].contenido,idempotency_key:key})});assert.equal(retry.status,200);assert.equal((await retry.json()).mensaje.repetido,true);
    const other=randomBytes(32).toString('hex');
    const unrelated=await fetch(origin+'/api/administrativo/visitante/conversacion',{headers:{Authorization:'Vitalix '+other}});assert.equal((await unrelated.json()).caso,null);
    for(const route of ['/api/administrativo/usuarios','/api/administrativo/atenciones/'+id]){
      assert.equal((await fetch(origin+route)).status,401);
      assert.equal((await fetch(origin+route,{headers:{Authorization:'Vitalix '+other}})).status,401);
    }
    const {connectAdministrativeSocket}=require('../tests/support/administrative-socket-client.cjs');
    await assert.rejects(connectAdministrativeSocket(origin,{visitorToken:other}),/denied/);
    const wrongRole=jwt.sign({id:1,rol:2},env.JWT_SECRET,{expiresIn:'2m'});
    assert.equal((await fetch(origin+'/api/administrativo/usuarios',{headers:{Authorization:'Bearer '+wrongRole}})).status,403);
    phase='close-reopen-and-directory';
    await administrator.evaluate(`document.querySelector('#chatClose').click()`);await administrator.until(()=>administrator.evaluate(`document.querySelector('#chatReply').disabled`));
    await administrator.evaluate(`document.querySelector('#chatClose').click()`);await administrator.until(()=>administrator.evaluate(`!document.querySelector('#chatReply').disabled`));
    await administrator.evaluate(`document.querySelector('#chatClose').click()`);await administrator.until(()=>administrator.evaluate(`document.querySelector('#chatReply').disabled`));
    const directory=await (await fetch(origin+'/api/administrativo/usuarios?limit=100',{headers:{Authorization:'Bearer '+token}})).json();
    assert.equal(directory.total,55);assert.equal(directory.resumen.cuentas_acceso,5);assert.equal(directory.resumen.afiliados_eps,50);
    assert.deepEqual(await administrator.evaluate(`[...document.querySelectorAll('[data-section]')].map(n=>n.dataset.section)`),['dashboard','usuarios','solicitudes','notificaciones','informes','configuracion']);
    phase='data-preservation';
    await db.query('BEGIN READ ONLY');const after=await fingerprints(db);await db.query('ROLLBACK');const epsAfter=await epsFingerprint();
    const chatTables=new Set(['administrative_cases','administrative_messages','administrative_notifications','administrative_audit']);
    assert.deepEqual(Object.keys(after),Object.keys(before));for(const table of Object.keys(before))if(!chatTables.has(table))assert.deepEqual(after[table],before[table],table+' changed');
    assert.deepEqual(epsAfter,epsBefore);assert.equal(after.usuarios.count,5);
    const final=(await db.query('SELECT estado,(SELECT count(*)::int FROM administrative_messages WHERE caso_id=c.id) AS messages,(SELECT count(*)::int FROM administrative_notifications WHERE caso_id=c.id AND destinatario_id=1 AND tipo=\'MENSAJE\') AS notifications FROM administrative_cases c WHERE id=$1',[id])).rows[0];
    assert.equal(final.messages,6);assert.equal(final.notifications,3);assert.equal(final.estado,'CERRADA');
    assert.deepEqual(visitor.errores,[]);assert.deepEqual(administrator.errores,[]);
    const result={status:'PRIMARY_VISITOR_CHAT_VERIFIED',verifiedAt:new Date().toISOString(),migration,primaryHost:url.hostname,caseId:id,syntheticConversation:true,conversationsCreated:1,messages:6,administratorMessageNotifications:3,finalState:'CERRADA',twoRealBrowsers:true,visitorWithoutJWT:true,realSocketIO:true,reload:true,reconnection:true,idempotentRetry:true,ownershipIsolation:true,administrativeRoutesProtected:true,accounts:5,epsAffiliates:50,visibleDirectory:55,administrativeModules:6,unrelatedDataUnchanged:true,passwordsUnchanged:true,usersCreated:0,otherMigrations:0};
    fs.writeFileSync(path.join(privateDir,'primary-chat-verification.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
  }catch(error){
    const inspect=async browser=>browser?.evaluate(`({path:location.pathname,ready:document.readyState,section:document.querySelector('#sectionTitle')?.textContent,hasNotificationsButton:!!document.querySelector('#readAllNotifications'),hasLauncher:!!document.querySelector('.vitalix-launcher'),inputDisabled:document.querySelector('.vitalix-composer input')?.disabled,socketChecks:window.__socketChecks,notice:document.querySelector('#adminNotice')?.textContent,guestError:document.querySelector('.vitalix-note[role=alert]')?.textContent})`).catch(()=>null);
    console.log(JSON.stringify({diagnosticPhase:phase,administrator:await inspect(administrator),visitor:await inspect(visitor),adminScriptErrors:administrator?.errores,visitorScriptErrors:visitor?.errores}));throw error;
  }finally{
    await visitor?.cerrar();await administrator?.cerrar();
    if(io)await new Promise(resolve=>io.close(resolve));if(server?.listening)await new Promise(resolve=>server.close(resolve));
    await require('../src/config/eps-prisma').cerrarConexionEPS();await require('../src/config/prisma').$disconnect();await require('../src/config/database').end();await db.end();
  }
}
main().catch(error=>{console.error(JSON.stringify({status:'POST_MIGRATION_VERIFICATION_INCOMPLETE',phase,code:error.code||error.name,assertion:error.code==='ERR_ASSERTION'?String(error.message).split('\n')[0]:undefined}));process.exitCode=1;});
