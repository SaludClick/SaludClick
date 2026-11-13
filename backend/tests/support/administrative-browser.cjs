const assert=require('node:assert/strict');
const {pdf,csv}=require('../../src/services/administrative-export.service');
const {createDirectoryService}=require('../../src/services/administrative-directory.service');
function createFixture(){
    const now='2026-11-12T12:00:00Z',users=[],cases=[],messages=[],notifications=[],exports=[];
    users.push(...Array.from({length:5},(_,i)=>({id:i+1,nombre:'Local '+(i+1),apellido:'Cuenta',correo:`local${i+1}@example.test`,cedula:'LOCAL'+i,tipo_documento:'CC',rol_id:[1,2,3,4,2][i],estado:[1,3,4].includes(i+1)?'ACTIVO':null,created_at:now})));
    const epsRecords=Array.from({length:50},(_,i)=>({id:String(i+1),nombres:'Afiliado '+(i+1),apellidos:'Origen EPS',tipo_documento:'CC',documento:'EPS'+String(i+1).padStart(4,'0'),correo:`eps${i+1}@example.test`,estado:i%2?'Inactivo':'Activo',eps_id:'1'}));
    const directory=createDirectoryService({local:{read:async()=>users},source:{leer:async()=>({afiliados:epsRecords})}});
    const patients=[{id:8,nombres:'Maria',apellidos:'Prueba',tipo_documento:'CC',cedula:'0008',estado:'AUTORIZADO',created_at:now,updated_at:now}];
    let settings=[],preferences={notificaciones:true,compacto:false},passwordChanges=0,failNextMessage=false,loseNextMessageResponse=false;
    const receipts=new Map();
    const profile={id:1,nombre:'Admin',apellido:'Prueba',correo:'admin@example.test',cedula:'001',telefono:'',ciudad:''};
    async function handle(req,res){
        if(req.url.startsWith('/api/admin/pacientes')){
            const url=new URL(req.url,'http://fixture.test');const id=Number(url.pathname.split('/').at(-1));
            const chunks=[];for await(const c of req)chunks.push(c);
            if(req.method==='PATCH')Object.assign(patients.find(p=>p.id===id),JSON.parse(Buffer.concat(chunks).toString()));
            const filtered=patients.filter(p=>!url.searchParams.get('estado')||p.estado===url.searchParams.get('estado'));
            res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,...(id?{paciente:patients.find(p=>p.id===id)}:{pacientes:filtered,paginacion:{total:filtered.length}})}));return true;
        }
        if(!req.url.startsWith('/api/administrativo'))return false;
        const url=new URL(req.url,'http://fixture.test'),path=url.pathname.replace('/api/administrativo','');
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const input=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
        let data={};
        if(path==='/dashboard')data={estadisticas:{usuarios:{total:users.length},directorio:await directory.summary(),solicitudes:{abiertas:4,atendidas:6,pendientes:3,en_atencion:1,resueltas:4,cerradas:2},notificaciones:{sin_leer:1}}};
        else if(path==='/usuarios'&&req.method==='POST'){const {password,...safe}=input;data={usuario:{id:users.length+2,...safe,created_at:now}};users.push(data.usuario);}
        else if(path.startsWith('/usuarios/')&&req.method==='PATCH'){const user=users.find(u=>u.id===Number(path.split('/')[2]));Object.assign(user,input);data={usuario:user};}
        else if(path.startsWith('/usuarios/directorio/'))data={registro:await directory.detail(decodeURIComponent(path.slice('/usuarios/directorio/'.length)))};
        else if(path.startsWith('/usuarios/'))data={usuario:users.find(u=>u.id===Number(path.split('/')[2]))};
        else if(path==='/usuarios')data=await directory.list(Object.fromEntries(url.searchParams));
        else if(path==='/responsables')data={administradores:[profile]};
        else if(path==='/conversacion'&&req.method==='GET'){const c=cases.find(c=>c.cliente_id===42)||null;data={caso:c,mensajes:c?messages.filter(m=>m.caso_id===c.id):[],historial:[],hayAnteriores:false};}
        else if(path==='/vitalix/mensajes'){
            let c=cases.find(c=>c.cliente_id===42);
            if(!c){c={id:cases.length+1,cliente_id:42,responsable_id:null,cliente_nombre:'Cliente',cliente_apellido:'Prueba',pendientes:0,tipo:'CONVERSACION',asunto:'Chat administrativo',categoria:'SOPORTE',estado:'ABIERTA',created_at:now,updated_at:now};cases.push(c);}
            let m=receipts.get('42:'+input.idempotency_key);
            if(!m){m={id:messages.length+1,caso_id:c.id,remitente_id:42,nombre:'Cliente',rol_id:2,contenido:input.contenido,created_at:now};messages.push(m);receipts.set('42:'+input.idempotency_key,m);notifications.push({id:notifications.length+1,caso_id:c.id,caso_tipo:c.tipo,titulo:'Nuevo mensaje de un cliente',tipo:'MENSAJE',created_at:now,leida_at:null});}
            data={caso:c,mensaje:m};
            if(loseNextMessageResponse){loseNextMessageResponse=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,mensaje:'Confirmacion perdida.'}));return true;}
        }
        else if(path==='/conversacion'){
            let c=cases.find(c=>c.cliente_id===42);const creada=!c;
            if(!c){c={id:cases.length+1,cliente_id:42,responsable_id:null,cliente_nombre:'Cliente',cliente_apellido:'Prueba',pendientes:0,tipo:'CONVERSACION',asunto:'Atención administrativa',categoria:'SOPORTE',estado:'ABIERTA',created_at:now,updated_at:now};cases.push(c);notifications.push({id:notifications.length+1,caso_id:c.id,caso_tipo:c.tipo,titulo:'Atención humana',tipo:'NUEVA_ATENCION',created_at:now,leida_at:null});}
            if(['CERRADA','RESUELTA'].includes(c.estado))c.estado='ABIERTA';data={caso:c,creada};
        }
        else if(path==='/atenciones'&&req.method==='POST'){
            const c={id:cases.length+1,cliente_id:42,responsable_id:null,cliente_nombre:'Cliente',cliente_apellido:'Prueba',pendientes:1,...input,estado:'ABIERTA',created_at:now,updated_at:now};cases.push(c);
            messages.push({id:messages.length+1,caso_id:c.id,remitente_id:42,nombre:'Cliente',rol_id:2,contenido:input.contenido,created_at:now});notifications.push({id:notifications.length+1,caso_id:c.id,caso_tipo:c.tipo,titulo:'Nueva atención',tipo:'NUEVA_ATENCION',created_at:now,leida_at:null});data={caso:c};
        }else if(path==='/atenciones'){
            const tipo=url.searchParams.get('tipo'),bandeja=url.searchParams.get('bandeja');
            const list=cases.filter(c=>(!tipo||c.tipo===tipo)&&(!bandeja||(bandeja==='PENDIENTES'?['ABIERTA','EN_ATENCION']:['RESUELTA','CERRADA']).includes(c.estado))).map(c=>({...c,ultimo_mensaje:messages.filter(m=>m.caso_id===c.id).at(-1)?.contenido,pendientes:messages.filter(m=>m.caso_id===c.id&&!m.leido_at&&m.rol_id!==(req.headers.authorization?.endsWith('-2')?2:1)).length}));data={casos:list,total:list.length};
        }else if(/^\/atenciones\/\d+$/.test(path)){
            const c=cases.find(c=>c.id===Number(path.split('/')[2]));
            if(req.method==='PATCH'){Object.assign(c,input);data={caso:c};}else data={caso:c,mensajes:messages.filter(m=>m.caso_id===c.id),historial:[],hayAnteriores:false};
        }else if(/\/mensajes$/.test(path)){
            if(failNextMessage){failNextMessage=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,mensaje:'Envio temporalmente no disponible.'}));return true;}
            const id=Number(path.split('/')[2]),isClient=req.headers.authorization?.endsWith('-2');
            const message={id:messages.length+1,caso_id:id,remitente_id:isClient?42:1,nombre:isClient?'Cliente':'Admin',rol_id:isClient?2:1,contenido:input.contenido,created_at:now};messages.push(message);
            if(!isClient){cases.find(c=>c.id===id).estado='EN_ATENCION';cases.find(c=>c.id===id).responsable_id??=1;}
            data={mensaje:message};
        }else if(/\/leido$/.test(path)){for(const m of messages)if(m.caso_id===Number(path.split('/')[2])&&m.id<=input.hasta&&m.rol_id!==(req.headers.authorization?.endsWith('-2')?2:1))m.leido_at=now;data={leidos:1};}
        else if(/\/reabrir$/.test(path)){const c=cases.find(c=>c.id===Number(path.split('/')[2]));c.estado='ABIERTA';data={caso:c};}
        else if(path==='/notificaciones')data={notificaciones:notifications,total:notifications.length,sinLeer:notifications.filter(n=>!n.leida_at).length};
        else if(path==='/notificaciones/leidas')notifications.forEach(n=>{n.leida_at=now;});
        else if(/\/notificaciones\/\d+\/leida$/.test(path)){notifications.find(n=>n.id===Number(path.split('/')[2])).leida_at=now;}
        else if(path==='/configuracion')data={configuracion:settings};
        else if(path.startsWith('/configuracion/')){const clave=path.split('/')[2];settings=settings.filter(s=>s.clave!==clave);settings.push({clave,valor:input.valor});data={configuracion:settings.at(-1)};}
        else if(path==='/preferencias'){if(req.method==='PUT')preferences=input;data={preferencias:preferences};}
        else if(path==='/perfil'){if(req.method==='PUT')Object.assign(profile,input);data={usuario:profile};}
        else if(path==='/password'){
            if(input.actual!=='current-test-password'){res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,mensaje:'Contrasena actual incorrecta.'}));return true;}
            passwordChanges++;data={mensaje:'Contrasena actualizada. Inicia sesion de nuevo.'};
        }
        else if(path==='/faq')data={preguntas:[]};
        else if(path==='/auditoria')data={actividades:[{id:1,actor_id:1,accion:'USUARIO_CREADO',entidad:'USUARIO',registro_id:'2',resultado:'EXITO',created_at:now,total:1}]};
        else if(path.startsWith('/informes/')){
            const type=path.split('/')[2];const informe=['usuarios','afiliados','origenes'].includes(type)?await directory.report(type,Object.fromEntries(url.searchParams)):{tipo:type,generadoEn:now,filtros:{},filas:[{rol_id:2,total:9}],resumen:{registros:1,total:9},limitado:false};const format=url.searchParams.get('formato');
            if(['csv','pdf'].includes(format)){exports.push(format);res.writeHead(200,{'Content-Type':format==='csv'?'text/csv':'application/pdf'});res.end(format==='csv'?csv(informe):pdf(informe));return true;}
            data={informe};
        }
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,...data}));return true;
    }
    return {handle,users,patients,cases,messages,notifications,exports,get passwordChanges(){return passwordChanges;},set failNextMessage(value){failNextMessage=value;},set loseNextMessageResponse(value){loseNextMessageResponse=value;}};
}
async function testWorkspace({t,evaluate,go,click,value,until,send,fixture}){
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.io=()=>({on(name,fn){if(name==='administrativo:actualizado')window.__administrativeEvent=fn;},disconnect(){}});`});
    const session=role=>evaluate(`for(const s of [localStorage,sessionStorage]){s.setItem('saludclick_token','frontend-test-only-${role}');s.setItem('saludclick_user',JSON.stringify({id:${role===1?1:42},nombre:'Prueba',rol:${role}}));}`);
    await t.test('administrative dashboard, mobile navigation and account form use real API contracts',async()=>{
        await session(1);await go('/pages/admin.html');await until(()=>evaluate(`document.querySelectorAll('.ad-stat').length===8`));
        assert.match(await evaluate(`document.querySelector('#adminView').textContent`),/50/);
        assert.equal(await evaluate(`document.querySelectorAll('[data-section]').length`),6);
        assert.doesNotMatch(await evaluate(`document.querySelector('#adminView').textContent`),/Inventario|Fórmulas|Medicamentos/);
        for(const width of [390,320]){
            await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
            assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
        }
        await click('#adminMenu');assert.equal(await evaluate(`document.querySelector('#adminMenu').getAttribute('aria-expanded')`),'true');
        await send('Emulation.clearDeviceMetricsOverride');
        await evaluate(`location.hash='usuarios'`);await until(()=>evaluate(`!!document.querySelector('#newUser')`));await click('#newUser');
        assert.equal(await evaluate(`document.querySelector('#userDialog').open`),true);
        for(const [key,text] of Object.entries({nombre:'Ana',apellido:'Prueba',correo:'ana@example.test',cedula:'0009',password:'long-test-password',rol_id:'4'}))await value(`#userForm [name=${key}]`,text);
        await click('#userForm button[type=submit]');await until(()=>evaluate(`document.querySelector('#adminView').textContent.includes('ana@example.test')`));
        assert.equal(fixture.users.at(-1).cedula,'0009');assert.ok(!Object.hasOwn(fixture.users.at(-1),'password'));
        await click(`[data-user="${fixture.users.at(-1).id}"]`);await value('#userForm [name=estado]','INACTIVO');await click('#userForm button[type=submit]');
        await until(()=>Promise.resolve(fixture.users.at(-1).estado==='INACTIVO'));
        await until(()=>evaluate(`!document.querySelector('#userDialog').open`));
        await until(()=>evaluate(`document.querySelector('#adminView tbody').textContent.includes('INACTIVO')`));
        assert.equal(fixture.users.at(-1).estado,'INACTIVO');
        await click(`[data-user-detail="SALUDCLICK:${fixture.users.at(-1).id}"]`);await until(()=>evaluate(`document.querySelector('#recordDialog')?.open`));
        assert.match(await evaluate(`document.querySelector('#recordDialog').textContent`),/ana@example.test/);await click('#closeRecord');
    });
    await t.test('Usuarios includes all 50 EPS records with filters, pagination and read-only detail',async()=>{
        const localCount=fixture.users.length;
        await evaluate(`location.hash='usuarios'`);await until(()=>evaluate(`!!document.querySelector('#directorySummary')`));
        assert.match(await evaluate(`document.querySelector('#directorySummary').textContent`),/50 afiliados EPS/);
        await value('#filterForm [name=origen]','EPS');await click('#filterForm button[type=submit]');
        await until(()=>evaluate(`document.querySelectorAll('[data-record^="EPS:"]').length===20`));
        const keys=await evaluate(`[...document.querySelectorAll('[data-record]')].map(n=>n.dataset.record)`);
        await click('#nextPage');await until(()=>evaluate(`document.querySelector('#adminView .ad-pagination').textContent.includes('2')`));
        keys.push(...await evaluate(`[...document.querySelectorAll('[data-record]')].map(n=>n.dataset.record)`));
        await click('#nextPage');await until(()=>evaluate(`document.querySelectorAll('[data-record]').length===10`));
        keys.push(...await evaluate(`[...document.querySelectorAll('[data-record]')].map(n=>n.dataset.record)`));assert.equal(new Set(keys).size,50);
        assert.equal(await evaluate(`document.querySelectorAll('[data-user]').length`),0);
        await click('[data-user-detail]');await until(()=>evaluate(`document.querySelector('#recordDialog')?.open`));
        assert.equal(await evaluate(`document.querySelectorAll('#recordDialog input,#recordDialog select').length`),0);await click('#closeRecord');
        await value('#filterForm [name=buscar]','eps50@example.test');await click('#filterForm button[type=submit]');await until(()=>evaluate(`document.querySelectorAll('[data-record]').length===1`));
        assert.match(await evaluate(`document.querySelector('#adminView tbody').textContent`),/eps50@example.test/);
        await click('#clearFilters');await until(()=>evaluate(`document.querySelector('#filterForm [name=origen]').value===''`));
        assert.equal(fixture.users.length,localCount);
        await evaluate(`location.hash='pacientes'`);await until(()=>evaluate(`document.querySelector('#sectionTitle').textContent==='Usuarios'`));
        assert.equal(await evaluate(`!!document.querySelector('[data-section=pacientes]')`),false);
        for(const oldPath of ['/pages/admin-pacientes.html','/pages/admin-cuentas.html']){
            await send('Page.navigate',{url:await evaluate(`location.origin`)+oldPath});
            await until(()=>evaluate(`location.pathname==='/pages/admin.html'&&location.hash==='#usuarios'&&!!document.querySelector('#directorySummary')`));
            assert.equal(await evaluate(`!!document.querySelector('#patientsTable')`),false);
        }
    });
    await t.test('VITALIX opens one administrative chat and both participants exchange messages',async()=>{
        await session(2);await go('/pages/chat.html');
        await until(()=>evaluate(`document.querySelector('.vitalix-composer input')?.disabled===false`));
        fixture.loseNextMessageResponse=true;
        await evaluate(`const input=document.querySelector('.vitalix-composer input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Quiero hablar con un administrador');input.dispatchEvent(new Event('input',{bubbles:true}));`);
        await until(()=>evaluate(`document.querySelector('.vitalix-composer button').disabled===false`));
        await click('.vitalix-composer button');
        await until(()=>evaluate(`document.querySelector('.vitalix-note[role=alert]')?.textContent.includes('se conserva')`));
        assert.equal(fixture.cases.length,1);assert.equal(fixture.messages.length,1);assert.equal(fixture.notifications.length,1);
        assert.equal(await evaluate(`document.querySelector('.vitalix-composer input').value`),'Quiero hablar con un administrador');
        await click('.vitalix-composer button');await until(()=>evaluate(`document.querySelector('.vitalix-composer input').value===''`));
        assert.equal(fixture.messages.length,1);assert.equal(fixture.notifications.length,1);
        assert.equal(await evaluate(`location.pathname`),'/pages/chat.html');
        assert.equal(await evaluate(`!!document.querySelector('#newCase')`),false);
        await session(1);await go('/pages/admin.html#solicitudes');
        await until(()=>evaluate(`!!document.querySelector('#chatReply')`));
        await value('#chatResponsible','1');await click('#chatAssign');
        await until(()=>Promise.resolve(fixture.cases[0].responsable_id===1));
        await value('#chatReply','Te ayudamos con tu acceso.');await click('#chatSend');
        await until(()=>evaluate(`document.querySelector('#chatLog').textContent.includes('Te ayudamos')`));
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#chatLog [data-message]')].map(n=>Number(n.dataset.message))`),fixture.messages.map(m=>m.id));
        await click('#chatResolve');await until(()=>Promise.resolve(fixture.cases[0].estado==='RESUELTA'));
        await until(()=>evaluate(`document.querySelector('#chatReply').disabled`));
        await click('#chatClose');await until(()=>evaluate(`document.querySelector('#chatReply').disabled===false`));
        await click('#chatClose');await until(()=>Promise.resolve(fixture.cases[0].estado==='CERRADA'));
        await click('#chatClose');await until(()=>Promise.resolve(fixture.cases[0].estado==='ABIERTA'));
        for(const width of [390,320]){
            await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
            assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
            await click('#chatBack');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.ac-inbox')).display==='none'`),false);
            await click('[data-chat]');await until(()=>evaluate(`document.querySelector('#administrativeChat').classList.contains('ac-has-selection')`));
        }
        await send('Emulation.clearDeviceMetricsOverride');
    });
    await t.test('notifications, reports, profile, parameters, preferences and FAQ controls are connected',async()=>{
        await evaluate(`location.hash='notificaciones'`);await until(()=>evaluate(`!!document.querySelector('[data-read]')`));await click('[data-read]');await until(()=>Promise.resolve(Boolean(fixture.notifications[0].leida_at)));
        await evaluate(`location.hash='informes'`);await until(()=>evaluate(`!!document.querySelector('#reportForm')`));await click('#reportForm button.ad-primary');await until(()=>evaluate(`document.querySelector('#reportResult').textContent.includes('registros')`));
        await send('Browser.setDownloadBehavior',{behavior:'deny'});
        for(const format of ['csv','pdf']){await click(`[data-export=${format}]`);await until(()=>Promise.resolve(fixture.exports.includes(format)));await until(()=>evaluate(`document.querySelector('[data-export=${format}]').disabled===false`));}
        await evaluate(`location.hash='auditoria'`);await until(()=>evaluate(`document.querySelectorAll('.ad-stat').length===8`));
        await evaluate(`location.hash='configuracion'`);await until(()=>evaluate(`!!document.querySelector('#profileForm')`));
        await value('#profileForm [name=nombre]','Administrador actualizado');await click('#profileForm button');await until(()=>evaluate(`document.querySelector('#adminNotice').textContent.includes('guardados')`));
        await value('#generalForm [name=nombrePanel]','Centro administrativo');await click('#generalForm button');await until(()=>evaluate(`document.querySelector('#generalForm button').disabled===false`));
        await click('#preferencesForm [name=compacto]');await click('#preferencesForm button');await until(()=>evaluate(`document.body.classList.contains('compact')`));
        await click('#addFaq');await value('#faqRows [name=pregunta]','¿Cómo solicito soporte?');await value('#faqRows [name=respuesta]','Abre una consulta administrativa.');await click('#faqForm button.ad-primary');
        await until(()=>evaluate(`document.querySelector('#faqForm button.ad-primary').disabled===false`));
        assert.equal(await evaluate(`document.querySelectorAll('#faqRows fieldset').length`),1);
        await click('[data-remove-faq]');assert.equal(await evaluate(`document.querySelectorAll('#faqRows fieldset').length`),0);
        await evaluate(`location.hash='notificaciones'`);await until(()=>evaluate(`!!document.querySelector('#readAllNotifications')`));
        if(fixture.notifications.some(n=>!n.leida_at)){await click('#readAllNotifications');await until(()=>Promise.resolve(fixture.notifications.every(n=>n.leida_at)));}
    });
    await t.test('new events refresh notifications and preserve an unsent reply',async()=>{
        // CDP can keep evaluating a background page. The production handler
        // intentionally skips hidden documents, so establish real visibility.
        await send('Page.bringToFront');
        await evaluate(`location.hash='notificaciones'`);await until(()=>evaluate(`!!document.querySelector('#readAllNotifications')`));
        await until(()=>evaluate(`!document.hidden&&document.querySelector('#adminView').getAttribute('aria-busy')==='false'&&typeof window.__administrativeEvent==='function'`));
        for(let repetition=1;repetition<=5;repetition++){
            const title='Evento nuevo '+repetition,id=998+repetition;
            const {targetId}=await send('Target.createTarget',{url:'about:blank',background:false});
            try{
                await until(()=>evaluate(`document.hidden`));
                fixture.notifications.push({id,caso_id:fixture.cases.at(-1).id,caso_tipo:'SOLICITUD',titulo:title,created_at:'2026-11-12T12:00:00Z',leida_at:null});
                await evaluate(`window.__administrativeEvent()`);
                assert.equal(await evaluate(`document.querySelector('#adminView').textContent.includes(${JSON.stringify(title)})`),false,'background events must not replace the hidden view');
                await send('Page.bringToFront');await until(()=>evaluate(`!document.hidden`));
                await evaluate(`window.__administrativeEvent()`);
                await until(()=>evaluate(`document.querySelector('#adminView').textContent.includes(${JSON.stringify(title)})&&document.querySelector('#adminView').getAttribute('aria-busy')==='false'`));
                assert.equal(await evaluate(`document.querySelectorAll('[data-notification-open="${id}"]').length`),1,'one notification per synthetic event');
                assert.ok(await evaluate(`Number(document.querySelector('#adminNotificationCount').textContent)>0&&document.querySelector('#adminNotificationBell').classList.contains('has-unread')`));
            }finally{await send('Target.closeTarget',{targetId});}
        }
        const c=fixture.cases.at(-1);c.estado='EN_ATENCION';
        await evaluate(`location.hash='solicitudes/${c.id}'`);await until(()=>evaluate(`!!document.querySelector('#chatReply')`));
        await value('#chatReply','Borrador sin enviar');await evaluate(`window.__administrativeEvent()`);
        assert.equal(await evaluate(`document.querySelector('#chatReply').value`),'Borrador sin enviar');
        const c2=fixture.cases.at(-1);fixture.messages.push({id:fixture.messages.length+1,caso_id:c2.id,remitente_id:42,nombre:'Cliente',rol_id:2,contenido:'Nuevo mensaje en vivo',created_at:'2026-11-12T12:05:00Z'});
        await evaluate(`window.__administrativeEvent()`);await until(()=>evaluate(`document.querySelector('#chatLog').textContent.includes('Nuevo mensaje en vivo')`));
        assert.equal(await evaluate(`document.querySelector('#chatReply').value`),'Borrador sin enviar');

    });
    await t.test('password submit shows errors, confirms success and ends the session',async()=>{
        await evaluate(`location.hash='configuracion'`);await until(()=>evaluate(`!!document.querySelector('#passwordForm')`));
        await value('#passwordForm [name=actual]','wrong-password');await value('#passwordForm [name=nueva]','new-test-password-long');await click('#passwordForm button');
        await until(()=>evaluate(`document.querySelector('#adminNotice').textContent.includes('incorrecta')`));
        const before=fixture.passwordChanges;await value('#passwordForm [name=actual]','current-test-password');await click('#passwordForm button');
        await until(()=>evaluate(`location.pathname==='/login.html'`));assert.equal(fixture.passwordChanges,before+1);
        assert.equal(await evaluate(`sessionStorage.getItem('saludclick_token')||localStorage.getItem('saludclick_token')`),null);
    });
    await t.test('Farmacia and EPS retain the local VITALIX assistant and never relay their messages',async()=>{
        const count=fixture.messages.length;
        for(const role of [3,4]){
            await session(role);await go('/pages/chat.html');
            await until(()=>evaluate(`document.querySelector('.vitalix-composer input')?.disabled===false`));
            assert.match(await evaluate(`document.querySelector('.vitalix-mode').textContent`),/respuestas programadas/);
            await evaluate(`const input=document.querySelector('.vitalix-composer input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'hola');input.dispatchEvent(new Event('input',{bubbles:true}));`);
            await until(()=>evaluate(`document.querySelector('.vitalix-composer button').disabled===false`));
            await click('.vitalix-composer button');await until(()=>evaluate(`document.querySelector('.vitalix-typing')===null&&[...document.querySelectorAll('.vitalix-message-assistant')].at(-1)?.textContent.includes('Hola')`));
            assert.equal(fixture.messages.length,count);
        }
    });
}
module.exports={createFixture,testWorkspace};
