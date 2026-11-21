require('./support/isolate-database.cjs');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

let state, calls, affiliateReads, writes, lock = Promise.resolve();
function reset() {
    state = { ready: true, links: [], audit: [], auditFailure: false, schemaMissing: false,
        users: [{id:1,rol_id:1,estado:'ACTIVO'},{id:2,rol_id:2,estado:'ACTIVO'},{id:3,rol_id:3,estado:'ACTIVO'},{id:4,rol_id:4,estado:'ACTIVO'},{id:5,rol_id:3,estado:'ACTIVO'},{id:6,rol_id:1,estado:'ACTIVO'}],
        eps: [{id:'A',nombre:'EPS Alfa',activa:true},{id:'B',nombre:'EPS Beta',activa:true},{id:'C',nombre:'EPS Inactiva',activa:false}],
        pacientes: [
            ...Array.from({length:30},(_,i)=>({id:String(i),nombres:`Persona ${String(i).padStart(2,'0')}`,apellidos:`Apellido ${String(i).padStart(2,'0')}`,eps_id:'A',estado:i%2?'Activo':'ACTIVO',usuario_id:null})),
            {id:'xss',nombres:'<img src=x onerror=alert(1)>',apellidos:'Prueba',eps_id:'A',estado:'Activo'},
            ...Array.from({length:8},(_,i)=>({id:'B'+i,nombres:'Otra persona',apellidos:'Otra EPS',eps_id:'B',estado:'Activo'})),
            ...['Inactivo','Suspendido',null].map((estado,i)=>({id:'I'+i,nombres:'No visible',apellidos:'Excluido',eps_id:'A',estado}))
        ] };
    state.pacientes.forEach((p,i)=>{p.documento=String(900000+i);p.tipo_documento=i%2?'TI':'CC';p.correo=`paciente${i}@example.test`;});
    calls=[]; affiliateReads=0; writes=0;
}
reset();
function bind(farmacia=3,eps='A') { const row={id:state.links.length+1,farmacia_id:farmacia,eps_id:eps,activa:true,version:1};state.links.push(row);return row; }
const pool = { async connect() {
    let working, readonly, unlock;
    return { release() { if(unlock){unlock();unlock=undefined;} }, async query(sql, args=[]) {
        calls.push({sql,args});
        if(sql.startsWith('BEGIN')){readonly=sql.includes('READ ONLY');working=readonly?structuredClone(state):undefined;return{rows:[]};}
        if(sql==='COMMIT'){if(!readonly&&working)state=working;return{rows:[]};}
        if(sql==='ROLLBACK')return{rows:[]};
        if(sql.includes('ORDER BY id FOR UPDATE')) {
            const previous=lock;lock=new Promise(resolve=>{unlock=resolve;});await previous;
            working=structuredClone(state);
            return{rows:working.users.filter(u=>args[0].includes(u.id)).sort((a,b)=>a.id-b.id)};
        }
        const data=working||state;
        if(sql.startsWith('SELECT id,rol_id,estado'))return{rows:data.users.filter(u=>u.id===args[0])};
        if(sql.startsWith('SELECT i.indisunique'))return{rows:[{valido:data.ready}]};
        if(sql.includes('FROM eps_farmacias f LEFT JOIN')) {
            if(data.schemaMissing)throw Object.assign(new Error('private provider password'),{code:'42P01'});
            return{rows:data.links.filter(f=>f.farmacia_id===args[0]&&f.activa).sort((a,b)=>a.id-b.id).slice(0,2).map(f=>({...f,nombre:data.eps.find(e=>e.id===f.eps_id)?.nombre,eps_activa:data.eps.find(e=>e.id===f.eps_id)?.activa}))};
        }
        if(sql.startsWith('SELECT id,nombre FROM eps_entidades'))return{rows:data.eps.filter(e=>e.activa&&(!sql.includes('id=$1')||e.id===args[0])).map(({id,nombre})=>({id,nombre}))};
        if(sql.includes('FROM afiliados a')) {
            affiliateReads++;assert.match(sql,/a\.eps_id=\$1/);assert.match(sql,/lower\(btrim\(a.estado\)\)='activo'/);
            assert.doesNotMatch(sql,/conversaciones|solicitudes|autorizaciones|usuario_id|documento|correo|telefono|direccion|password/);
            const active=data.pacientes.filter(p=>p.eps_id===args[0]&&String(p.estado||'').trim().toLowerCase()==='activo');
            const filtered=active.filter(p=>(p.nombres+' '+p.apellidos).toLowerCase().includes(args[1].toLowerCase()));
            if(sql.startsWith('SELECT count'))return{rows:[{activos:active.length,filtrados:filtered.length}]};
            assert.match(sql,/ORDER BY a.apellidos,a.nombres,a.id LIMIT \$3 OFFSET \$4/);
            return{rows:filtered.sort((a,b)=>a.apellidos.localeCompare(b.apellidos)||a.nombres.localeCompare(b.nombres)||a.id.localeCompare(b.id)).slice(args[3],args[3]+args[2]).map(({nombres,apellidos,estado})=>({nombres,apellidos,estado}))};
        }
        assert.equal(readonly,false,'No SQL mutation may run inside a directory transaction');writes++;
        if(sql.startsWith('UPDATE eps_farmacias')) {data.links.filter(f=>f.farmacia_id===args[0]&&f.activa).forEach(f=>{f.activa=false;f.version++;});return{rows:[]};}
        if(sql.startsWith('INSERT INTO eps_farmacias')) {
            assert.equal(data.links.some(f=>f.farmacia_id===args[1]&&f.activa),false);
            let row=data.links.find(f=>f.farmacia_id===args[1]&&f.eps_id===args[0]);
            if(row){row.activa=true;row.version++;}else{row={id:data.links.length+1,farmacia_id:args[1],eps_id:args[0],activa:true,version:1};data.links.push(row);}return{rows:[row]};
        }
        if(sql.startsWith('INSERT INTO administrative_audit')){if(data.auditFailure)throw new Error('private provider password');data.audit.push(args);return{rows:[]};}
        assert.fail('Unexpected SQL: '+sql);
    }};
}};
require.cache[require.resolve('../src/config/database')].exports=pool;
require.cache[require.resolve('../src/config/prisma')].exports={usuario:{findUnique:async({where})=>state.users.find(u=>u.id===where.id)},$queryRawUnsafe:async(sql,id)=>{assert.match(sql,/SELECT u.id,u.rol_id,u.estado/);return state.users.filter(u=>u.id===id);}};
const origins=new Set();require('../src/config/cors').getAllowedOrigins=()=>origins;
// La fuente original se inyecta; la consulta de Farmacia nunca lee afiliados locales.
require('../src/repositories/afiliados-origen.repository').leerAutorizados=async(epsId,options)=>{
    affiliateReads++;
    const active=state.pacientes.filter(p=>p.eps_id===epsId&&String(p.estado||'').trim().toLowerCase()==='activo');
    const filtered=active.filter(p=>(p.nombres+' '+p.apellidos+' '+(p.documento||'')+' '+(p.correo||'')).toLowerCase().includes(options.buscar.toLowerCase())&&(!options.inicial||p.apellidos.toLowerCase().startsWith(options.inicial.toLowerCase()))&&(!options.tipo_documento||p.tipo_documento===options.tipo_documento));
    const patients=filtered.sort((a,b)=>a.apellidos.localeCompare(b.apellidos)||a.nombres.localeCompare(b.nombres)||a.id.localeCompare(b.id)).slice(options.skip,options.skip+options.take).map(({id,nombres,apellidos,documento,tipo_documento,correo,estado})=>({identificador:id,nombres,apellidos,documento,tipo_documento,correo,estado}));
    return {pacientes:patients,totalActivos:active.length,total:filtered.length};
};
const app=require('../src/app');
let server,origin;const previousSecret=process.env.JWT_SECRET;
before(async()=>{process.env.JWT_SECRET='isolated-pharmacy-eps';server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});origin='http://127.0.0.1:'+server.address().port;origins.add(origin);});
beforeEach(reset);
after(async()=>{await new Promise(resolve=>server.close(resolve));if(previousSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousSecret;});
const token=(id=3,role=3,extra={})=>jwt.sign({id,rol:role,...extra},process.env.JWT_SECRET,{expiresIn:'5m'});
function prepararVidaPlena(){
    state.users=[{id:1,rol_id:1,estado:'ACTIVO'},{id:4,rol_id:3,estado:'ACTIVO'},{id:5,rol_id:3,estado:'ACTIVO'}];
    state.eps=[{id:'1',nombre:'EPS VidaPlena de prueba',activa:true},{id:'2',nombre:'Otra EPS',activa:true}];
    state.pacientes=Array.from({length:50},(_,i)=>({id:'vp-'+i,nombres:`Paciente ${String(i).padStart(2,'0')}`,apellidos:'Prueba',tipo_documento:'CC',documento:'00'+i,correo:`vp${i}@example.test`,estado:'Activo',eps_id:'1'}));
    state.pacientes.push({id:'otra',nombres:'No visible',apellidos:'Otra EPS',estado:'Activo',eps_id:'2'},
        {id:'inactivo',nombres:'No visible',apellidos:'Inactivo',estado:'Inactivo',eps_id:'1'});
}
async function request(path,{id=3,role=3,auth,method='GET',body}={}) {
    const headers={'Content-Type':'application/json'};if(auth!==null)headers.Authorization='Bearer '+(auth||token(id,role));
    const response=await fetch(origin+'/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    return{status:response.status,data:await response.json()};
}
const setEps=(epsId,vinculoActual=null,options={})=>request('/admin/farmacias/3/eps',{id:1,role:1,method:'PUT',body:{epsId,vinculoActual},...options});
test('cuenta vigente, JWT y rol 3 protegen EPS y pacientes; ningún otro rol consulta afiliados',async()=>{
    for(const path of ['/farmacia/eps','/farmacia/usuarios']) {
        for(const [id,role]of [[1,1],[2,2],[4,4]])assert.equal((await request(path,{id,role})).status,403);
        for(const auth of [null,'invalid',jwt.sign({id:3,rol:3},process.env.JWT_SECRET,{expiresIn:-1})])assert.equal((await request(path,{auth})).status,401);
        for(const estado of ['INACTIVO','BLOQUEADO',null]){state.users.find(u=>u.id===3).estado=estado;assert.equal((await request(path)).status,403);}state.users.find(u=>u.id===3).estado='ACTIVO';
        state.users.find(u=>u.id===3).rol_id=2;assert.equal((await request(path)).status,403);state.users.find(u=>u.id===3).rol_id=3;
    }assert.equal(affiliateReads,0);
});
test('sin vínculo o con EPS inactiva no se consulta ni devuelve un paciente',async()=>{
    for(const expected of ['SIN_VINCULO','EPS_NO_VIGENTE']){
        if(expected==='EPS_NO_VIGENTE')bind(3,'C');
        const r=await request('/farmacia/usuarios');assert.equal(r.status,200);assert.equal(r.data.vinculacion.estado,expected);assert.deepEqual(r.data.pacientes,[]);assert.equal(r.data.totalActivos,0);
    }assert.equal(affiliateReads,0);assert.equal(writes,0);
});
test('cada farmacia solo ve afiliados activos de su EPS, incluso sin cuenta local, chats o autorizaciones',async()=>{
    bind(3,'A');bind(5,'B');
    const a=await request('/farmacia/usuarios?tamano=50'),b=await request('/farmacia/usuarios',{id:5});
    assert.equal(a.status,200);assert.equal(a.data.totalActivos,31);assert.equal(a.data.pacientes.length,31);
    assert.equal(b.data.totalActivos,8);assert.equal(b.data.vinculacion.eps.id,'B');
    assert.ok(a.data.pacientes.every(p=>p.apellidos!=='Otra EPS'&&p.apellidos!=='Excluido'));
    assert.deepEqual(Object.keys(a.data.pacientes[0]).sort(),['apellidos','correo','documento','estado','identificador','nombres','tipo_documento']);assert.equal(writes,0);
});
test('búsqueda literal por nombres/apellidos, paginación estable y total activo independiente del filtro',async()=>{
    bind();const first=await request('/farmacia/usuarios?buscar=APELLIDO%202&tamano=2'),second=await request('/farmacia/usuarios?buscar=APELLIDO%202&tamano=2&pagina=2');
    assert.equal(first.data.totalActivos,31);assert.equal(first.data.paginacion.total,10);assert.equal(first.data.paginacion.paginas,5);
    assert.equal(first.data.pacientes.length,2);assert.notDeepEqual(first.data.pacientes,second.data.pacientes);
    for(const value of ['%','_',"'; DROP TABLE usuarios; --",'sin coincidencias']){const r=await request('/farmacia/usuarios?buscar='+encodeURIComponent(value));assert.equal(r.status,200);assert.equal(r.data.paginacion.total,0);}
    const beyond=await request('/farmacia/usuarios?pagina=100');assert.deepEqual(beyond.data.pacientes,[]);assert.equal(beyond.data.totalActivos,31);
});

test('50 afiliados del mismo registro de EPS se leen sin copias y sus cambios se reflejan al consultar',async()=>{
    // Identificadores del caso solicitado; todos los registros son ficticios y aislados.
    prepararVidaPlena();
    let r=await request('/farmacia/usuarios',{id:4});
    assert.equal(r.data.vinculacion.estado,'SIN_VINCULO'); assert.equal(affiliateReads,0);
    const activated=await request('/admin/farmacias/4/eps',{id:1,role:1,method:'PUT',body:{epsId:'1',vinculoActual:null}});
    assert.equal(activated.status,200);assert.equal(state.audit.length,1);
    const writesBeforeReads=writes;
    const first=await request('/farmacia/usuarios?pagina=1',{id:4}), second=await request('/farmacia/usuarios?pagina=2',{id:4});
    assert.equal(first.data.totalActivos,50); assert.equal(first.data.pacientes.length,25); assert.equal(second.data.pacientes.length,25);
    const all=[...first.data.pacientes,...second.data.pacientes];
    assert.equal(new Set(all.map(p=>p.identificador)).size,50);
    assert.deepEqual(all.map(p=>p.identificador).sort(),state.pacientes.filter(p=>p.eps_id==='1'&&p.estado==='Activo').map(p=>p.id).sort());
    assert.equal((await request('/farmacia/usuarios',{id:5})).data.pacientes.length,0);
    // Cambia el registro compartido de origen, no una tabla de Farmacia.
    state.pacientes[0].nombres='Nombre actualizado por EPS';
    state.pacientes[1].estado='Inactivo'; state.pacientes[2].eps_id='2';
    r=await request('/farmacia/usuarios?buscar=actualizado',{id:4});
    assert.equal(r.data.totalActivos,48); assert.equal(r.data.paginacion.total,1);
    assert.equal(r.data.pacientes[0].nombres,'Nombre actualizado por EPS');
    assert.equal(state.pacientes.length,52); assert.equal(writes,writesBeforeReads);
});

test('navegador: vínculo autorizado por endpoint permite ver 50 IDs únicos en dos páginas y filtrar sin copiar', {timeout:90000},async t=>{
    const fs=require('node:fs');
    if(!fs.existsSync(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')){t.skip('Edge no disponible');return;}
    prepararVidaPlena();
    assert.equal((await request('/farmacia/usuarios',{id:4})).data.vinculacion.estado,'SIN_VINCULO');
    assert.equal((await request('/admin/farmacias/4/eps',{id:1,role:1,method:'PUT',body:{epsId:'1',vinculoActual:null}})).status,200);
    const writesBeforeReads=writes;
    const browser=await require('./support/afiliados-edge.cjs').abrirEdge();const {send,evaluate,until}=browser;
    try{
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token(4,3))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:4,rol:3,nombre:'Farmacia fixture local'}));`});
        await send('Page.navigate',{url:origin+'/pages/farmacia-usuarios.html'});
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===25'));
        assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosTotal").textContent'),'50');
        const ids=()=>evaluate(`Array.from(document.querySelectorAll('#farmaciaUsuariosRows td[data-label="Identificador de afiliación"]'),e=>e.textContent)`);
        const primera=await ids();
        await evaluate('document.querySelector("#farmaciaUsuariosNext").click()');
        await until(()=>evaluate('document.querySelector("#farmaciaUsuariosPage").textContent.includes("Página 2 de 2")'));
        const segunda=await ids();
        assert.equal(segunda.length,25);assert.equal(new Set([...primera,...segunda]).size,50);
        assert.deepEqual([...primera,...segunda].sort(),state.pacientes.filter(p=>p.eps_id==='1'&&p.estado==='Activo').map(p=>p.id).sort());
        await evaluate('document.querySelector("#farmaciaUsuariosBuscar").value="vp0@example.test";document.querySelector("#farmaciaUsuariosEstado").value="activos";document.querySelector("#farmaciaUsuariosFilter").requestSubmit()');
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===1'));
        assert.deepEqual(await ids(),['vp-0']);
        state.pacientes[0].correo='cambiado@example.test';
        await evaluate('document.querySelector("#farmaciaUsuariosRefresh").click()');
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===0'));
        assert.equal(writes,writesBeforeReads);assert.deepEqual(browser.errores,[]);
    }finally{await browser.cerrar();}
});
test('parámetros y claims del frontend nunca cambian la EPS consultada',async()=>{
    bind();for(const query of ['eps_id=B','epsId=B','farmacia_id=5','estado=Inactivo','pagina=0','tamano=51','buscar=a&buscar=b','buscar='+ 'a'.repeat(151)])assert.equal((await request('/farmacia/usuarios?'+query)).status,400);
    assert.equal((await request('/farmacia/eps?epsId=B')).status,400);assert.equal(affiliateReads,0);
    const r=await request('/farmacia/usuarios',{auth:token(3,3,{eps_id:'B',farmacia_id:5})});assert.equal(r.data.vinculacion.eps.id,'A');
    for(const path of ['/farmacia/eps','/farmacia/usuarios'])for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await request(path,{method,body:{epsId:'B'}})).status,404);
    assert.equal(writes,0);
});
test('múltiples vínculos activos o esquema incompleto fallan cerrados, sin secretos ni pacientes',async()=>{
    bind(3,'A');bind(3,'B');let r=await request('/farmacia/usuarios');assert.equal(r.status,409);assert.equal(r.data.pacientes,undefined);assert.equal(affiliateReads,0);
    state.schemaMissing=true;r=await request('/farmacia/usuarios');assert.equal(r.status,503);assert.ok(!JSON.stringify(r.data).includes('password'));
});

test('directorio: correo y tipo documental filtran solo registros de la EPS vinculada',async()=>{
    bind();
    const email=await request('/farmacia/usuarios?buscar=paciente0%40example.test');
    assert.equal(email.status,200);assert.equal(email.data.pacientes.length,1);
    assert.equal(email.data.pacientes[0].tipo_documento,'CC');assert.equal(email.data.pacientes[0].correo,'paciente0@example.test');
    const tipo=await request('/farmacia/usuarios?tipo_documento=ti');
    assert.equal(tipo.data.paginacion.total,15);assert.ok(tipo.data.pacientes.every(p=>p.tipo_documento==='TI'));
    assert.equal((await request('/farmacia/usuarios?buscar=paciente31%40example.test')).data.paginacion.total,0);
    for(const tipo of ['CC%20','123','CC&tipo_documento=TI'])assert.equal((await request('/farmacia/usuarios?tipo_documento='+tipo)).status,400);
    assert.equal(writes,0);
});
test('solo administrador vigente puede consultar o cambiar vínculos, antes de toda mutación',async()=>{
    for(const [id,role]of [[2,2],[3,3],[4,4]])for(const method of ['GET','PUT'])assert.equal((await request('/admin/farmacias/3/eps',{id,role,method,body:method==='PUT'?{epsId:'A',vinculoActual:null}:undefined})).status,403);
    state.users.find(u=>u.id===1).estado='INACTIVO';assert.equal((await setEps('A')).status,403);assert.equal(writes,0);
});
test('sin índice único instalado se rechaza la escritura sin desactivar ni crear vínculos',async()=>{
    state.ready=false;assert.equal((await setEps('A')).status,503);assert.equal(writes,0);assert.deepEqual(state.links,[]);
    const info=await request('/admin/farmacias/3/eps',{id:1,role:1});assert.equal(info.status,200);assert.equal(info.data.escrituraHabilitada,false);
});
test('crear, cambiar y reactivar EPS preserva una sola activa y registra auditoría en la misma transacción',async()=>{
    let saved=await setEps('A');assert.equal(saved.status,200);let current=saved.data.vinculoActual;
    saved=await setEps('B',{id:current.id,version:current.version});assert.equal(saved.status,200);
    assert.equal(state.links.filter(f=>f.activa).length,1);assert.equal((await request('/farmacia/usuarios')).data.totalActivos,8);
    current=saved.data.vinculoActual;saved=await setEps('A',{id:current.id,version:current.version});assert.equal(saved.status,200);
    assert.equal(state.links.length,2);assert.equal(state.links.filter(f=>f.activa).length,1);assert.equal(state.audit.length,3);
    const count=writes;current=saved.data.vinculoActual;assert.equal((await setEps('A',{id:current.id,version:current.version})).data.sinCambios,true);assert.equal(writes,count);
});
test('dos administradores concurrentes con estado anterior vacío no crean dos vínculos',async()=>{
    const results=await Promise.all([setEps('A'),setEps('B',null,{id:6,role:1})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal(state.links.filter(f=>f.activa).length,1);assert.equal(state.audit.length,1);
    assert.ok(calls.some(c=>c.sql.includes('ORDER BY id FOR UPDATE')));
});
test('conflictos de versión, EPS no vigente y campos no permitidos no modifican relaciones',async()=>{
    assert.equal((await setEps('C')).status,400);assert.equal((await setEps('desconocida')).status,400);
    assert.equal((await request('/admin/farmacias/3/eps',{id:1,role:1,method:'PUT',body:{epsId:'A',vinculoActual:null,rol:3}})).status,400);
    bind();assert.equal((await setEps('B',{id:1,version:99})).status,409);assert.equal(writes,0);
});
test('fallo de auditoría revierte también la nueva EPS; no filtra mensajes privados',async()=>{
    bind();state.auditFailure=true;const before=structuredClone(state.links);const r=await setEps('B',{id:1,version:1});
    assert.equal(r.status,503);assert.deepEqual(state.links,before);assert.equal(state.audit.length,0);assert.ok(!JSON.stringify(r.data).includes('password'));
});
test('navegador: directorio EPS de solo lectura, búsqueda, paginación, cambio de EPS y revocación', { timeout:90000 },async t=>{
    const fs=require('node:fs');
    if(!fs.existsSync(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')){t.skip('Edge no disponible');return;}
    bind();const browser=await require('./support/afiliados-edge.cjs').abrirEdge();const {send,evaluate,until}=browser;
    try{
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token())});sessionStorage.setItem('saludclick_user',JSON.stringify({id:3,rol:3,nombre:'Farmacia ficticia'}));`});
        await send('Page.navigate',{url:origin+'/pages/farmacia-usuarios.html'});
        try{await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===25'));}
        catch(error){const diagnostic=await evaluate(`({path:location.pathname,access:document.querySelector('#farmaciaAccessStatus')?.textContent,status:document.querySelector('#farmaciaUsuariosStatus')?.textContent,eps:document.querySelector('#farmaciaLinkedEps')?.textContent})`);throw new Error(error.message+' '+JSON.stringify({diagnostic,errors:browser.errores}));}
        assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosTotal").textContent'),'31');
        assert.match(await evaluate('document.querySelector("#farmaciaLinkedEps").textContent'),/EPS Alfa/);
        assert.equal(await evaluate('document.querySelector("td[data-label=Documento]").textContent'),'900000');
        assert.equal(await evaluate(`document.querySelector('td[data-label="Tipo de documento"]').textContent`),'CC');
        assert.equal(await evaluate('document.querySelector("td[data-label=Correo]").textContent'),'paciente0@example.test');
        await evaluate('document.querySelector("#farmaciaUsuariosBuscar").value="paciente0@example.test";document.querySelector("#farmaciaUsuariosEstado").value="activos";document.querySelector("#farmaciaUsuariosFilter").requestSubmit()');
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===1'));
        await send('Page.reload');await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===1&&document.querySelector("#farmaciaUsuariosEstado").value==="activos"'));
        await evaluate('document.querySelector("#farmaciaUsuariosEstado").value="inactivos";document.querySelector("#farmaciaUsuariosFilter").requestSubmit()');
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===0'));
        await evaluate('document.querySelector("#farmaciaUsuariosClear").click()');await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===25'));
        await evaluate('document.querySelector("#farmaciaUsuariosBuscar").value="900000";document.querySelector("#farmaciaUsuariosFilter").requestSubmit()');
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===1'));
        assert.match(await evaluate('document.querySelector("#farmaciaUsuariosRows").textContent'),/Persona 00/);
        await evaluate('document.querySelector("#farmaciaUsuariosClear").click()');await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===25'));
        await evaluate('document.querySelector("#farmaciaUsuariosNext").click()');
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===6'));
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaUsuariosRows img").length'),0);
        await evaluate(`document.querySelector('#farmaciaUsuariosBuscar').value='APELLIDO 2';document.querySelector('#farmaciaUsuariosFilter').requestSubmit()`);
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===10'));
        assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosTotal").textContent'),'31');
        await send('Page.reload');await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===10&&document.querySelector("#farmaciaUsuariosBuscar").value==="APELLIDO 2"'));
        for(const width of [1440,820,390]){
            await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
            assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
            assert.ok(await evaluate(`document.querySelector('#farmaciaUsuarios .farmacia-pagination').getBoundingClientRect().top >= document.querySelector('#farmaciaUsuariosTable').getBoundingClientRect().bottom - 1`),'La paginación debe quedar después de la tabla, sin superponer el encabezado');
            await require('./support/farmacia-panel-browser.cjs').capture(send,'usuarios-eps-'+width);
        }
        await evaluate('document.querySelector("#farmaciaUsuariosClear").click()');await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===25'));
        state.schemaMissing=true;
        await evaluate('document.querySelector("#farmaciaUsuariosRefresh").click()');
        await until(()=>evaluate('document.querySelector("#farmaciaUsuariosStatus").getAttribute("role")==="alert"'));
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length'),0);
        assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosTable").hidden'),true);
        assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosTotal").textContent'),'—');
        assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosBuscar").disabled'),true);
        assert.doesNotMatch(await evaluate('document.querySelector("#farmaciaLinkedEps").textContent'),/EPS Alfa/);
        state.schemaMissing=false;
        await evaluate('document.querySelector("#farmaciaUsuariosRefresh").click()');
        await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===25'));
        const current=state.links[0];assert.equal((await setEps('B',{id:current.id,version:current.version})).status,200);
        await evaluate('document.querySelector("#farmaciaUsuariosRefresh").click()');await until(()=>evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length===8'));
        assert.match(await evaluate('document.querySelector("#farmaciaLinkedEps").textContent'),/EPS Beta/);
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaUsuariosRows button").length'),0);
        state.links.forEach(f=>{f.activa=false;});const before=affiliateReads;
        await evaluate('document.querySelector("#farmaciaUsuariosRefresh").click()');await until(()=>evaluate('document.querySelector("#farmaciaUsuariosTable").hidden===true&&document.querySelector("#farmaciaUsuariosBuscar").disabled'));
        assert.equal(affiliateReads,before);assert.equal(await evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length'),0);
        assert.match(await evaluate('document.querySelector("#farmaciaUsuariosStatus").textContent'),/No tienes una EPS/);
        assert.deepEqual(browser.errores,[]);
    }finally{await browser.cerrar();}
});
