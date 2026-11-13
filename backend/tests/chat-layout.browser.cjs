// Presentation-only verification: synthetic HTTP fixtures, no database or .env.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const express=require('express');
const {abrirEdge}=require('./support/afiliados-edge.cjs');
const {createFixture}=require('./support/administrative-browser.cjs');

test('chat bubbles remain readable and aligned on desktop and mobile',{timeout:120000},async t=>{
  const fixture=createFixture(),created_at='2026-11-13T16:42:00Z';
  const texts=['¿Me regala su número de cédula?','Claro, revisemos mi solicitud.','Gracias.','Podemos continuar por este mismo chat sin iniciar otra conversación.',
    'Mensaje largo del visitante: '+('Necesito orientación sobre mi solicitud de acceso. ').repeat(4)+'ReferenciaSinEspacios'+('ABC123').repeat(35),
    'Respuesta larga de Administración: '+('Tu solicitud conserva su historial y podemos revisar los detalles juntos. ').repeat(4)+'\nEste segundo párrafo también debe ser legible.'];
  const roles=[1,0,1,1,0,1];
  const caso={id:91,cliente_id:null,cliente_nombre:'Visitante',cliente_apellido:'de prueba',responsable_id:1,tipo:'CONVERSACION',asunto:'Prueba visual',categoria:'SOPORTE',estado:'EN_ATENCION',created_at,updated_at:created_at};
  fixture.cases.push(caso);
  fixture.messages.push(...texts.map((contenido,i)=>({id:i+1,caso_id:91,remitente_id:roles[i]===1?1:null,rol_id:roles[i],nombre:roles[i]===1?'Administración':'Visitante',contenido,created_at,leido_at:null})));
  const app=express();
  app.use(async(req,res,next)=>{
    if(req.url.startsWith('/api/administrativo/visitante/'))return res.json({ok:true,caso,mensajes:fixture.messages,historial:[],hayAnteriores:false,leidos:0});
    if(await fixture.handle(req,res))return;next();
  });
  app.use(express.static(path.resolve(__dirname,'../../frontend/dist')));
  const server=http.createServer(app);let browser;
  const evidence=path.resolve(__dirname,'../../docs/calidad/evidencias/chat-layout');fs.mkdirSync(evidence,{recursive:true});
  const measurements=[];
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await abrirEdge();
    await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.io=()=>({on(){return this;},disconnect(){}});if(location.hash==='#solicitudes'){sessionStorage.setItem('saludclick_token','frontend-test-only-1');sessionStorage.setItem('saludclick_user',JSON.stringify({id:1,rol:1,nombre:'Admin de prueba'}));}else{sessionStorage.removeItem('saludclick_token');sessionStorage.removeItem('saludclick_user');}`});
    await browser.send('Network.setBlockedURLs',{urls:['*://cdnjs.cloudflare.com/*','*://cdn.jsdelivr.net/*']});
    for(const [view,url] of [['vitalix-widget','/index.html'],['vitalix-page','/pages/chat.html'],['solicitudes','/pages/admin.html#solicitudes']]){
      for(const width of [1440,390,320])await t.test(`${view} at ${width}px`,async()=>{
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
        await browser.send('Page.navigate',{url:origin+url});
        const admin=view==='solicitudes',log=admin?'#chatLog':'.vitalix-transcript',message=admin?'.ac-message':'[data-vitalix-message]';
        await browser.until(()=>browser.evaluate(`document.querySelectorAll('${message}').length===6`));
        if(view==='vitalix-widget')await browser.evaluate(`document.querySelector('.vitalix-launcher').click()`);
        if(view==='vitalix-page'&&width<600)await browser.evaluate(`document.querySelector('.vitalix-shortcuts').open=false;document.querySelector('.vitalix-conversation').scrollIntoView({block:'center'})`);
        await browser.evaluate(`document.querySelector('${log}').scrollTop=0`);
        const result=await browser.evaluate(`(()=>{
          const log=document.querySelector('${log}'),lr=log.getBoundingClientRect(),style=getComputedStyle(log),left=lr.left+parseFloat(style.paddingLeft),right=lr.left+log.clientWidth-parseFloat(style.paddingRight),available=right-left;
          const messages=[...document.querySelectorAll('${message}')].map(node=>{const r=node.getBoundingClientRect(),name=node.querySelector('strong'),p=node.querySelector('p'),time=node.querySelector('time'),pr=p.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,top:r.top,bottom:r.bottom,textWidth:pr.width,overflow:p.scrollWidth>p.clientWidth+1,wordBreak:getComputedStyle(p).wordBreak,stacked:name.getBoundingClientRect().bottom<=pr.top+1&&pr.bottom<=time.getBoundingClientRect().top+1,own:node.classList.contains('${admin?'ac-mine':'vitalix-message-user'}')};});
          const row=document.querySelector('${admin?'.ac-composer>div':'.vitalix-composer'}'),field=row.querySelector('${admin?'textarea':'input'}'),button=row.querySelector('button'),rr=row.getBoundingClientRect(),fr=field.getBoundingClientRect(),br=button.getBoundingClientRect();
          return {available,left,right,messages,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,composer:{row:rr.width,field:fr.width,button:br.width,gap:br.left-fr.right}};
        })()`);
        assert.ok(result.pageWidth<=width+1,'page must not overflow horizontally');
        for(const [i,m] of result.messages.entries()){
          assert.ok(m.width<=result.available*.85+2,`bubble ${i} exceeds chat width`);
          assert.ok(m.textWidth>=Math.min(100,result.available*.6),`bubble ${i} compressed to a narrow column`);
          assert.equal(m.overflow,false,`message ${i} overflows with long text`);assert.notEqual(m.wordBreak,'break-all');assert.equal(m.stacked,true,'sender, content and date must be separate rows');
          assert.ok(Math.abs((m.own?m.right:m.left)-(m.own?result.right:result.left))<3,`message ${i} has wrong alignment`);
          if(i)assert.ok(m.top>=result.messages[i-1].bottom+7,'consecutive bubbles overlap or have no spacing');
        }
        assert.ok(result.messages[2].width>result.messages[2].height,'short bubble should be horizontal');
        assert.ok(result.composer.field>result.composer.row*.6,'composer is too narrow');
        assert.ok(Math.abs(result.composer.field+result.composer.button+result.composer.gap-result.composer.row)<3,'composer must fill available row');
        measurements.push({view,width,...result});
        for(const position of ['short','long']){
          await browser.evaluate(`document.querySelector('${log}').scrollTop=${position==='short'?'0':`document.querySelector('${log}').scrollHeight`}`);
          const screenshot=await browser.send('Page.captureScreenshot',{format:'png'});
          fs.writeFileSync(path.join(evidence,`${view}-${width}-${position}.png`),Buffer.from(screenshot.data,'base64'));
        }
      });
    }
    assert.deepEqual(browser.errores,[]);
    fs.writeFileSync(path.join(evidence,'measurements.json'),JSON.stringify(measurements,null,2));
  }finally{await browser?.cerrar();await new Promise(r=>server.close(r));}
});
