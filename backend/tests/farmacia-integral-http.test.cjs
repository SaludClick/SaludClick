require('./support/isolate-database.cjs');
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const jwt=require('jsonwebtoken');const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {Server}=require('socket.io');const ExcelJS=require('exceljs');
let fixture,db,origin,server,io,app,privateTestFile;
const trace=[];
const old={secret:process.env.JWT_SECRET,operation:process.env.FARMACIA_OPERACION_ENABLED,notifications:process.env.FARMACIA_NOTIFICACIONES_ENABLED,stock:process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED};
const token=(id,role)=>jwt.sign({id,rol:role},'farmacia-integral-isolated',{expiresIn:'1h'});
const match=(row,where={})=>Object.entries(where).every(([key,value])=>key==='AND'?value.every(w=>match(row,w)):key==='OR'?value.some(w=>match(row,w)):value&&typeof value==='object'?Object.entries(value).every(([op,v])=>op==='mode'||(op==='not'?row[key]!==v:op==='contains'?String(row[key]||'').toLowerCase().includes(v.toLowerCase()):op==='in'?v.includes(row[key]):op==='gt'?row[key]>v:op==='gte'?row[key]>=v:op==='lt'?row[key]<v:op==='lte'?row[key]<=v:false)):row[key]===value);
before(async()=>{
    process.env.JWT_SECRET='farmacia-integral-isolated';process.env.FARMACIA_OPERACION_ENABLED='false';process.env.FARMACIA_NOTIFICACIONES_ENABLED='true';
    fixture=await require('./support/farmacia-postgres.cjs').preparar();db=fixture.db;
    process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED='false';
    await db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261117180000_farmacia_inventario_propio/migration.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261117200000_farmacia_ingreso_referencia_unica/migration.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261118230000_medicamento_stock_minimo/migration.sql'),'utf8'));
    require.cache[require.resolve('../src/config/database')].exports=fixture.pool;
    const notificationRows=async()=> (await db.query('SELECT * FROM notificaciones_farmacia')).rows;
    const medRows=async()=> (await db.query('SELECT m.*,json_build_object(\'nombre\',c.nombre) AS categoria FROM medicamentos m JOIN categorias c ON c.id=m.categoria_id')).rows;
    const projection=(row,select)=>select?Object.fromEntries(Object.keys(select).map(k=>[k,row[k]])):row;
    const medications={findMany:async({where={},skip=0,take,select}={})=>(await medRows()).filter(r=>match(r,where)).sort((a,b)=>a.nombre.localeCompare(b.nombre)||a.id-b.id).slice(skip,take==null?undefined:skip+take).map(r=>projection(r,select)),count:async({where={}}={})=>(await medRows()).filter(r=>match(r,where)).length,findUnique:async({where,select})=>{const r=(await medRows()).find(r=>r.id===where.id);return r?projection(r,select):null;}};
    const notifications={
        findMany:async({where={},skip=0,take,select}={})=>(await notificationRows()).filter(r=>match(r,where)).sort((a,b)=>b.id-a.id).slice(skip,take==null?undefined:skip+take).map(r=>projection(r,select)),
        count:async({where={}}={})=>(await notificationRows()).filter(r=>match(r,where)).length,
        updateMany:async({where,data})=>{const rows=(await notificationRows()).filter(r=>match(r,where));for(const r of rows)await db.query('UPDATE notificaciones_farmacia SET leida_at=$2 WHERE id=$1',[r.id,data.leida_at]);return{count:rows.length};},
        findFirst:async({where,select})=>{const r=(await notificationRows()).find(r=>match(r,where));return r?projection(r,select):null;}
    };
    const prisma={usuario:{findUnique:async({where})=>(await db.query('SELECT id,rol_id,estado FROM usuarios WHERE id=$1',[where.id])).rows[0]},medicamento:medications,notificacionFarmacia:notifications,
        $queryRawUnsafe:async(sql,...args)=>(await db.query(sql.includes('FROM medicamentos m')?sql:'SELECT id,rol_id,estado FROM usuarios WHERE id=$1',args)).rows};
    prisma.$transaction=fn=>fn(prisma);
    require.cache[require.resolve('../src/config/prisma')].exports=prisma;
    require('../src/repositories/afiliados-origen.repository').leerAutorizados=async(eps,options={})=>{
        const all=(await db.query('SELECT id AS identificador,nombres,apellidos,documento,tipo_documento,estado FROM afiliados WHERE eps_id=$1 AND lower(estado)=$2 ORDER BY apellidos,nombres,id',[eps,'activo'])).rows;
        const filtered=all.filter(r=>(r.nombres+' '+r.apellidos).toLowerCase().includes((options.buscar||'').toLowerCase())&&(!options.inicial||r.apellidos.startsWith(options.inicial)));
        const take=options.take||25,page=options.pagina||1;return{pacientes:filtered.slice((page-1)*take,page*take),totalActivos:all.length,total:filtered.length};
    };
    require('../src/repositories/afiliados-origen.repository').cuentaAutorizada=fixture.origen.cuentaAutorizada;
    const allowedOrigins=new Set();require('../src/config/cors').getAllowedOrigins=()=>allowedOrigins;
    app=require('../src/app');server=http.createServer(app);io=new Server(server);
    server.on('request',(req,res)=>{const entry={url:req.url,status:null};trace.push(entry);res.on('finish',()=>entry.status=res.statusCode);});
    require('../src/sockets/chat.socket').attachChatSocket(io);
    require('../src/sockets/farmacia-notificaciones.socket').attachFarmaciaNotifications(io,app);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;allowedOrigins.add(origin);
});
after(async()=>{await new Promise(resolve=>io.close(resolve));await db?.close();if(privateTestFile)fs.unlinkSync(privateTestFile);for(const [key,value] of [['JWT_SECRET',old.secret],['FARMACIA_OPERACION_ENABLED',old.operation],['FARMACIA_NOTIFICACIONES_ENABLED',old.notifications],['FARMACIA_INVENTARIO_PROPIO_ENABLED',old.stock]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
async function request(route,{id=3,role=3,method='GET',body,auth,headers={}}={}){
    const res=await fetch(origin+'/api'+route,{method,headers:{Authorization:'Bearer '+(auth||token(id,role)),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});const type=res.headers.get('content-type');return{status:res.status,data:type?.includes('json')?await res.json():Buffer.from(await res.arrayBuffer()),headers:res.headers};
}
const med={nombre:'Prueba integral',descripcion:'Medicamento autorizado de prueba',presentacion:'Caja de 10',imagen:'https://images.example.com/prueba.png',categoria_id:1,precio:15,estado:'INACTIVO'};
test('HTTP: sin activación, dashboard explica ausencia de cifras y Solicitudes sigue cerrado',async()=>{
    const stats=await request('/farmacia/dashboard/estadisticas');assert.equal(stats.status,200);assert.equal(stats.data.disponible,false);assert.equal(stats.data.indicadores,null);
    assert.equal((await request('/farmacia/pedidos')).status,503);assert.equal((await request('/farmacia/medicamentos',{method:'POST',body:med})).status,503);
    assert.equal((await request('/farmacia/dashboard/estadisticas?farmaciaId=4')).status,400);
});
test('HTTP: chat rechaza Farmacia y EPS; accesos clínicos no dependen del rol declarado por el cliente',async()=>{
    for(const role of [3,4])assert.equal((await request('/chat/conversaciones',{role})).status,403);
    assert.equal((await request('/farmacia/pedidos',{role:2,id:2})).status,403);
    assert.equal((await request('/farmacia/pedidos',{auth:'invalid'})).status,401);
});
test('HTTP con PostgreSQL: asignación y búsqueda respetan farmacia, EPS y roles; no exponen pagos ni archivos',async()=>{
    process.env.FARMACIA_OPERACION_ENABLED='true';
    assert.equal((await request('/admin/farmacias/solicitudes/1/asignacion',{method:'POST',body:{farmaciaId:3}})).status,403);
    assert.equal((await request('/admin/farmacias/solicitudes/1/asignacion',{id:1,role:1,method:'POST',body:{farmaciaId:3}})).status,201);
    const result=await request('/farmacia/pedidos?paciente=Ana');assert.equal(result.status,200);assert.equal(result.data.pedidos.length,1);assert.equal(result.data.pedidos[0].usuario.nombre,'Ana');assert.equal(result.data.pedidos[0].pagos,undefined);assert.equal(result.data.pedidos[0].direccion,undefined);
    assert.equal((await request('/farmacia/pedidos/1',{id:4})).status,404);
    assert.equal((await request('/farmacia/pedidos?farmacia_id=4')).status,400);
    assert.equal((await request('/farmacia/pedidos?desde=2026-02-31')).status,400);
    const stats=await request('/farmacia/dashboard/estadisticas');assert.equal(stats.status,200);assert.equal(stats.data.indicadores.solicitudesPendientes,1);
});
test('HTTP con PostgreSQL: catálogo autorizado se refleja en catálogo compartido y registra auditoría',async()=>{
    assert.equal((await request('/farmacia/medicamentos',{method:'POST',body:med})).status,403);
    assert.equal((await request('/admin/farmacias/3/catalogo-autorizaciones',{id:1,role:1,method:'PUT',body:{puedeCrear:true,medicamentos:[]}})).status,200);
    for(const imagen of ['http://example.com/imagen.png','https://127.0.0.1/imagen.png','https://usuario@example.com/imagen.png']){
        assert.equal((await request('/farmacia/medicamentos',{method:'POST',body:{...med,imagen}})).status,400);
    }
    for (const contenido of ['<svg xmlns="http://www.w3.org/2000/svg"/>','contenido inválido']) {
        const rejected = await request('/farmacia/medicamentos',{method:'POST',body:{...med,imagen:'',foto:Buffer.from(contenido).toString('base64')}});
        assert.equal(rejected.status,400);
        assert.equal(rejected.data.codigo,'FOTO_MEDICAMENTO_INVALIDA');
    }
    const created=await request('/farmacia/medicamentos',{method:'POST',body:med});assert.equal(created.status,201);assert.equal(created.data.medicamento.stock,0);
    const id=created.data.medicamento.id;
    assert.equal((await request('/farmacia/medicamentos/'+id,{id:4,method:'PATCH',body:{...med,version:1}})).status,403);
    const patient=()=>request('/medicamentos',{id:2,role:2});
    const publicCatalog=async()=> (await (await fetch(origin+'/api/medicamentos/publico?buscar=Prueba')).json()).medicamentos;
    assert.ok(!(await patient()).data.medicamentos.some(m=>m.id===id));
    assert.ok(!(await publicCatalog()).some(m=>m.id===id));
    assert.equal((await request('/farmacia/medicamentos',{method:'POST',body:{...med,nombre:' '+med.nombre.toUpperCase()+' '}})).status,409);
    assert.equal((await request('/farmacia/medicamentos/'+id,{method:'PATCH',body:{...med,nombre:'Prueba editada',version:1,estado:'DISPONIBLE'}})).status,200);
    const catalog=await request('/medicamentos');assert.equal(catalog.status,200);assert.equal(catalog.data.medicamentos.find(m=>m.id===id).imagen,med.imagen);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_catalogo_auditoria')).rows[0].n,2);
    assert.ok((await patient()).data.medicamentos.some(m=>m.id===id));
    assert.equal((await publicCatalog()).find(m=>m.id===id).disponible,false);
    assert.equal((await request('/admin/farmacias/4/catalogo-autorizaciones',{id:1,role:1,method:'PUT',body:{puedeCrear:true,medicamentos:[]}})).status,200);
    assert.equal((await request('/farmacia/medicamentos/'+id,{id:4,method:'DELETE',body:{version:2}})).status,404);
    assert.equal((await request('/farmacia/medicamentos/'+id,{method:'DELETE',body:{version:1}})).status,409);
    const reference=(await db.query('INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(1,$1,1,15,15) RETURNING id',[id])).rows[0].id;
    try{
        assert.equal((await request('/farmacia/medicamentos/'+id,{method:'DELETE',body:{version:2}})).status,200);
        assert.equal((await db.query('SELECT medicamento_id FROM detalle_solicitud WHERE id=$1',[reference])).rows[0].medicamento_id,id);
    }finally{
        await db.query('DELETE FROM detalle_solicitud WHERE id=$1',[reference]);
    }
    assert.ok(!(await patient()).data.medicamentos.some(m=>m.id===id));
    assert.ok(!(await publicCatalog()).some(m=>m.id===id));
    assert.deepEqual((await db.query('SELECT id,estado,stock FROM medicamentos WHERE id=$1',[id])).rows,[{id,estado:'INACTIVO',stock:0}]);
});

test('HTTP: foto, cantidad y stock minimo se actualizan con operacion general apagada',async()=>{
    const operation=process.env.FARMACIA_OPERACION_ENABLED;
    const catalog=process.env.FARMACIA_CATALOGO_ENABLED;
    process.env.FARMACIA_OPERACION_ENABLED='false';
    process.env.FARMACIA_CATALOGO_ENABLED='true';
    try {
        const sharp=require('sharp');
        const authorization=await request('/admin/farmacias/3/catalogo-autorizaciones',{
            id:1,role:1,method:'PUT',body:{puedeCrear:true,medicamentos:[]}
        });
        assert.equal(authorization.status,200);
        const png=await sharp({create:{width:10,height:8,channels:3,background:'green'}}).png().toBuffer();
        const webp=await sharp({create:{width:12,height:8,channels:3,background:'blue'}}).webp().toBuffer();
        const input={...med,nombre:'Prueba fotografica',imagen:'',foto:png.toString('base64'),stock:8,stock_minimo:3};
        const created=await request('/farmacia/medicamentos',{method:'POST',body:input});
        assert.equal(created.status,201);
        const {id,imagen}=created.data.medicamento;
        const updated=await request('/farmacia/medicamentos/'+id,{method:'PATCH',body:{
            ...input,foto:webp.toString('base64'),estado:'DISPONIBLE',stock:4,stock_minimo:4,stockEsperado:8,version:1
        }});
        assert.equal(updated.status,200);
        const changed=updated.data.medicamento;
        assert.notEqual(changed.imagen,imagen);
        assert.equal((await fetch(origin+imagen)).status,404);
        const photo=await fetch(origin+changed.imagen);
        assert.equal(photo.status,200);
        assert.equal((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).width,12);
        const home=await fetch(origin+'/api/medicamentos/publico?buscar=Prueba%20fotografica');
        assert.equal((await home.json()).medicamentos.find(item=>item.id===id).stockBajo,true);
        assert.equal((await request('/farmacia/medicamentos/'+id,{method:'DELETE',body:{version:2}})).status,200);
        assert.deepEqual((await db.query('SELECT estado,stock,stock_minimo FROM medicamentos WHERE id=$1',[id])).rows,
            [{estado:'INACTIVO',stock:4,stock_minimo:4}]);
    } finally {
        process.env.FARMACIA_OPERACION_ENABLED=operation;
        if(catalog===undefined)delete process.env.FARMACIA_CATALOGO_ENABLED;else process.env.FARMACIA_CATALOGO_ENABLED=catalog;
    }
});

test('HTTP: ambos catálogos ocultan medicamentos con existencias inválidas',async()=>{
    const {rows:[{id}]}=await db.query(`INSERT INTO medicamentos
        (nombre,descripcion,presentacion,categoria_id,precio,stock,estado)
        VALUES('Existencias contradictorias','Prueba','Caja',1,0,5,'AGOTADO') RETURNING id`);
    const patient=await request('/medicamentos',{id:2,role:2});
    assert.equal(patient.status,200);
    assert.ok(!patient.data.medicamentos.some(item=>item.id===id));
    const home=await fetch(origin+'/api/medicamentos/publico?buscar=Existencias');
    assert.equal(home.status,200);
    assert.ok(!(await home.json()).medicamentos.some(item=>item.id===id));
});

test('Edge: fotografia HTTPS de medicamentos en Farmacia, Portada y Paciente',{timeout:45000},async()=>{
    const url='https://images.example.com/catalogo-edge.png';
    const {rows:[{id}]}=await db.query(`INSERT INTO medicamentos
        (nombre,descripcion,presentacion,categoria_id,precio,stock,estado,imagen)
        VALUES('Imagen HTTPS de prueba','Prueba aislada','Caja',1,0,8,'DISPONIBLE',$1) RETURNING id`,[url]);
    const image=await require('sharp')({create:{width:120,height:80,channels:3,background:'#146c43'}}).png().toBuffer();
    const browser=await require('./support/afiliados-edge.cjs').abrirEdge();
    try {
        const {send,evaluate,until}=browser;
        const imageResponses = [];
        browser.onEvent('Fetch.requestPaused',event=>{imageResponses.push(send('Fetch.fulfillRequest',{
            requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],
            body:image.toString('base64')
        }).then(()=>null,error=>error));});
        await send('Fetch.enable',{patterns:[{urlPattern:url}]});
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`
            const pharmacy = location.pathname.includes('/farmacia-medicamentos');
            if(location.pathname!=='/'){
                sessionStorage.setItem('saludclick_token',pharmacy?${JSON.stringify(token(3,3))}:${JSON.stringify(token(2,2))});
                sessionStorage.setItem('saludclick_user',JSON.stringify(pharmacy?{id:3,rol:3}:{id:2,rol:2}));
            }
        `});
        for(const [route,selector] of [
            ['/pages/farmacia-medicamentos.html','#farmaciaMedicamentos img'],
            ['/','#catalogo-publico-lista img'],
            ['/pages/medicamentos.html','#catalogoMedicamentos img']
        ]){
            await send('Page.navigate',{url:origin+route});
            await until(()=>evaluate(`(()=>{
                const photo=[...document.querySelectorAll(${JSON.stringify(selector)})].find(img=>img.src===${JSON.stringify(url)});
                if(!photo)return false;
                photo.scrollIntoView();
                return photo.complete&&photo.naturalWidth===120;
            })()`)).catch(error=>{throw new Error(route+': '+error.message);});
        }
        assert.ok((await Promise.all(imageResponses)).every(error=>error===null));
    } finally {
        await browser.cerrar();
        await db.query('DELETE FROM medicamentos WHERE id=$1',[id]);
    }
});

test('Edge: Medicamentos crea, edita, publica y retira en ambos catálogos con operación general apagada',{timeout:60000},async()=>{
    const previousOperation=process.env.FARMACIA_OPERACION_ENABLED;
    const previousCatalog=process.env.FARMACIA_CATALOGO_ENABLED;
    process.env.FARMACIA_OPERACION_ENABLED='false';
    process.env.FARMACIA_CATALOGO_ENABLED='true';
    let browser;
    try {
        const permissions=await request('/admin/farmacias/3/catalogo-autorizaciones',{id:1,role:1,method:'PUT',body:{puedeCrear:true,medicamentos:[]}});
        assert.equal(permissions.status,200);
        browser=await require('./support/afiliados-edge.cjs').abrirEdge();
        const { send,evaluate,until,onEvent }=browser;
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`
            const pharmacy = location.pathname.includes('/farmacia-medicamentos');
            const credentials = pharmacy ? ${JSON.stringify({id:3,rol:3,nombre:'Farmacia aislada'})} : ${JSON.stringify({id:2,rol:2,nombre:'Paciente aislado'})};
            if (location.pathname !== '/') {
                sessionStorage.setItem('saludclick_token',pharmacy ? ${JSON.stringify(token(3,3))} : ${JSON.stringify(token(2,2))});
                sessionStorage.setItem('saludclick_user',JSON.stringify(credentials));
            } else {
                sessionStorage.removeItem('saludclick_token');
                sessionStorage.removeItem('saludclick_user');
            }
        `});
        const farm='/pages/farmacia-medicamentos.html';
        const visit=path=>send('Page.navigate',{url:origin+path});
        const name='Acetaminofén';
        const edited=name;
        const sharp=require('sharp');
        const firstPhoto=await sharp({create:{width:12,height:10,channels:3,background:'#137762'}}).png().toBuffer();
        const secondPhoto=await sharp({create:{width:14,height:11,channels:3,background:'#214a79'}}).jpeg().toBuffer();
        const selectPhoto=(photo,type,file)=>`(()=>{
            const field=document.getElementById('farmaciaMedicamentoForm').elements.foto;
            const event=new DataTransfer();
            event.items.add(new File([Uint8Array.from(atob(${JSON.stringify(photo.toString('base64'))}),c=>c.charCodeAt(0))],${JSON.stringify(file)},{type:${JSON.stringify(type)}}));
            field.files=event.files;
            field.dispatchEvent(new Event('change'));
        })()`;
        const savedPhoto=async name=> (await db.query('SELECT id,imagen,precio FROM medicamentos WHERE nombre=$1',[name])).rows[0];
        await visit(farm);
        await until(()=>evaluate('document.getElementById("farmaciaNuevoMedicamento")?.disabled === false'));
        await evaluate(`(()=>{document.getElementById('farmaciaNuevoMedicamento').click();
            const form=document.getElementById('farmaciaMedicamentoForm');
            for(const [key,value] of Object.entries(${JSON.stringify({...med,nombre:name,estado:'DISPONIBLE',imagen:'',stock:20,stock_minimo:5})})) if(form.elements[key])form.elements[key].value=value;
        })()`);
        await evaluate(selectPhoto(firstPhoto,'image/png','foto.png'));
        await until(()=>evaluate('document.getElementById("farmaciaImagenPreview").naturalWidth===12'));
        await evaluate('document.getElementById("farmaciaMedicamentoForm").requestSubmit()');
        await until(()=>evaluate(`document.getElementById('farmaciaMedicamentos')?.textContent.includes(${JSON.stringify(name)})`));
        const beforePhoto=await savedPhoto(name);
        const firstStock=(await request('/farmacia/medicamentos/'+beforePhoto.id)).data.medicamento;
        assert.deepEqual([firstStock.stock,firstStock.stock_minimo,firstStock.stockBajo],[20,5,false]);
        const publicFirst=(await (await fetch(origin+'/api/medicamentos/publico?buscar='+encodeURIComponent(name))).json()).medicamentos.find(item=>item.id===beforePhoto.id);
        assert.deepEqual([publicFirst.disponible,publicFirst.stockBajo],[true,false]);
        const patientFirst=(await request('/medicamentos',{id:2,role:2})).data.medicamentos.find(item=>item.id===beforePhoto.id);
        assert.deepEqual([patientFirst.stock,patientFirst.stock_minimo,patientFirst.estado],[20,5,'DISPONIBLE']);
        assert.match(beforePhoto.imagen,/^\/api\/medicamentos\/fotos\/.*\.webp$/);
        const readBefore=await fetch(origin+beforePhoto.imagen);
        assert.equal(readBefore.status,200);
        assert.equal(readBefore.headers.get('content-type'),'image/webp');
        assert.equal((await sharp(Buffer.from(await readBefore.arrayBuffer())).metadata()).width,12);
        const denied=await request('/farmacia/medicamentos/'+beforePhoto.id,{id:4,method:'PATCH',body:{...med,imagen:'',version:1,foto:secondPhoto.toString('base64')}});
        assert.ok([403,404].includes(denied.status));
        assert.equal((await savedPhoto(name)).imagen,beforePhoto.imagen);
        await evaluate(`Array.from(document.querySelectorAll('#farmaciaMedicamentos tr')).find(row=>row.textContent.includes(${JSON.stringify(name)})).querySelector('button').click()`);
        await until(()=>evaluate('document.getElementById("farmaciaMedicamentoDialog")?.open'));
        await evaluate(`(()=>{const form=document.getElementById('farmaciaMedicamentoForm');
            form.elements.descripcion.value='Descripción actualizada';
            form.elements.stock.value='4';
            form.elements.stock_minimo.value='4';
        })()`);
        await evaluate(selectPhoto(secondPhoto,'image/jpeg','reemplazo.jpg'));
        await until(()=>evaluate('document.getElementById("farmaciaImagenPreview").naturalWidth===14'));
        await evaluate('document.getElementById("farmaciaMedicamentoForm").requestSubmit()');
        await until(()=>evaluate(`[...document.querySelectorAll('#farmaciaMedicamentos tr')].some(row=>row.textContent.includes(${JSON.stringify(edited)})&&row.textContent.includes('Stock bajo'))`));
        const afterPhoto=await savedPhoto(edited);
        const updated=(await request('/farmacia/medicamentos/'+afterPhoto.id)).data.medicamento;
        assert.deepEqual([updated.stock,updated.stock_minimo],[4,4]);
        assert.notEqual(afterPhoto.imagen,beforePhoto.imagen);
        assert.equal((await fetch(origin+beforePhoto.imagen)).status,404);
        const readAfter=await fetch(origin+afterPhoto.imagen);
        assert.equal((await sharp(Buffer.from(await readAfter.arrayBuffer())).metadata()).width,14);
        await visit('/');
        await until(()=>evaluate(`(()=>{const card=[...document.querySelectorAll('#catalogo-publico-lista article')].find(el=>el.textContent.includes(${JSON.stringify(edited)}));if(!card)return false;card.scrollIntoView();return card.textContent.includes('Stock bajo')&&card.querySelector('img').naturalWidth===14;})()`));
        await visit('/pages/medicamentos.html');
        await until(()=>evaluate(`[...document.querySelectorAll('#catalogoMedicamentos .mc-card')].some(el=>el.textContent.includes(${JSON.stringify(edited)})&&el.textContent.includes('Stock bajo')&&el.querySelector('img').naturalWidth===14)`));
        await visit(farm);
        await until(()=>evaluate(`document.getElementById('farmaciaMedicamentos')?.textContent.includes(${JSON.stringify(edited)})`));
        assert.equal(await evaluate('document.querySelector("#medicamentos [data-existencias-part=form], #medicamentos [data-existencias-part=vista], #medicamentos [data-existencias-count]")===null'),true);
        assert.equal(await evaluate('document.querySelectorAll("#medicamentos thead th").length'),7);
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth && getComputedStyle(document.querySelector("#farmaciaMedicamentos tr")).display === "block"'),true);
        await evaluate('document.querySelector("#farmaciaMedicamentos button[data-medication-id]").click()');
        await until(()=>evaluate('document.querySelector("#medicamentos [data-existencias-part=contenido] h3") !== null'));
        await evaluate('document.querySelector("#medicamentos [data-existencias-part=cerrar]").click()');
        await send('Emulation.clearDeviceMetricsOverride');
        assert.equal(await evaluate('document.getElementById("farmaciaMedicamentoForm").elements.namedItem("imagen")===null'),true);
        assert.equal(await evaluate('document.getElementById("farmaciaMedicamentoForm").elements.namedItem("precio")===null'),true);
        let previousStock=4;
        const detail=async()=> (await request('/farmacia/medicamentos/'+afterPhoto.id)).data.medicamento;
        const editStock=async(stock,minimo,expectedStock=previousStock)=>{
            const {data:{ambitos}}=await request('/farmacia/medicamentos/permisos');
            const version=ambitos.find(item=>item.medicamento_id===afterPhoto.id).version;
            return request('/farmacia/medicamentos/'+afterPhoto.id,{method:'PATCH',body:{
                nombre:name,descripcion:'Descripción actualizada',presentacion:med.presentacion,categoria_id:1,
                estado:'DISPONIBLE',version,stock,stock_minimo:minimo,stockEsperado:expectedStock
            }});
        };
        assert.equal((await editStock(-1,5)).status,400);
        assert.equal((await editStock(6,-1)).status,400);
        assert.equal((await editStock(6,5,20)).status,409);
        for(const [cantidad,minimo,bajo] of [[3,5,true],[0,5,false],[10,5,false],[3,0,false]]){
            assert.equal((await editStock(cantidad,minimo)).status,200);
            previousStock=cantidad;
            const pharmacy=await detail();
            const patient=(await request('/medicamentos',{id:2,role:2})).data.medicamentos.find(item=>item.id===afterPhoto.id);
            const publicResult=await (await fetch(origin+'/api/medicamentos/publico?buscar='+encodeURIComponent(name))).json();
            const home=publicResult.medicamentos.find(item=>item.id===afterPhoto.id);
            assert.deepEqual([pharmacy.stock,pharmacy.stock_minimo,pharmacy.stockBajo],[cantidad,minimo,bajo]);
            assert.deepEqual([patient.stock,patient.stock_minimo,patient.estado],[cantidad,minimo,cantidad===0?'AGOTADO':'DISPONIBLE']);
            assert.deepEqual([home.disponible,home.stockBajo],[cantidad>0,bajo]);
            const low=await request('/farmacia/medicamentos?disponibilidad=bajos&buscar='+encodeURIComponent(name));
            assert.equal(low.data.medicamentos.some(item=>item.id===afterPhoto.id),bajo);
        }
        await visit(farm);
        await until(()=>evaluate(`document.getElementById('farmaciaMedicamentos')?.textContent.includes(${JSON.stringify(edited)})`));
        const removeListener=onEvent('Page.javascriptDialogOpening',()=>{ void send('Page.handleJavaScriptDialog',{accept:true}); });
        try {
            await send('Runtime.evaluate',{expression:`Array.from(document.querySelectorAll('#farmaciaMedicamentos tr')).find(row=>row.textContent.includes(${JSON.stringify(edited)})).querySelector('.farmacia-catalogo-retirar').click()`,userGesture:true});
            await until(()=>evaluate('document.getElementById("farmaciaMessage")?.textContent.includes("desactivado")'));
        } finally { removeListener(); }
        for(const [url,selector] of [['/','#catalogo-publico-lista'],['/pages/medicamentos.html','#catalogoMedicamentos']]){
            await visit(url);
            await until(()=>evaluate(`document.querySelector('${selector}')?.textContent.includes('Medicamento A')`));
            assert.equal(await evaluate(`document.querySelector('${selector}').textContent.includes(${JSON.stringify(edited)})`),false);
        }

        const {rows: legacy}=await db.query(`INSERT INTO medicamentos
            (nombre,descripcion,categoria_id,precio,stock,estado)
            SELECT 'Original aislado ' || n,'Descripción original',1,0,9,'DISPONIBLE'
            FROM generate_series(1,7) AS n RETURNING id`);
        const ids=legacy.map(item=>item.id);
        const originalActions=`Array.from(document.querySelectorAll('#farmaciaMedicamentos tr'))
            .filter(row=>row.textContent.includes('Original aislado'))
            .map(row=>Array.from(row.querySelectorAll('button'),button=>button.textContent))`;
        await visit(farm);
        await until(async()=> (await evaluate(originalActions)).length===7);
        assert.deepEqual(await evaluate(originalActions),ids.map(()=>['Ver detalle']));

        const authorization=await request('/admin/farmacias/3/catalogo-autorizaciones',{
            id:1,role:1,method:'PUT',body:{puedeCrear:true,medicamentos:[afterPhoto.id,...ids]}
        });
        assert.equal(authorization.status,200);
        const {data:grants}=await request('/farmacia/medicamentos/permisos');
        assert.equal(grants.puedeCrear,true);
        const scopeIds=grants.ambitos.map(item=>item.medicamento_id).sort((a,b)=>a-b);
        assert.deepEqual(scopeIds,[afterPhoto.id,...ids].sort((a,b)=>a-b));
        await visit(farm);
        await until(async()=> (await evaluate(originalActions)).every(buttons=>buttons.includes('Editar medicamento'))
            && (await evaluate(originalActions)).length===7);
        assert.deepEqual(await evaluate(originalActions),ids.map(()=>['Editar medicamento','Eliminar']));
        assert.equal(await evaluate(`Boolean(document.querySelector('#farmaciaMedicamentos [data-medication-id="1"]'))`),true);
        await evaluate(`Array.from(document.querySelectorAll('#farmaciaMedicamentos tr'))
            .find(row=>row.textContent.includes('Original aislado 1')).querySelector('button').click()`);
        await until(()=>evaluate('document.getElementById("farmaciaMedicamentoDialog").open'));
        const formField=name=>`document.getElementById('farmaciaMedicamentoForm').elements.namedItem('${name}')`;
        assert.equal(await evaluate(formField('descripcion')+'.value'),'Descripción original');
        assert.equal(await evaluate(formField('presentacion')+'.value'),'');
        assert.equal(await evaluate(formField('presentacion')+'.required'),false);
        await evaluate(`${formField('stock')}.value='3'; ${formField('stock_minimo')}.value='5'; ${formField('estado')}.value='INACTIVO';`);
        await evaluate(selectPhoto(firstPhoto,'image/png','original.png'));
        await evaluate('document.getElementById("farmaciaMedicamentoForm").requestSubmit()');
        await until(()=>evaluate(`Array.from(document.querySelectorAll('#farmaciaMedicamentos tr'))
            .find(row=>row.textContent.includes('Original aislado 1'))?.textContent.includes('Sin publicar')`));
        const saved=(await request('/farmacia/medicamentos/'+ids[0])).data.medicamento;
        assert.deepEqual([saved.presentacion,saved.stock,saved.stock_minimo,saved.estado],[null,3,5,'INACTIVO']);
        assert.match(saved.imagen,/^\/api\/medicamentos\/fotos\//);
        const homeLegacy=(await (await fetch(origin+'/api/medicamentos/publico?buscar=Original%20aislado')).json()).medicamentos;
        assert.equal(homeLegacy.length,6);
        assert.ok(!homeLegacy.some(item=>item.id===ids[0]));
    } finally {
        await browser?.cerrar();
        if(previousOperation===undefined)delete process.env.FARMACIA_OPERACION_ENABLED;else process.env.FARMACIA_OPERACION_ENABLED=previousOperation;
        if(previousCatalog===undefined)delete process.env.FARMACIA_CATALOGO_ENABLED;else process.env.FARMACIA_CATALOGO_ENABLED=previousCatalog;
    }
});
test('HTTP con PostgreSQL: exportación autenticada respeta todos los filtros y Excel se vuelve a abrir',async()=>{
    const result=await request('/farmacia/inventario/reporte.xlsx?buscar=Medicamento&disponibilidad=disponibles');assert.equal(result.status,200);assert.match(result.headers.get('content-disposition'),/Inventario_SaludClick_.*\.xlsx/);
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(result.data);assert.equal(workbook.worksheets.length,2);assert.equal(workbook.getWorksheet('Inventario').rowCount,3);
    assert.equal((await request('/farmacia/inventario/reporte.xlsx',{role:2,id:2})).status,403);
    assert.equal((await request('/farmacia/inventario/reporte.xlsx?farmacia_id=4')).status,400);
});
test('HTTP con PostgreSQL: notificaciones persisten, cuentan, se leen y rechazan otro destinatario',async()=>{
    const first=await request('/farmacia/notificaciones');
    assert.equal(first.status,200);
    const notice=first.data.notificaciones.find(n=>n.referencia_evento==='solicitud:1:asignada');
    assert.equal(notice.solicitud.paciente,'Ana Uno');
    assert.equal(notice.leida_at,null);
    const id=notice.id;
    assert.equal((await request('/farmacia/notificaciones/'+id+'/leida',{id:4,method:'PATCH',body:{}})).status,404);
    assert.equal((await request('/farmacia/notificaciones/'+id+'/leida',{method:'PATCH',body:{}})).status,200);
    assert.equal((await request('/farmacia/notificaciones/no-leidas/count')).data.noLeidas,first.data.noLeidas-1);
    const history=await request('/farmacia/notificaciones');
    assert.ok(history.data.notificaciones.find(n=>n.id===id).leida_at);
});
test('HTTP con PostgreSQL: consentimiento del paciente protege fórmula, descarga, rutas y archivos',async()=>{
    const filename=require('node:crypto').randomUUID()+'.pdf';
    const root=path.resolve(__dirname,'../private_uploads');
    fs.mkdirSync(root,{recursive:true});
    privateTestFile=path.join(root,filename);
    const objects=[
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'
    ];
    let pdf='%PDF-1.4\n';
    const offsets=objects.map((object,index)=>{
        const offset=pdf.length;
        pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;
        return offset;
    });
    const xref=pdf.length;
    pdf+=`xref\n0 4\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    fs.writeFileSync(privateTestFile,pdf,{flag:'wx'});
    await db.query(`INSERT INTO formulas_medicas(id,usuario_id,nombre_archivo,nombre_original,tipo_mime,ruta_archivo,tamano) VALUES(1,2,$1,'Prueba.pdf','application/pdf','private',$2)`,[filename,pdf.length]);
    assert.equal((await request('/farmacia/pedidos/1/formulas/1')).status,404);
    assert.equal((await request('/formulas/1/solicitud/1',{id:5,role:2,method:'POST',body:{}})).status,404);
    assert.equal((await request('/formulas/1/solicitud/1',{id:2,role:2,method:'POST',body:{}})).status,200);
    const view=await request('/farmacia/pedidos/1/formulas/1');assert.equal(view.status,200);assert.match(view.headers.get('content-disposition'),/^inline; filename="Prueba.pdf"/);assert.equal(view.headers.get('content-type'),'application/pdf');assert.equal(view.headers.get('cache-control'),'no-store');
    assert.equal((await request('/farmacia/pedidos/1/formulas/1?descarga=1')).status,403);
    assert.equal((await request('/farmacia/pedidos/1/formulas/1',{id:4})).status,404);
    assert.equal((await request('/formulas/1/solicitud/1',{id:2,role:2,method:'POST',body:{permiteDescarga:true}})).status,200);
    const extraItem=(await db.query('INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(1,2,2,10,20) RETURNING id')).rows[0].id;
    try {
        const queue=await request('/farmacia/pedidos?id=1');
        assert.equal(queue.status,200);
        const order=queue.data.pedidos[0];
        assert.deepEqual(order.usuario,{nombre:'Ana',apellido:'Uno',tipo_documento:'CC',cedula:'100'});
        assert.deepEqual(order.detalles.map(item=>[item.medicamento.nombre,item.cantidad]),[['Medicamento A',3],['Medicamento B',2]]);
        assert.deepEqual(order.formulas,[{id:1,nombre:'Prueba.pdf',tipo_mime:'application/pdf',permite_descarga:true}]);
        const byDocument=await request('/farmacia/pedidos?documento=100&paciente=Ana&estado=APROBADA&id=1&tamano=1');
        assert.equal(byDocument.status,200);
        assert.deepEqual(byDocument.data.pedidos.map(p=>p.id),[1]);
        assert.equal((await request('/farmacia/pedidos?documento=0100')).data.paginacion.total,0);
        assert.equal((await request('/farmacia/pedidos?documento=100',{id:4})).data.paginacion.total,0);
        assert.equal((await request('/farmacia/pedidos?documento=a&documento=b')).status,400);
        const {rows:[{fecha}]}=await db.query('SELECT fecha FROM solicitudes WHERE id=1');
        try {
            await db.query("UPDATE solicitudes SET fecha='2026-11-19 04:59:59' WHERE id=1");
            assert.deepEqual((await request('/farmacia/pedidos?desde=2026-11-18&hasta=2026-11-18')).data.pedidos.map(p=>p.id),[1]);
            assert.equal((await request('/farmacia/pedidos?desde=2026-11-19')).data.paginacion.total,0);
        } finally {
            await db.query('UPDATE solicitudes SET fecha=$1 WHERE id=1',[fecha]);
        }
    } finally {
        await db.query('DELETE FROM detalle_solicitud WHERE id=$1',[extraItem]);
    }
    const download=await request('/farmacia/pedidos/1/formulas/1?descarga=1');
    assert.equal(download.status,200);
    assert.match(download.headers.get('content-disposition'),/^attachment; filename="Prueba.pdf"/);
    assert.deepEqual(download.data,fs.readFileSync(privateTestFile));
    assert.equal((await request('/farmacia/pedidos/1/formulas/1?descarga=1',{id:4})).status,404);
    await db.query("UPDATE formulas_medicas SET nombre_archivo=$1 WHERE id=1",[require('node:crypto').randomUUID()+'.pdf']);
    assert.equal((await request('/farmacia/pedidos/1/formulas/1')).status,404);
    assert.equal((await fetch(origin+'/private_uploads/'+filename)).status,404);
    assert.deepEqual((await request('/farmacia/pedidos/1')).data.pedido.formulas,[]);
    await db.query("UPDATE formulas_medicas SET nombre_archivo='../fuera.pdf' WHERE id=1");assert.equal((await request('/farmacia/pedidos/1/formulas/1')).status,404);
    await db.query('UPDATE formulas_medicas SET nombre_archivo=$1 WHERE id=1',[filename]);
});
test('HTTP con PostgreSQL: activación exclusiva de Solicitudes conserva el alcance y el historial',async()=>{
    const operation=process.env.FARMACIA_OPERACION_ENABLED;
    const scoped=process.env.FARMACIA_SOLICITUDES_ENABLED;
    const {rows:[link]}=await db.query('SELECT eps_id FROM eps_farmacias WHERE farmacia_id=4');
    process.env.FARMACIA_OPERACION_ENABLED='false';
    process.env.FARMACIA_SOLICITUDES_ENABLED='true';
    try {
        const access=await request('/farmacia/verificar-acceso');
        assert.equal(access.data.operacionHabilitada,false);
        assert.equal(access.data.solicitudesHabilitadas,true);
        assert.equal((await request('/farmacia/dashboard/estadisticas')).data.disponible,false);
        const scopedOrders=await request('/farmacia/pedidos?paciente=Ana');
        assert.equal(scopedOrders.status,200);
        assert.equal(scopedOrders.data.pedidos[0].id,1);
        assert.equal((await request('/farmacia/pedidos/1/formulas/1?descarga=1')).status,200);
        await db.query('UPDATE farmacia_formulas_autorizadas SET autorizado_por=1 WHERE solicitud_id=1 AND formula_id=1');
        try {
            assert.deepEqual((await request('/farmacia/pedidos/1')).data.pedido.formulas,[]);
            assert.equal((await request('/farmacia/pedidos/1/formulas/1')).status,404);
        } finally {
            await db.query('UPDATE farmacia_formulas_autorizadas SET autorizado_por=2 WHERE solicitud_id=1 AND formula_id=1');
        }
        await db.query("UPDATE eps_farmacias SET eps_id='A' WHERE farmacia_id=4");
        assert.deepEqual((await request('/farmacia/pedidos',{id:4})).data.pedidos,[]);
        assert.equal((await request('/farmacia/pedidos/1',{id:4})).status,404);
        for(const query of ['','?descarga=1']){
            assert.equal((await request('/farmacia/pedidos/1/formulas/1'+query,{id:4})).status,404);
        }
        assert.equal((await request('/pedidos/1',{id:2,role:2,method:'DELETE'})).status,409);
        assert.equal((await request('/farmacia/pedidos/1')).status,200);
        await db.query("INSERT INTO farmacia_sesiones(usuario_id,revocadas_at) VALUES(3,now()+interval '1 hour')");
        assert.equal((await request('/farmacia/pedidos')).status,401);
    } finally {
        await db.query('DELETE FROM farmacia_sesiones WHERE usuario_id=3');
        await db.query('UPDATE eps_farmacias SET eps_id=$1 WHERE farmacia_id=4',[link.eps_id]);
        if(operation===undefined)delete process.env.FARMACIA_OPERACION_ENABLED;else process.env.FARMACIA_OPERACION_ENABLED=operation;
        if(scoped===undefined)delete process.env.FARMACIA_SOLICITUDES_ENABLED;else process.env.FARMACIA_SOLICITUDES_ENABLED=scoped;
    }
});
test('Edge: Solicitudes abre la fórmula autorizada y descarga el archivo original',{timeout:60000},async()=>{
    const browser=await require('./support/afiliados-edge.cjs').abrirEdge();
    const downloads=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'saludclick-formula-'));
    try {
        const {send,evaluate,until}=browser;
        await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`
            sessionStorage.setItem('saludclick_token',${JSON.stringify(token(3,3))});
            sessionStorage.setItem('saludclick_user',JSON.stringify({id:3,rol:3,nombre:'Farmacia de prueba'}));
        `});
        await send('Page.navigate',{url:origin+'/pages/farmacia-solicitudes.html'});
        const actions='.farmacia-order .farmacia-formula-actions button';
        await until(()=>evaluate(`document.querySelectorAll('${actions}').length===2`));
        assert.match(await evaluate('document.querySelector(".farmacia-order").textContent'),/Ana Uno.*CC 100.*Medicamento A.*3/s);
        assert.equal(await evaluate(`document.querySelectorAll('${actions}')[1].textContent`),'Descargar PDF');
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
        await evaluate(`document.querySelector('#documentoSolicitudFarmacia').value='0100';document.querySelector('#filtroPedidos').requestSubmit()`);
        await until(()=>evaluate(`document.querySelector('#farmaciaOrdersStatus').textContent.includes('No hay solicitudes')`));
        await evaluate(`document.querySelector('#documentoSolicitudFarmacia').value='100';document.querySelector('#filtroPedidos').requestSubmit()`);
        await until(()=>evaluate(`document.querySelectorAll('${actions}').length===2`));
        assert.equal(await evaluate("location.search.includes('documento')"),false);
        await evaluate("document.querySelector('#farmaciaOrdersClear').click()");
        await until(()=>evaluate("document.querySelector('#farmaciaOrders').getAttribute('aria-busy')==='false'"));
        await send('Page.reload');
        await until(()=>evaluate(`document.querySelectorAll('${actions}').length===2`));
        await send('Runtime.evaluate',{expression:`document.querySelectorAll('${actions}')[0].click()`,userGesture:true});
        await until(async()=> (await send('Target.getTargets')).targetInfos.some(target=>target.type==='page'&&target.url.startsWith('blob:'+origin)));
        await send('Runtime.evaluate',{expression:`document.querySelectorAll('${actions}')[1].click()`,userGesture:true});
        const downloaded=path.join(downloads,'Prueba.pdf');
        await until(()=>fs.existsSync(downloaded));
        assert.deepEqual(fs.readFileSync(downloaded),fs.readFileSync(privateTestFile));
    } finally {
        await browser.cerrar();
        for(const file of fs.readdirSync(downloads))fs.unlinkSync(path.join(downloads,file));
        fs.rmdirSync(downloads);
    }
});
test('navegador con PostgreSQL: dashboard, solicitudes y editor autorizado funcionan y responden en móvil',{timeout:90000},async t=>{
    if(!fs.existsSync(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'))throw new Error('Edge requerido para esta aceptación.');
    const previousOperation=process.env.FARMACIA_OPERACION_ENABLED;
    process.env.FARMACIA_OPERACION_ENABLED='true'; // Only this isolated fixture exercises the full editor and dashboard.
    let browser;
    try{
        await db.exec(`INSERT INTO farmacia_asignaciones(solicitud_id,farmacia_id,asignado_por) VALUES(1,3,1) ON CONFLICT DO NOTHING;
            UPDATE solicitudes SET fecha=(now() AT TIME ZONE 'America/Bogota')::date + time '12:00' WHERE id=1;
            INSERT INTO farmacia_catalogo_autorizaciones(farmacia_id,autorizado_por,puede_crear,activa)
            VALUES(3,1,true,true) ON CONFLICT(farmacia_id) DO UPDATE SET puede_crear=true,activa=true;
            INSERT INTO formulas_medicas(id,usuario_id,nombre_archivo,nombre_original,tipo_mime,ruta_archivo,tamano)
            VALUES(1,2,'fixture.pdf','Formula de prueba','application/pdf','private',1) ON CONFLICT DO NOTHING;`);
        browser=await require('./support/afiliados-edge.cjs').abrirEdge();
        const {send,evaluate,until}=browser;
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token(3,3))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:3,rol:3,nombre:'Farmacia de prueba'}));`});
        await send('Network.setBlockedURLs',{urls:['*://cdnjs.cloudflare.com/*','*://images.example.com/*']});
        await send('Page.navigate',{url:origin+'/pages/farmacia.html'});
        try{await until(()=>evaluate('document.querySelector("[data-dashboard-metric=solicitudesPendientes]")?.textContent==="1"'));}
        catch(e){throw new Error(e.message+' '+JSON.stringify(await evaluate('({path:location.pathname,ready:document.readyState,authorized:document.querySelector("#farmaciaApp")?.dataset.authorized,access:document.querySelector("#farmaciaAccessStatus")?.textContent,status:document.querySelector("#farmaciaDashboardOrdersStatus")?.textContent,metric:document.querySelector("[data-dashboard-metric=solicitudesPendientes]")?.textContent,api:window.SALUDCLICK_API_URL})'))+' '+JSON.stringify(browser.errores)+' '+JSON.stringify(trace.slice(-30)));}
        assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-dashboard-chart]")].map(el=>el.dataset.dashboardChart)'),['meses','pacientes','medicamentos']);
        assert.ok(await evaluate('document.querySelector("#farmaciaDashboardEvolucion")?.textContent.trim().length>0'));
        await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        await until(()=>evaluate('document.querySelector("#menu").getBoundingClientRect().left>=0&&!document.querySelector("#menu").inert'));
        const dashboardShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.resolve(__dirname,'../../docs/calidad/reportes/farmacia-implementacion-dashboard-2026-11-17.png'),Buffer.from(dashboardShot.data,'base64'));
        for(const width of [1440,820,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));}
        await send('Emulation.clearDeviceMetricsOverride');
        await send('Page.navigate',{url:origin+'/pages/farmacia-solicitudes.html'});
        await until(()=>evaluate('document.querySelector("#farmaciaOrders").getAttribute("aria-busy")==="false" && document.querySelector("[data-detail]")!==null'));
        await evaluate('document.querySelector("#documentoSolicitudFarmacia").value="100";document.querySelector("#filtroPedidos").requestSubmit()');
        await until(()=>evaluate('document.querySelectorAll(".farmacia-order").length===1'));
        assert.match(await evaluate('document.querySelector(".farmacia-order").textContent'),/Ana Uno/);
        await evaluate('document.querySelector("[data-detail]").click()');await until(()=>evaluate('document.querySelector("#farmaciaSolicitudDetalleContent").textContent.includes("Historial")'));
        await send('Page.navigate',{url:origin+'/pages/farmacia-medicamentos.html'});
        await until(()=>evaluate('document.querySelector("#farmaciaNuevoMedicamento")?.disabled===false'));
        await evaluate('document.querySelector("#farmaciaNuevoMedicamento").click()');
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
        assert.ok(await evaluate('document.querySelector("#farmaciaMedicamentoDialog").getBoundingClientRect().right<=innerWidth'));
        await evaluate(`(()=>{const f=document.querySelector('#farmaciaMedicamentoForm');for(const [k,v] of Object.entries(${JSON.stringify({...med,nombre:'Alta desde navegador'})})){const input=f.elements.namedItem(k);if(input)input.value=v;}f.requestSubmit();})()`);
        await until(()=>evaluate('document.querySelector("#farmaciaMessage").textContent.includes("Medicamento guardado")'));
        await until(()=>evaluate('document.querySelector("#farmaciaMedicamentos").textContent.includes("Alta desde navegador")'));
        assert.equal(await evaluate('document.querySelector("#medicamentos [data-existencias-part=vista]")'),null);
        assert.equal((await db.query("SELECT stock FROM medicamentos WHERE nombre='Alta desde navegador'")).rows[0].stock,0);
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".farmacia-pagination")).position'),'static');
        const artifact=path.resolve(__dirname,'../../docs/calidad/reportes/farmacia-implementacion-editor-2026-11-17.png');
        const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(artifact,Buffer.from(shot.data,'base64'));
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('saludclick_token',${JSON.stringify(token(2,2))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:2,rol:2,nombre:'Paciente de prueba'}));`});
        await send('Page.navigate',{url:origin+'/pages/formulas.html'});
        await until(()=>evaluate('document.querySelectorAll(".formula-share").length===1'));
        await evaluate('document.querySelector(".formula-share input[type=number]").value="1";document.querySelector(".formula-share").requestSubmit()');
        await until(()=>evaluate('document.querySelector(".formula-share [role=status]").textContent.includes("vinculada")'));
        assert.equal((await db.query('SELECT permite_descarga FROM farmacia_formulas_autorizadas WHERE solicitud_id=1 AND formula_id=1')).rows[0].permite_descarga,false);
        assert.equal((await db.query('SELECT estado FROM formulas_medicas WHERE id=1')).rows[0].estado,'PENDIENTE');
        assert.deepEqual(browser.errores,[]);
    }finally{process.env.FARMACIA_OPERACION_ENABLED=previousOperation;await browser?.cerrar();}
});
test('HTTP con PostgreSQL: solicitud nueva se asigna y notifica por política; reintento no duplica pedidos ni descuenta stock otra vez',async()=>{
    const env=['FARMACIA_OPERACION_ENABLED','FARMACIA_SOLICITUDES_ENABLED'];
    const previous=env.map(key=>process.env[key]);
    process.env.FARMACIA_OPERACION_ENABLED='false';
    process.env.FARMACIA_SOLICITUDES_ENABLED='true';
    let uploadedFile;
    try {
        await db.query('DELETE FROM afiliado_cuentas_origen WHERE usuario_id=5');
        const admin={id:1,role:1,method:'PUT'};
        const setup=await request('/admin/farmacias/rutas-eps/B',{...admin,body:{farmaciaId:4}});
        assert.equal(setup.status,200);
        const identity=await request('/admin/farmacias/4/identidades/5',{...admin,body:{afiliadoId:'b'}});
        assert.equal(identity.status,200);
        await db.query("SELECT setval('formulas_medicas_id_seq',(SELECT max(id) FROM formulas_medicas))");
        const original=fs.readFileSync(privateTestFile);
        const patient={id:5,role:2,method:'POST'};
        const upload=await request('/formulas',{...patient,body:{nombre:'Formula-paciente-prueba.pdf',archivo:'data:application/pdf;base64,'+original.toString('base64')}});
        assert.equal(upload.status,201);
        const formulaId=upload.data.formula.id;
        const {rows:[file]}=await db.query('SELECT nombre_archivo FROM formulas_medicas WHERE id=$1',[formulaId]);
        uploadedFile=path.join(path.dirname(privateTestFile),file.nombre_archivo);
        await db.query("SELECT setval('solicitudes_id_seq',(SELECT max(id) FROM solicitudes))");
        const before=(await db.query('SELECT stock FROM medicamentos WHERE id=1')).rows[0].stock;
        const key=require('node:crypto').randomUUID(),body={items:[{id:1,cantidad:1}],tipoEntrega:'RECOGER',formula:{id:formulaId,permiteDescarga:true},pago:{numero:'4242424242424242',vencimiento:'12/30',cvv:'123',titular:'Paciente de prueba',simulacion:false}};
        const send=()=>request('/pedidos',{...patient,headers:{'Idempotency-Key':key},body});
        const first=await send();assert.equal(first.status,201);assert.equal(first.data.asignacionPendiente,false);
        assert.equal((await db.query('SELECT simulacion FROM pagos WHERE solicitud_id=$1',[first.data.solicitudId])).rows[0].simulacion,true);
        assert.match(first.data.mensaje,/simulado/);
        const second=await send();assert.equal(second.status,201);assert.equal(second.data.solicitudId,first.data.solicitudId);assert.equal(second.data.replayed,true);
        assert.equal((await db.query('SELECT stock FROM medicamentos WHERE id=1')).rows[0].stock,before-1);
        const event=(await db.query('SELECT destinatario_id FROM notificaciones_farmacia WHERE referencia_evento=$1',[`solicitud:${first.data.solicitudId}:asignada`])).rows;assert.deepEqual(event,[{destinatario_id:4}]);
        const orderPath='/farmacia/pedidos/'+first.data.solicitudId;
        assert.equal((await request(orderPath,{id:3})).status,404);
        const queue=await request('/farmacia/pedidos?id='+first.data.solicitudId,{id:4});
        assert.equal(queue.status,200);
        assert.deepEqual(queue.data.pedidos.map(p=>p.id),[first.data.solicitudId]);
        const assigned=await request(orderPath,{id:4});
        assert.equal(assigned.status,200);
        assert.deepEqual(assigned.data.pedido.usuario,{nombre:'Beto',apellido:'Dos',tipo_documento:'CC',cedula:'200'});
        assert.equal(assigned.data.pedido.eps,'EPS B');
        assert.deepEqual(assigned.data.pedido.detalles.map(d=>[d.medicamento.nombre,d.cantidad]),[['Medicamento A',1]]);
        assert.ok(assigned.data.pedido.operacion.bloqueos.includes('PAGO_REAL_NO_APROBADO'));
        for(const suffix of ['', '?descarga=1']){
            const pdf=await request(orderPath+'/formulas/'+formulaId+suffix,{id:4});
            assert.equal(pdf.status,200);
            assert.match(pdf.headers.get('content-disposition'),suffix?/^attachment/:/^inline/);
            assert.deepEqual(pdf.data,original);
            assert.equal((await request(orderPath+'/formulas/'+formulaId+suffix,{id:3})).status,404);
        }
        const changed=await request('/pedidos',{...patient,headers:{'Idempotency-Key':key},body:{...body,formula:{id:formulaId,permiteDescarga:false}}});
        assert.equal(changed.status,409);
        const foreign=await request('/pedidos',{id:2,role:2,method:'POST',headers:{'Idempotency-Key':require('node:crypto').randomUUID()},body});
        assert.equal(foreign.status,400);
        assert.equal((await db.query('SELECT stock FROM medicamentos WHERE id=1')).rows[0].stock,before-1);
        assert.equal((await request('/pedidos/'+first.data.solicitudId,{id:5,role:2,method:'DELETE'})).status,409);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM solicitudes WHERE id=$1',[first.data.solicitudId])).rows[0].n,1);
        const history=await request('/pedidos',{id:5,role:2});assert.equal(history.status,200);assert.ok(history.data.pedidos.some(p=>p.id===first.data.solicitudId));
    } finally {
        if(uploadedFile)fs.unlinkSync(uploadedFile);
        env.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});
    }
});

test('HTTP: existencias propias, varios medicamentos y fórmula, entrega idempotente y métricas aisladas',async()=>{
    assert.equal((await request('/farmacia/existencias')).status,503);
    process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED='true';
    await db.exec(`INSERT INTO medicamentos(id,nombre,descripcion,presentacion,categoria_id,precio,stock,requiere_formula,estado) VALUES(100,'Segundo medicamento','Prueba de varias líneas','Caja',1,10,15,false,'DISPONIBLE');
      INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(1,100,2,10,20);
      UPDATE pagos SET monto=50 WHERE solicitud_id=1;`);
    const receipt={clave:require('node:crypto').randomUUID(),referencia:'Ingreso autorizado HTTP',items:[{medicamentoId:1,cantidad:8},{medicamentoId:100,cantidad:4}]};
    for(const [id,role] of [[3,3],[2,2],[4,4]])assert.equal((await request('/admin/farmacias/3/existencias/ingresos',{id,role,method:'POST',body:receipt})).status,403);
    assert.equal((await request('/admin/farmacias/3/existencias/ingresos',{id:1,role:1,method:'POST',body:receipt})).status,200);
    assert.equal((await request('/admin/farmacias/3/existencias/ingresos',{id:1,role:1,method:'POST',body:receipt})).data.repetido,true);
    assert.equal((await request('/farmacia/existencias?farmaciaId=4')).status,400);
    assert.equal((await request('/farmacia/existencias',{id:4})).data.medicamentos.length,0);
    assert.equal((await request('/farmacia/existencias/1',{id:4})).status,404);
    for(const role of [1,2,4])assert.equal((await request('/farmacia/existencias',{id:role===1?1:2,role})).status,403);
    const detail=await request('/farmacia/pedidos/1');assert.equal(detail.data.pedido.detalles.length,2);assert.equal(detail.data.pedido.formulas[0].id,1);
    assert.equal((await request('/farmacia/pedidos/1/formulas/1')).status,200);
    let delivered;
    for(const [estadoActual,estado,version] of [['APROBADA','PREPARANDO',1],['PREPARANDO','LISTA',2],['LISTA','ENTREGADA',3]]){
        const body={estadoActual,estado,version,clave:require('node:crypto').randomUUID(),recepcion:estado==='ENTREGADA'?'Recibió paciente de prueba':''};
        const response=await request('/farmacia/pedidos/1/estado',{method:'PATCH',body});assert.equal(response.status,200,JSON.stringify(response.data));if(estado==='ENTREGADA')delivered=body;
    }
    assert.equal((await request('/farmacia/pedidos/1/estado',{method:'PATCH',body:delivered})).data.repetido,true);
    const stock=await request('/farmacia/existencias');assert.equal(stock.data.alcance.tipo,'FARMACIA_PROPIA');assert.equal(stock.data.medicamentos.find(m=>m.id===1).stock,5);assert.equal(stock.data.medicamentos.find(m=>m.id===100).entregados,2);
    const excel=await request('/farmacia/existencias/reporte.xlsx');assert.equal(excel.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(excel.data);assert.equal(workbook.getWorksheet('Inventario').getCell('H1').value,'Unidades entregadas');
    const stats=await request('/farmacia/dashboard/estadisticas');assert.equal(stats.data.indicadores.medicamentosDisponibles,2);assert.equal(stats.data.indicadores.medicamentosEntregados,5);assert.equal(stats.data.indicadores.pacientesAtendidos,1);assert.equal(stats.data.indicadores.solicitudesCompletadas,1);
    assert.equal(stats.data.graficos.completadasMes.reduce((n,r)=>n+r.total,0),1);assert.equal(stats.data.alertasStock.length,2);
    const notifications=await request('/farmacia/notificaciones');assert.ok(notifications.data.notificaciones.some(n=>n.solicitud?.paciente==='Ana Uno'));
    assert.equal((await request('/farmacia/existencias',{method:'PATCH',body:{stock:100}})).status,404);
});

test('navegador: inventario propio, nuevos indicadores, notificaciones contextualizadas e imágenes HTTPS visibles',{timeout:90000},async()=>{
    const previousOperation=process.env.FARMACIA_OPERACION_ENABLED;
    const previousStock=process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED;
    process.env.FARMACIA_OPERACION_ENABLED='true';
    process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED='true';
    let browser;
    try{
        await db.exec(`INSERT INTO medicamentos(id,nombre,descripcion,presentacion,categoria_id,precio,stock,estado,imagen)
            VALUES(100,'Segundo medicamento','Prueba aislada','Caja',1,10,15,'DISPONIBLE','https://images.example.com/inventario-fixture.png')
            ON CONFLICT(id) DO UPDATE SET imagen=EXCLUDED.imagen;
            INSERT INTO farmacia_asignaciones(solicitud_id,farmacia_id,asignado_por) VALUES(1,3,1) ON CONFLICT DO NOTHING;
            INSERT INTO farmacia_existencias(farmacia_id,medicamento_id,cantidad) VALUES(3,1,5),(3,100,2) ON CONFLICT DO NOTHING;
            UPDATE solicitudes SET estado='ENTREGADA' WHERE id=1;
            INSERT INTO farmacia_solicitud_eventos(solicitud_id,farmacia_id,actor_id,estado_anterior,estado,clave,huella,recepcion,cantidades)
            VALUES(1,3,3,'LISTA','ENTREGADA','c493cb02-fef7-4201-b552-e3500b2d26ed',repeat('0',64),'Recepción de prueba','[{"medicamentoId":1,"cantidad":3}]')
            ON CONFLICT(solicitud_id,estado) DO NOTHING;
            UPDATE farmacia_solicitud_eventos SET created_at=((now() AT TIME ZONE 'America/Bogota')::date + time '12:00') AT TIME ZONE 'America/Bogota'
            WHERE solicitud_id=1 AND farmacia_id=3 AND estado='ENTREGADA';
            INSERT INTO notificaciones_farmacia(destinatario_id,tipo,titulo,mensaje,referencia_evento)
            VALUES(3,'NUEVA_SOLICITUD','Solicitud asignada','Prueba aislada','solicitud:1:asignada')
            ON CONFLICT(destinatario_id,referencia_evento) DO NOTHING;`);
        browser=await require('./support/afiliados-edge.cjs').abrirEdge();
        const {send,evaluate,until}=browser;
        const image=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#146c43"/><text x="10" y="45" fill="white">SaludClick</text></svg>').toString('base64');
        const failures=[],held=[];let holdStats=false;
        browser.onEvent('Fetch.requestPaused',event=>{
            if(event.request.url.includes('/api/farmacia/dashboard/estadisticas')){if(holdStats)held.push(event.requestId);else void send('Fetch.continueRequest',{requestId:event.requestId}).catch(e=>failures.push(e.message));return;}
            void send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/svg+xml'}],body:image}).catch(e=>failures.push(e.message));
        });
        await send('Fetch.enable',{patterns:[{urlPattern:'https://images.example.com/*'},{urlPattern:'*/api/farmacia/dashboard/estadisticas*'}]});
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token(3,3))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:3,rol:3,nombre:'Farmacia de prueba'}));`});
        await send('Page.navigate',{url:origin+'/pages/farmacia.html'});
        let snapshot;
        await until(async()=>{snapshot=await evaluate('({disponibles:document.querySelector("[data-dashboard-metric=medicamentosDisponibles]")?.textContent,completadas:document.querySelector("[data-dashboard-metric=solicitudesCompletadas]")?.textContent,tarjetas:document.querySelectorAll("#farmaciaDashboardMetrics > article").length,mensual:document.querySelector("#farmaciaDashboardMensual")?.textContent,stock:document.querySelector("#farmaciaDashboardStock")?.textContent})');return snapshot.disponibles==='2'&&snapshot.completadas==='1'&&snapshot.stock.includes('unidades libres');})
            .catch(error=>{throw new Error(error.message+' '+JSON.stringify(snapshot));});
        assert.equal(snapshot.tarjetas,4);assert.match(snapshot.mensual,/Completadas: 1/);
        holdStats=true;await evaluate('document.querySelector("#refreshFarmacia").click()');await until(()=>held.length>0);
        assert.equal(await evaluate('document.querySelector("[data-dashboard-metric=medicamentosDisponibles]").textContent'),'2');
        holdStats=false;for(const id of held.splice(0))await send('Fetch.continueRequest',{requestId:id});
        await until(()=>evaluate('document.querySelector("#farmaciaDashboardMetrics").getAttribute("aria-busy")==="false"'));
        await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        const dashboardShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.resolve(__dirname,'../../docs/calidad/reportes/farmacia-implementacion-dashboard-propio-2026-11-17.png'),Buffer.from(dashboardShot.data,'base64'));
        await send('Page.navigate',{url:origin+'/pages/farmacia-inventario.html'});await until(()=>evaluate('document.querySelectorAll("#farmaciaInventory tr").length===2'));
        assert.match(await evaluate('document.querySelector("[data-existencias-part=alcance]").textContent'),/Existencias propias/);
        assert.match(await evaluate('document.querySelector("#farmaciaInventory").textContent'),/Segundo medicamento/);
        for(const width of [1440,820,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));}
        const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.resolve(__dirname,'../../docs/calidad/reportes/farmacia-implementacion-inventario-2026-11-17.png'),Buffer.from(shot.data,'base64'));
        await send('Emulation.clearDeviceMetricsOverride');await send('Page.navigate',{url:origin+'/pages/farmacia-notificaciones.html'});
        await until(()=>evaluate('document.querySelector("#farmaciaNotificationsList").textContent.includes("Paciente: Ana Uno")'));
        const visiblePhoto=selector=>evaluate(`(()=>{
            const img=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.src==='https://images.example.com/inventario-fixture.png');
            if(!img)return false;
            img.scrollIntoView();
            return img.complete&&img.naturalWidth===120;
        })()`);
        await send('Page.navigate',{url:origin+'/pages/farmacia-medicamentos.html'});
        await until(()=>visiblePhoto('.farmacia-med-image'));
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('saludclick_token',${JSON.stringify(token(2,2))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:2,rol:2,nombre:'Paciente'}));`});
        await send('Page.navigate',{url:origin+'/pages/medicamentos.html'});
        await until(()=>visiblePhoto('#catalogoMedicamentos img'));
        assert.deepEqual(failures,[]);assert.deepEqual(browser.errores,[]);
    }finally{
        process.env.FARMACIA_OPERACION_ENABLED=previousOperation;
        process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED=previousStock;
        await browser?.cerrar();
    }
});

test('Edge y API: alertas de medicamentos persistentes, enlaces y lectura aislada',{timeout:60000},async()=>{
    const env=['FARMACIA_OPERACION_ENABLED','FARMACIA_CATALOGO_ENABLED'];
    const previous=env.map(key=>process.env[key]);
    process.env.FARMACIA_OPERACION_ENABLED='false';
    process.env.FARMACIA_CATALOGO_ENABLED='true';
    let browser;
    try{
        await db.query(`INSERT INTO farmacia_catalogo_autorizaciones(farmacia_id,autorizado_por,puede_crear,activa)
            VALUES(3,1,true,true) ON CONFLICT(farmacia_id) DO UPDATE SET puede_crear=true,activa=true`);
        const base={nombre:'Medicamento con alertas',descripcion:'Prueba aislada',presentacion:'Caja',categoria_id:1,stock_minimo:5,estado:'DISPONIBLE'};
        const create=await request('/farmacia/medicamentos',{method:'POST',body:{...base,stock:20}});
        assert.equal(create.status,201);
        const id=create.data.medicamento.id;
        const count=async user=>(await request('/farmacia/notificaciones/no-leidas/count',{id:user})).data.noLeidas;
        const unread=await count(3);
        const otherUnread=await count(4);
        let version=1, stockEsperado=20;
        for(const stock of [5,4,3,0,10]){
            const response=await request('/farmacia/medicamentos/'+id,{method:'PATCH',body:{...base,stock,stockEsperado,version}});
            assert.equal(response.status,200);
            assert.equal('destinatarios' in response.data,false);
            stockEsperado=stock;
            version++;
        }
        const retry=await request('/farmacia/medicamentos/'+id,{method:'PATCH',body:{...base,stock:10,stockEsperado:0,version:version-1}});
        assert.equal(retry.status,409);
        const feed=()=>request('/farmacia/notificaciones');
        const listed=await feed();
        assert.equal(listed.status,200);
        const alerts=listed.data.notificaciones.filter(n=>n.medicamento?.id===id);
        assert.deepEqual(alerts.map(n=>n.tipo),['STOCK_REPUESTO','STOCK_AGOTADO','STOCK_BAJO','STOCK_BAJO']);
        assert.match(alerts[2].titulo,/por debajo/);
        assert.match(alerts[3].titulo,/alcanzado/);
        assert.equal((await feed()).data.noLeidas,unread+4);
        assert.equal(await count(4),otherUnread);
        assert.equal((await request('/farmacia/notificaciones/'+alerts[0].id+'/leida',{id:4,method:'PATCH',body:{}})).status,404);
        browser=await require('./support/afiliados-edge.cjs').abrirEdge();
        const {send,evaluate,until}=browser;
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('saludclick_token',${JSON.stringify(token(3,3))});sessionStorage.setItem('saludclick_user',JSON.stringify({id:3,rol:3}));`});
        await send('Page.navigate',{url:origin+'/pages/farmacia-notificaciones.html'});
        const target=`[...document.querySelectorAll('#farmaciaNotificationsList li')].find(el=>el.textContent.includes('Medicamento con alertas')&&el.textContent.includes('Stock actualizado'))`;
        await until(()=>evaluate(`Boolean((${target})?.querySelector('button'))`));
        assert.equal(await evaluate(`(${target}).querySelector('a').getAttribute('href')`),'/pages/farmacia-medicamentos.html?id='+id);
        await evaluate(`(${target}).querySelector('button').click()`);
        await until(()=>evaluate(`(${target})?.dataset.unread==='false'`));
        assert.equal(await count(3),unread+3);
        await send('Page.reload');
        await until(()=>evaluate(`(${target})?.dataset.unread==='false'`));
        await evaluate("document.querySelector('#farmaciaReadAll').click()");
        await until(()=>evaluate("document.querySelector('#farmaciaNotificationsBadge').textContent==='0'"));
        assert.equal(await count(3),0);
        await evaluate(`(${target}).querySelector('a').click()`);
        await until(()=>evaluate("document.querySelector('#medicamentos dialog[data-existencias-part=detalle]')?.textContent.includes('Medicamento con alertas')"));
        await db.query('UPDATE farmacia_catalogo_ambitos SET activa=false WHERE medicamento_id=$1',[id]);
        assert.ok((await feed()).data.notificaciones.filter(n=>n.referencia_evento.startsWith('stock:catalogo:'+id+':')).every(n=>n.medicamento===null));
    }finally{
        await browser?.cerrar();
        env.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});
    }
});

test('HTTP: revocar vínculo retira datos del paciente del historial de notificaciones',async()=>{
    const env=['FARMACIA_OPERACION_ENABLED','FARMACIA_INVENTARIO_PROPIO_ENABLED'];
    const previous=env.map(key=>process.env[key]);
    for(const key of env)process.env[key]='true';
    try {
        assert.ok((await request('/farmacia/notificaciones')).data.notificaciones.some(n=>n.solicitud?.id===1));
        await db.query('UPDATE eps_farmacias SET activa=false WHERE farmacia_id=3');
        const history=await request('/farmacia/notificaciones');
        assert.equal(history.status,200);
        assert.ok(history.data.notificaciones.some(n=>n.referencia_evento.startsWith('solicitud:')));
        assert.ok(history.data.notificaciones.every(n=>n.solicitud===null));
        assert.equal((await request('/farmacia/existencias')).status,403);
    }finally{
        env.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});
    }
});
