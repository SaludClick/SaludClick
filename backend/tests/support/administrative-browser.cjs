const assert=require('node:assert/strict');
const {pdf,csv}=require('../../src/services/administrative-export.service');
function createFixture(){
    const now='2026-11-12T12:00:00Z',users=[],cases=[],messages=[],notifications=[],exports=[];
    let settings=[],preferences={notificaciones:true,compacto:false};
    const profile={id:1,nombre:'Admin',apellido:'Prueba',correo:'admin@example.test',cedula:'001',telefono:'',ciudad:''};
    async function handle(req,res){
        if(!req.url.startsWith('/api/administrativo'))return false;
        const url=new URL(req.url,'http://fixture.test'),path=url.pathname.replace('/api/administrativo','');
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const input=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
        let data={};
        if(path==='/dashboard')data={estadisticas:{usuarios:{total:12,activos:8,inactivos:3,sin_estado:1,clientes:9},solicitudes:{abiertas:4,atendidas:6},mensajes:{pendientes:2},notificaciones:{sin_leer:1},actividad:[]}};
        else if(path==='/usuarios'&&req.method==='POST'){const {password,...safe}=input;data={usuario:{id:users.length+2,...safe,created_at:now}};users.push(data.usuario);}
        else if(path.startsWith('/usuarios/')&&req.method==='PATCH'){const user=users.find(u=>u.id===Number(path.split('/')[2]));Object.assign(user,input);data={usuario:user};}
        else if(path==='/usuarios')data={usuarios:users,total:users.length};
        else if(path==='/responsables')data={administradores:[profile]};
        else if(path==='/atenciones'&&req.method==='POST'){
            const c={id:cases.length+1,cliente_id:42,responsable_id:null,cliente_nombre:'Cliente',cliente_apellido:'Prueba',pendientes:1,...input,estado:'ABIERTA',created_at:now,updated_at:now};cases.push(c);
            messages.push({id:messages.length+1,caso_id:c.id,remitente_id:42,nombre:'Cliente',rol_id:2,contenido:input.contenido,created_at:now});notifications.push({id:notifications.length+1,caso_id:c.id,caso_tipo:c.tipo,titulo:'Nueva atención',tipo:'NUEVA_ATENCION',created_at:now,leida_at:null});data={caso:c};
        }else if(path==='/atenciones'){
            const tipo=url.searchParams.get('tipo'),list=cases.filter(c=>!tipo||c.tipo===tipo);data={casos:list,total:list.length};
        }else if(/^\/atenciones\/\d+$/.test(path)){
            const c=cases.find(c=>c.id===Number(path.split('/')[2]));
            if(req.method==='PATCH'){Object.assign(c,input);data={caso:c};}else data={caso:c,mensajes:messages.filter(m=>m.caso_id===c.id),historial:[],hayAnteriores:false};
        }else if(/\/mensajes$/.test(path)){
            const id=Number(path.split('/')[2]);const message={id:messages.length+1,caso_id:id,remitente_id:1,nombre:'Admin',rol_id:1,contenido:input.contenido,created_at:now};messages.push(message);data={mensaje:message};
        }else if(/\/leido$/.test(path))data={leidos:1};
        else if(path==='/notificaciones')data={notificaciones:notifications,total:notifications.length,sinLeer:notifications.filter(n=>!n.leida_at).length};
        else if(/\/notificaciones\/\d+\/leida$/.test(path)){notifications.find(n=>n.id===Number(path.split('/')[2])).leida_at=now;}
        else if(path==='/configuracion')data={configuracion:settings};
        else if(path.startsWith('/configuracion/')){const clave=path.split('/')[2];settings=settings.filter(s=>s.clave!==clave);settings.push({clave,valor:input.valor});data={configuracion:settings.at(-1)};}
        else if(path==='/preferencias'){if(req.method==='PUT')preferences=input;data={preferencias:preferences};}
        else if(path==='/perfil'){if(req.method==='PUT')Object.assign(profile,input);data={usuario:profile};}
        else if(path==='/faq')data={preguntas:[]};
        else if(path==='/auditoria')data={actividades:[{id:1,actor_id:1,accion:'USUARIO_CREADO',entidad:'USUARIO',registro_id:'2',resultado:'EXITO',created_at:now,total:1}]};
        else if(path.startsWith('/informes/')){
            const informe={tipo:path.split('/')[2],generadoEn:now,filtros:{},filas:[{rol_id:2,total:9}],limitado:false};const format=url.searchParams.get('formato');
            if(['csv','pdf'].includes(format)){exports.push(format);res.writeHead(200,{'Content-Type':format==='csv'?'text/csv':'application/pdf'});res.end(format==='csv'?csv(informe):pdf(informe));return true;}
            data={informe};
        }
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,...data}));return true;
    }
    return {handle,users,cases,messages,notifications,exports};
}
async function testWorkspace({t,evaluate,go,click,value,until,send,fixture}){
    const session=role=>evaluate(`for(const s of [localStorage,sessionStorage]){s.setItem('saludclick_token','frontend-test-only');s.setItem('saludclick_user',JSON.stringify({id:${role===1?1:42},nombre:'Prueba',rol:${role}}));}`);
    await t.test('administrative dashboard, mobile navigation and account form use real API contracts',async()=>{
        await session(1);await go('/pages/admin.html');await until(()=>evaluate(`document.querySelectorAll('.ad-stat').length===6`));
        assert.match(await evaluate(`document.querySelector('#adminView').textContent`),/12/);
        assert.equal(await evaluate(`document.querySelectorAll('[data-section]').length`),8);
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
        await click('[data-user]');await value('#userForm [name=estado]','INACTIVO');await click('#userForm button[type=submit]');
        await until(()=>Promise.resolve(fixture.users.at(-1).estado==='INACTIVO'));
        await until(()=>evaluate(`!document.querySelector('#userDialog').open`));
        await until(()=>evaluate(`document.querySelector('#adminView tbody').textContent.includes('INACTIVO')`));
        assert.equal(fixture.users.at(-1).estado,'INACTIVO');
    });
    await t.test('client sends an administrative case, admin assigns, replies and resolves it',async()=>{
        await session(2);await go('/pages/soporte.html');await until(()=>evaluate(`!!document.querySelector('#newCase')`));
        await evaluate(`document.querySelector('details').open=true`);await value('#newCase [name=asunto]','Ayuda de acceso');await value('#newCase [name=contenido]','Necesito ayuda con mi cuenta');await click('#newCase button');
        await until(()=>evaluate(`!document.querySelector('#caseDetail').hidden`));assert.equal(fixture.cases.length,1);
        await session(1);await go('/pages/admin.html#solicitudes');await until(()=>evaluate(`!!document.querySelector('[data-case]')`));await click('[data-case]');
        await until(()=>evaluate(`!!document.querySelector('#caseState')`));await value('#caseState [name=estado]','EN_ATENCION');await value('#caseState [name=responsable_id]','1');await click('#caseState button');
        await until(()=>Promise.resolve(fixture.cases[0].estado==='EN_ATENCION'));await until(()=>evaluate(`document.querySelector('#caseState [name=estado]')?.value==='EN_ATENCION'`));
        await value('#replyForm textarea','Te ayudamos con tu acceso.');await click('#replyForm button');await until(()=>evaluate(`document.querySelector('.ad-log').textContent.includes('Te ayudamos')`));
        await click('#markCaseRead');await until(()=>evaluate(`document.querySelector('#adminNotice').textContent.includes('marcados')`));
        await value('#caseState [name=estado]','RESUELTA');await click('#caseState button');await until(()=>evaluate(`!document.querySelector('#replyForm')`));assert.equal(fixture.cases[0].estado,'RESUELTA');
    });
    await t.test('notifications, reports, audit, profile, preferences and FAQ controls are connected',async()=>{
        await evaluate(`location.hash='notificaciones'`);await until(()=>evaluate(`!!document.querySelector('[data-read]')`));await click('[data-read]');await until(()=>Promise.resolve(Boolean(fixture.notifications[0].leida_at)));
        await evaluate(`location.hash='informes'`);await until(()=>evaluate(`!!document.querySelector('#reportForm')`));await click('#reportForm button.ad-primary');await until(()=>evaluate(`document.querySelector('#reportResult').textContent.includes('registros')`));
        await send('Browser.setDownloadBehavior',{behavior:'deny'});
        for(const format of ['csv','pdf']){await click(`[data-export=${format}]`);await until(()=>Promise.resolve(fixture.exports.includes(format)));await until(()=>evaluate(`document.querySelector('[data-export=${format}]').disabled===false`));}
        await evaluate(`location.hash='auditoria'`);await until(()=>evaluate(`document.querySelector('#adminView').textContent.includes('USUARIO_CREADO')`));
        await evaluate(`location.hash='configuracion'`);await until(()=>evaluate(`!!document.querySelector('#profileForm')`));
        await value('#profileForm [name=nombre]','Administrador actualizado');await click('#profileForm button');await until(()=>evaluate(`document.querySelector('#adminNotice').textContent.includes('guardados')`));
        await click('#preferencesForm [name=compacto]');await click('#preferencesForm button');await until(()=>evaluate(`document.body.classList.contains('compact')`));
        await click('#addFaq');await value('#faqRows [name=pregunta]','¿Cómo solicito soporte?');await value('#faqRows [name=respuesta]','Abre una consulta administrativa.');await click('#faqForm button.ad-primary');
        await until(()=>evaluate(`document.querySelector('#faqForm button.ad-primary').disabled===false`));
        assert.equal(await evaluate(`document.querySelectorAll('#faqRows fieldset').length`),1);
        await click('[data-remove-faq]');assert.equal(await evaluate(`document.querySelectorAll('#faqRows fieldset').length`),0);
    });
}
module.exports={createFixture,testWorkspace};
