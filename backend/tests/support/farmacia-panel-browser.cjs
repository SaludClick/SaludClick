const assert = require('node:assert/strict');

// HTTP fixture only: never imports application repositories or database config.
function createFixture() {
    const fixture = { enabled: false, pedidos: [], failStats: false };
    fixture.reset = () => {
        fixture.enabled = true;
        fixture.failStats = false;
        fixture.patches = 0;
        fixture.failQueries = false;
        fixture.conflict = false;
        fixture.failAfterPatch = false;
        fixture.holdPatch = false;
        fixture.releasePatch = null;
        fixture.inventoryEnabled = false;
        fixture.failInventory = false;
        fixture.chatEnabled = false; fixture.chatHold = false; fixture.chatEmpty = false;
        fixture.chatFailList = false; fixture.chatFailHistory = false; fixture.chatReleases = [];
        fixture.inventory = Array.from({ length: 27 }, (_, i) => ({ nombre: `Medicamento ficticio ${String(i + 1).padStart(2, '0')}`, stock: i, estado: 'DISPONIBLE', categoria: { nombre: 'Categoría ficticia' } }));
        fixture.pedidos = Array.from({ length: 31 }, (_, i) => ({
            id: i + 1, estado: i < 26 ? 'APROBADA' : i < 29 ? 'PREPARANDO' : 'LISTA',
            fecha: '2026-11-13T10:00:00Z', tipo_entrega: 'RECOGER',
            usuario: { nombre: 'Paciente ficticio', apellido: String(i + 1) },
            detalles: [{ cantidad: 1, medicamento: { nombre: 'Medicamento ficticio' } }]
        }));
    };
    fixture.handle = (req, res, url) => {
        if (fixture.enabled && fixture.chatEnabled && url.pathname.startsWith('/api/chat/')) {
            res.setHeader('Content-Type','application/json');
            const isHistory = url.pathname.endsWith('/mensajes');
            const reply = () => {
                if (isHistory ? fixture.chatFailHistory : fixture.chatFailList) {
                    res.statusCode=503;res.end(JSON.stringify({ok:false,mensaje:'Fallo ficticio de chat'}));return;
                }
                const conversaciones = fixture.chatEmpty ? [] : [1,2].map(id=>({id,estado:'ABIERTA',cliente:{id:20+id,nombre:'Paciente ficticio',apellido:String(id)},agente:{id:30,nombre:'Farmacia',apellido:'Prueba'},mensajes:[]}));
                res.end(JSON.stringify(isHistory ? {ok:true,messages:[],conversation:conversaciones[0]} : {ok:true,conversaciones}));
            };
            if (fixture.chatHold && !isHistory) fixture.chatReleases.push(reply); else reply();
            return true;
        }
        if (fixture.enabled && fixture.inventoryEnabled && url.pathname === '/api/farmacia/inventario') {
            res.setHeader('Content-Type', 'application/json');
            if (fixture.failInventory) {
                res.statusCode = 503; res.end(JSON.stringify({ok:false,mensaje:'Fallo ficticio de inventario'})); return true;
            }
            const buscar = (url.searchParams.get('buscar') || '').toLocaleLowerCase();
            const items = fixture.inventory.filter(m => m.nombre.toLocaleLowerCase().includes(buscar));
            const pagina = Number(url.searchParams.get('pagina') || 1);
            res.end(JSON.stringify({ok:true,medicamentos:items.slice((pagina-1)*25,pagina*25),paginacion:{pagina,tamano:25,total:items.length,paginas:Math.ceil(items.length/25)}}));
            return true;
        }
        if (!fixture.enabled || !url.pathname.startsWith('/api/farmacia/pedidos')) return false;
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'PATCH') {
            fixture.patches++;
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                const input = JSON.parse(body);
                const id = Number(url.pathname.split('/')[4]);
                const pedido = fixture.pedidos.find(p => p.id === id);
                if (!pedido) throw new Error('Pedido ficticio inexistente');
                const finish = () => {
                    fixture.releasePatch = null;
                    pedido.estado = input.estado;
                    if (fixture.failAfterPatch) fixture.failQueries = true;
                    res.statusCode = fixture.conflict ? 409 : 200;
                    res.end(JSON.stringify(fixture.conflict ? { ok: false, mensaje: 'Otro operador avanzó el pedido' } : { ok: true, pedido }));
                };
                if (fixture.holdPatch) fixture.releasePatch = finish; else finish();
            });
            return true;
        }
        if (fixture.failQueries) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, mensaje: 'Fallo ficticio después del guardado' }));
            return true;
        }
        const estado = url.searchParams.get('estado');
        if (fixture.failStats && estado === 'PREPARANDO') {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, mensaje: 'Fallo ficticio de indicador' }));
            return true;
        }
        const filtered = fixture.pedidos.filter(p => estado ? p.estado === estado : p.estado !== 'ENTREGADA');
        const pagina = Number(url.searchParams.get('pagina') || 1);
        res.end(JSON.stringify({ ok: true, pedidos: filtered.slice((pagina - 1) * 25, pagina * 25),
            paginacion: { pagina, tamano: 25, total: filtered.length, paginas: Math.ceil(filtered.length / 25) } }));
        return true;
    };
    return fixture;
}

async function testIndicators({ t, fixture, evaluate, go, click, until }) {
    await t.test('indicadores cuentan 26 pedidos, filtran y muestran errores sin inventar ceros', async () => {
        fixture.reset();
        try {
            await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia ficticia',rol:3})); }`);
            await go('/pages/farmacia.html');
            const count = state => evaluate(`document.querySelector('[data-order-status="${state}"] [data-count]').textContent`);
            await until(async () => await count('APROBADA') === '26');
            assert.equal(await count('PREPARANDO'), '3');
            assert.equal(await count('LISTA'), '2');
            await click('[data-order-status="APROBADA"]');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 25 && document.querySelector("#ordersPage").textContent.includes("26")'));
            await click('#ordersNext');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 1'));
            await click('[data-order-status="LISTA"]');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 2'));
            assert.match(await evaluate('document.querySelector("#ordersPage").textContent'), /1 de 1/);
            fixture.failStats = true;
            await click('#refreshFarmacia');
            await until(() => evaluate('document.querySelector("#retryFarmaciaStats").hidden === false'));
            assert.equal(await count('PREPARANDO'), '3');
            fixture.failStats = false;
            fixture.pedidos = fixture.pedidos.filter(p => p.estado !== 'PREPARANDO');
            await click('#retryFarmaciaStats');
            await until(async () => await count('PREPARANDO') === '0');
        } finally { fixture.enabled = false; }
    });
}
async function testTransitions({ t, fixture, evaluate, go, click, until }) {
    const openApproved = async () => {
        await go('/pages/farmacia.html');
        await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 25'));
        await click('[data-order-status="APROBADA"]');
        await until(() => evaluate('document.querySelector("#farmaciaOrders").getAttribute("aria-busy") === "false"'));
    };
    const countsReady = () => evaluate(`document.querySelector('[data-order-status="APROBADA"] [data-count]').textContent === '25' && document.querySelector('[data-order-status="PREPARANDO"] [data-count]').textContent === '4'`);
    await t.test('avanzar el unico pedido de pagina 2 conserva filtro y carga la ultima pagina valida', async () => {
        fixture.reset();
        try {
            await openApproved();
            await click('#ordersNext');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 1'));
            await click('.farmacia-order button');
            await until(countsReady);
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 25 && document.querySelector("#ordersPage").textContent.includes("1 de 1")'));
            assert.equal(await evaluate('document.querySelector("#estadoFarmacia").value'), 'APROBADA');
            assert.equal(fixture.patches, 1);
        } finally { fixture.enabled = false; }
    });
    await t.test('409 recupera el estado vigente y conserva la pagina todavia valida', async () => {
        fixture.reset(); fixture.conflict = true;
        try {
            await openApproved();
            // Activos retains a pedido advanced by the other operator.
            await evaluate(`document.querySelector('#estadoFarmacia').value=''; document.querySelector('#filtroPedidos').requestSubmit();`);
            await until(() => evaluate('document.querySelector("#farmaciaOrders").getAttribute("aria-busy") === "false"'));
            await click('.farmacia-order button');
            await until(() => evaluate('document.querySelector("#farmaciaMessage").textContent.includes("Lista actualizada")'));
            assert.equal(await evaluate('document.querySelector(".farmacia-order").dataset.status'), 'PREPARANDO');
            assert.match(await evaluate('document.querySelector("#ordersPage").textContent'), /1 de 2/);
            assert.equal(fixture.patches, 1);
        } finally { fixture.enabled = false; }
    });
    await t.test('guardado exitoso con recarga fallida reintenta GET sin repetir PATCH', async () => {
        fixture.reset(); fixture.failAfterPatch = true;
        try {
            await openApproved();
            await click('.farmacia-order button');
            await until(() => evaluate('document.querySelector("#retryFarmaciaOrders").hidden === false'));
            await until(() => evaluate('document.querySelector("#farmaciaMessage").textContent.includes("se actualiz")'));
            assert.equal(await evaluate('document.querySelector(".farmacia-order button").disabled'), true);
            assert.equal(fixture.patches, 1);
            fixture.failQueries = false;
            await click('#retryFarmaciaOrders');
            await until(countsReady);
            await until(() => evaluate('document.querySelector("#ordersMessage").textContent === ""'));
            assert.equal(fixture.patches, 1);
            assert.equal(await evaluate('document.querySelector("#estadoFarmacia").value'), 'APROBADA');
        } finally { fixture.enabled = false; }
    });
    await t.test('doble clic solo guarda una transicion y el refresco respeta el foco del operador', async () => {
        fixture.reset(); fixture.holdPatch = true;
        try {
            await openApproved();
            await evaluate(`const button=document.querySelector('.farmacia-order button');button.focus();button.click();button.click();`);
            await until(() => fixture.patches === 1 && !!fixture.releasePatch);
            assert.equal(await evaluate('document.querySelector(".farmacia-order button").disabled'), true);
            await evaluate('document.querySelector("#buscarFarmacia").focus()');
            fixture.releasePatch();
            await until(countsReady);
            assert.equal(fixture.patches, 1);
            assert.equal(await evaluate('document.activeElement.id'), 'buscarFarmacia');
        } finally { fixture.releasePatch?.(); fixture.enabled = false; }
    });
}
async function capture(send, name) {
    if (!process.env.FARMACIA_SCREENSHOT_DIR) return;
    const fs = require('node:fs');
    const path = require('node:path');
    fs.mkdirSync(process.env.FARMACIA_SCREENSHOT_DIR, { recursive: true });
    const image = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(process.env.FARMACIA_SCREENSHOT_DIR, `${name}.png`), Buffer.from(image.data, 'base64'));
}

async function testNavigation({ t, fixture, evaluate, go, click, until, send }) {
    await t.test('farmacia conserva filtro y pagina al recargar y navega con contexto en escritorio y movil', async () => {
        fixture.reset();
        try {
            await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
            await go('/pages/farmacia.html?estado=APROBADA&pagina=2#pedidosFarmacia');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 1'));
            assert.equal(await evaluate('document.querySelector("#estadoFarmacia").value'), 'APROBADA');
            await click('a[href="#inventarioFarmacia"]');
            await until(() => evaluate(`document.querySelector('a[href="#inventarioFarmacia"]').getAttribute('aria-current') === 'location'`));
            assert.equal(await evaluate('new URLSearchParams(location.search).get("pagina")'), '2');
            await go(await evaluate('location.pathname+location.search+location.hash'));
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 1'));
            await click('a[href="#panelFarmacia"]');
            await evaluate('window.scrollTo(0,0)');
            await capture(send, 'panel-escritorio');
            await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
            await click('#menuToggle');
            await click('a[href="#panelFarmacia"]');
            await capture(send, 'panel-movil');
            await click('#menuToggle');
            await click('a[href="#pedidosFarmacia"]');
            assert.equal(await evaluate('document.querySelector("#menuToggle").getAttribute("aria-expanded")'), 'false');
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
            await evaluate('document.querySelector(".farmacia-order button").focus()');
            assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'none');
            await capture(send, 'pedidos-movil');
        } finally { fixture.enabled = false; await send('Emulation.clearDeviceMetricsOverride'); }
    });
}
async function testInventory({ t, fixture, evaluate, go, click, until, send }) {
    await t.test('inventario busca en todas las paginas, distingue stock de estado y recupera vacios y errores en movil', async () => {
        fixture.reset(); fixture.inventoryEnabled = true;
        try {
            await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
            await go('/pages/farmacia.html#inventarioFarmacia');
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 25'));
            assert.match(await evaluate('document.querySelector("#inventoryPage").textContent'), /de 27/);
            assert.match(await evaluate('document.querySelector("#farmaciaInventory tr").textContent'), /0 unidades.*Sin existencias.*DISPONIBLE/);
            await capture(send,'inventario-escritorio');
            await click('#inventoryNext');
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 2'));
            await evaluate(`document.querySelector('#buscarFarmacia').value='27';document.querySelector('#buscarInventario').requestSubmit();`);
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 1 && document.querySelector("#inventoryPage").textContent.includes("de 1" )'));
            assert.match(await evaluate('document.querySelector("#farmaciaInventory").textContent'), /27/);
            fixture.failInventory = true;
            await click('#refreshFarmacia');
            await until(() => evaluate('document.querySelector("#retryFarmaciaInventory").hidden === false'));
            assert.equal(await evaluate('document.querySelector("#buscarFarmacia").value'), '27');
            fixture.failInventory = false;
            await click('#retryFarmaciaInventory');
            await until(() => evaluate('document.querySelector("#inventoryMessage").textContent === ""'));
            await evaluate(`document.querySelector('#buscarFarmacia').value='sin coincidencias';document.querySelector('#buscarInventario').requestSubmit();`);
            await until(() => evaluate('document.querySelector("#inventoryEmpty").textContent.includes("No se encontraron")'));
            await click('#clearFarmaciaInventory');
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 25'));
            fixture.inventory[0].nombre = 'NombreLargo'.repeat(40);
            await send('Emulation.setDeviceMetricsOverride', {width:320,height:812,deviceScaleFactor:1,mobile:true});
            await click('#refreshFarmacia');
            await until(() => evaluate('document.querySelector("#farmaciaInventory tr").textContent.includes("NombreLargo")'));
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
            await evaluate('document.querySelector("#inventarioFarmacia").scrollIntoView()');
            await capture(send, 'inventario-movil');
        } finally { fixture.enabled = false; await send('Emulation.clearDeviceMetricsOverride'); }
    });
}
async function testChat({t,fixture,evaluate,go,click,until,send}) {
    const {identifier} = await send('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.io=()=>{
        const handlers={};
        const socket={connected:true,on(event,callback){handlers[event]=callback;if(event==='connect')setTimeout(callback,20);return socket;},
          emit(event,data,ack){if(event==='chat:join')ack?.({ok:true,mensajes:[]});if(event==='chat:send')ack?.({ok:true});},
          disconnect(){socket.connected=false;handlers.disconnect?.();}};
        window.__chatControl={handlers,socket};return socket;
      };`});
    try {
        await t.test('chat carga, distingue desconexion y conserva contexto sin mezclar conversaciones en escritorio y movil',async()=>{
            fixture.reset();fixture.chatEnabled=true;fixture.chatHold=true;
            const returnTo='/pages/farmacia.html?estado=APROBADA&pagina=2#pedidosFarmacia';
            await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
            await go('/pages/chat-farmacia.html?volver='+encodeURIComponent(returnTo));
            await until(()=>evaluate('document.querySelector(".chat-list")?.getAttribute("aria-busy")==="true"'));
            assert.match(await evaluate('document.querySelector(".chat-list").textContent'),/Cargando conversaciones/);
            fixture.chatHold=false;fixture.chatReleases.splice(0).forEach(reply=>reply());
            await until(()=>evaluate('document.querySelectorAll(".chat-list-item").length===2 && document.querySelector(".chat-connection").textContent.includes("En línea")'));
            await until(()=>evaluate('document.querySelector(".chat-messages").getAttribute("aria-busy")==="false"'));
            assert.match(await evaluate('document.querySelector(".chat-welcome").textContent'),/no tiene mensajes/);
            await capture(send,'chat-escritorio');
            await evaluate(`window.__chatControl.handlers['chat:message']({id:90,conversacion_id:2,remitente_id:22,contenido:'No pertenece al chat abierto'});`);
            assert.equal(await evaluate('document.querySelectorAll(".chat-bubble").length'),0);
            await evaluate(`window.__chatControl.handlers['chat:message']({id:91,conversacion_id:1,remitente_id:21,contenido:'Mensaje autorizado de prueba',created_at:new Date().toISOString()});`);
            await until(()=>evaluate('document.querySelector(".chat-bubble")?.textContent.includes("Mensaje autorizado")'));
            await evaluate('document.querySelector("#chatMessage").focus()');
            await send('Input.insertText',{text:'Borrador sin enviar'});
            await evaluate('window.__chatControl.socket.disconnect()');
            await until(()=>evaluate('document.querySelector(".chat-connection").textContent.includes("Sin conexión")'));
            assert.equal(await evaluate('document.querySelector(".chat-composer button").disabled'),true);
            await evaluate(`[...document.querySelectorAll('.chat-notice button')].find(b=>b.textContent==='Reconectar').click()`);
            await until(()=>evaluate('document.querySelector(".chat-connection").textContent.includes("En línea")'));
            assert.equal(await evaluate('document.querySelector("#chatMessage").value'),'Borrador sin enviar');
            fixture.chatFailHistory=true;
            await evaluate('document.querySelectorAll(".chat-list-item")[1].click()');
            await until(()=>evaluate('document.querySelector(".chat-error")?.textContent.includes("Fallo ficticio")'));
            fixture.chatFailHistory=false;
            await click('.chat-error button');
            await until(()=>evaluate('document.querySelector(".chat-messages").getAttribute("aria-busy")==="false" && !document.querySelector(".chat-error")'));
            await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
            assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
            assert.equal(await evaluate('getComputedStyle(document.querySelector(".farmacia-chat-nav")).position'),'static');
            assert.ok(await evaluate('document.querySelector(".farmacia-chat-nav").getBoundingClientRect().height < 240'));
            await evaluate('window.scrollTo(0,0)');await capture(send,'chat-movil');
            await evaluate(`[...document.querySelectorAll('.farmacia-chat-nav a')].find(a=>a.textContent==='Pedidos').click()`);
            await until(()=>evaluate('location.pathname==="/pages/farmacia.html" && document.querySelectorAll(".farmacia-order").length===1'));
            assert.equal(await evaluate('document.querySelector("#estadoFarmacia").value'),'APROBADA');
            assert.match(await evaluate('document.querySelector("#ordersPage").textContent'),/2 de 2/);
        });
        await t.test('chat distingue lista vacia y error con reintento sin habilitar envio',async()=>{
            fixture.reset();fixture.chatEnabled=true;fixture.chatEmpty=true;
            await go('/pages/chat-farmacia.html');
            await until(()=>evaluate('document.querySelector(".chat-empty-list")?.textContent.includes("No hay conversaciones")'));
            assert.equal(await evaluate('document.querySelector("#chatMessage").disabled'),true);
            fixture.chatFailList=true;await click('.chat-list > button');
            await until(()=>evaluate('document.querySelector(".chat-list .chat-error")?.textContent.includes("Fallo ficticio")'));
            fixture.chatFailList=false;fixture.chatEmpty=false;await click('.chat-list > button');
            await until(()=>evaluate('document.querySelectorAll(".chat-list-item").length===2'));
        });
    } finally {
        fixture.chatReleases.splice(0).forEach(reply=>reply()); fixture.enabled=false;
        await send('Emulation.clearDeviceMetricsOverride');
        await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
    }
}
module.exports = { createFixture, testIndicators, testTransitions, testNavigation, testInventory, testChat, capture };
