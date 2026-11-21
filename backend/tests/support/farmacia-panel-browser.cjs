const assert = require('node:assert/strict');
const summary = pedidos => ({ pendientes: pedidos.filter(p=>p.estado==='APROBADA').length, preparando: pedidos.filter(p=>p.estado==='PREPARANDO').length, listas: pedidos.filter(p=>p.estado==='LISTA').length, entregadas: pedidos.filter(p=>p.estado==='ENTREGADA').length });
const operation = pedido => ({ ...pedido, operacion: { siguienteEstado: {APROBADA:'PREPARANDO',PREPARANDO:'LISTA',LISTA:'ENTREGADA'}[pedido.estado] || null, bloqueos: [] } });

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
        fixture.inventory = Array.from({ length: 27 }, (_, i) => ({ id: i + 1, disponibilidad: i ? 'DISPONIBLE' : 'AGOTADO', requisitoFormula: 'DESCONOCIDO', presentacion: null, nombre: `Medicamento ficticio ${String(i + 1).padStart(2, '0')}`, stock: i, estado: 'DISPONIBLE', categoria: { nombre: 'Categoría ficticia' } }));
        fixture.pedidos = Array.from({ length: 31 }, (_, i) => ({
            id: i + 1, estado: i < 26 ? 'APROBADA' : i < 29 ? 'PREPARANDO' : 'LISTA',
            fecha: '2026-11-13T10:00:00Z', tipo_entrega: 'RECOGER',
            usuario: { nombre: 'Paciente ficticio', apellido: String(i + 1), tipo_documento: 'CC', cedula: String(i + 1) },
            detalles: [{ cantidad: 1, medicamento: { nombre: 'Medicamento ficticio' } }]
        }));
    };
    fixture.handle = (req, res, url) => {
        if(fixture.enabled&&url.pathname==='/api/farmacia/dashboard/estadisticas'){
            res.setHeader('Content-Type','application/json');
            const s=summary(fixture.pedidos);res.end(JSON.stringify({ok:true,disponible:true,indicadores:{pacientesAtendidos:0,solicitudesPendientes:s.pendientes+s.preparando+s.listas,solicitudesCompletadas:0,medicamentosEntregados:0},graficos:{meses:[{mes:'2026-11',total:fixture.pedidos.length}],estados:[],pacientes:[],medicamentos:[]},actividad:[]}));return true;
        }

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
            res.end(JSON.stringify({ok:true,resumen:{total:fixture.inventory.length,disponibles:26,agotados:1,inactivos:0,inconsistentes:0,desconocidos:0},medicamentos:items.slice((pagina-1)*25,pagina*25),paginacion:{pagina,tamano:25,total:items.length,paginas:Math.ceil(items.length/25)}}));
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
        const documento = url.searchParams.get('documento');
        if (fixture.failStats) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, mensaje: 'Fallo ficticio de indicador' }));
            return true;
        }
        const filtered = fixture.pedidos.filter(p => (estado === 'todas' || (estado ? p.estado === estado : p.estado !== 'ENTREGADA')) &&
            (!documento || p.usuario.cedula === documento));
        const pagina = Number(url.searchParams.get('pagina') || 1);
        res.end(JSON.stringify({ ok: true, resumen: summary(fixture.pedidos), pedidos: filtered.slice((pagina - 1) * 25, pagina * 25).map(operation),
            paginacion: { pagina, tamano: 25, total: filtered.length, paginas: Math.ceil(filtered.length / 25) } }));
        return true;
    };
    return fixture;
}

async function testIndicators({ t, fixture, evaluate, go, click, until }) {
    await t.test('indicadores globales abren solicitudes independientes y recuperan errores sin inventar ceros', async () => {
        fixture.reset();
        try {
            await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia ficticia',rol:3})); }`);
            await go('/pages/farmacia.html');
            await until(() => evaluate('document.querySelector(\'[data-dashboard-metric="solicitudesPendientes"]\')?.textContent === "31"'));
            assert.equal(await evaluate('document.querySelector(\'[data-dashboard-metric="medicamentosEntregados"]\').textContent'), '0');
            assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-dashboard-chart]")].map(chart => chart.dataset.dashboardChart)'), ['meses', 'pacientes', 'medicamentos']);
            await go('/pages/farmacia-solicitudes.html?estado=APROBADA');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 25 && document.querySelector("#ordersPage").textContent.includes("31")'));
            await click('#ordersNext');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 6'));
            await evaluate(`document.querySelector('#documentoSolicitudFarmacia').value='30';document.querySelector('#filtroPedidos').requestSubmit();`);
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 1'));
            assert.match(await evaluate('document.querySelector("#ordersPage").textContent'), /1 de 1/);
            fixture.failStats = true; await click('#refreshFarmacia');
            await until(() => evaluate('document.querySelector("#retryFarmaciaStats").hidden === false'));
            assert.equal(await evaluate('document.querySelector(\'[data-order-count="preparando"]\').textContent'), '—');
            assert.equal(await evaluate('document.querySelectorAll(".farmacia-order").length'), 0);
            fixture.failStats = false;
            fixture.pedidos = fixture.pedidos.filter(p => p.estado !== 'PREPARANDO');
            await click('#retryFarmaciaStats');
            await until(() => evaluate('document.querySelector(\'[data-order-count="preparando"]\').textContent === "0"'));
        } finally { fixture.enabled = false; }
    });
}
async function testTransitions({ t, fixture, evaluate, go, click, until }) {
    const openApproved = async () => {
        await go('/pages/farmacia-solicitudes.html');
        await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 25'));
        await until(() => evaluate('document.querySelector("#farmaciaOrders").getAttribute("aria-busy") === "false"'));
    };
    const countsReady = () => evaluate(`document.querySelector('[data-order-count="pendientes"]').textContent === '25' && document.querySelector('[data-order-count="preparando"]').textContent === '4'`);
    await t.test('avanzar un pedido conserva la pagina en el listado de todos los estados', async () => {
        fixture.reset();
        try {
            await openApproved();
            await click('#ordersNext');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 6'));
            await click('.farmacia-order button');
            await click('#farmaciaSolicitudConfirmar');
            await until(countsReady);
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 6 && document.querySelector("#ordersPage").textContent.includes("2 de 2")'));
            assert.equal(fixture.patches, 1);
        } finally { fixture.enabled = false; }
    });
    await t.test('409 recupera el estado vigente y conserva la pagina todavia valida', async () => {
        fixture.reset(); fixture.conflict = true;
        try {
            await openApproved();
            await click('.farmacia-order button');
            await click('#farmaciaSolicitudConfirmar');
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
            await click('#farmaciaSolicitudConfirmar');
            await until(() => evaluate('document.querySelector("#retryFarmaciaOrders").hidden === false'));
            await until(() => evaluate('document.querySelector("#farmaciaMessage").textContent.includes("se actualiz")'));
            assert.equal(await evaluate('document.querySelectorAll(".farmacia-order button").length'), 0);
            assert.equal(fixture.patches, 1);
            fixture.failQueries = false;
            await click('#retryFarmaciaOrders');
            await until(countsReady);
            await until(() => evaluate('document.querySelector("#farmaciaOrdersStatus").textContent === "Solicitudes actualizadas."'));
            assert.equal(fixture.patches, 1);
            assert.equal(await evaluate('document.querySelector("#documentoSolicitudFarmacia").value'), '');
        } finally { fixture.enabled = false; }
    });
    await t.test('doble clic solo guarda una transicion y el refresco respeta el foco del operador', async () => {
        fixture.reset(); fixture.holdPatch = true;
        try {
            await openApproved();
            await evaluate(`const button=document.querySelector('.farmacia-order button');button.focus();button.click();button.click();document.querySelector('#farmaciaSolicitudConfirmar').click();document.querySelector('#farmaciaSolicitudConfirmar').click();`);
            await until(() => fixture.patches === 1 && !!fixture.releasePatch);
            assert.equal(await evaluate('document.querySelector(".farmacia-order button").disabled'), true);
            await evaluate('document.querySelector("#refreshFarmacia").focus()');
            fixture.releasePatch();
            await until(countsReady);
            assert.equal(fixture.patches, 1);
            assert.equal(await evaluate('document.activeElement.id'), 'refreshFarmacia');
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
    await t.test('farmacia conserva rutas antiguas y la pagina al recargar y navega en escritorio y movil', async () => {
        fixture.reset();
        try {
            await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
            await send('Page.navigate', { url: await evaluate('location.origin') + '/pages/farmacia.html?estado=APROBADA&pagina=2#pedidosFarmacia' });
            await until(() => evaluate('location.pathname === "/pages/farmacia-solicitudes.html" && document.querySelectorAll(".farmacia-order").length === 6'));
            assert.equal(await evaluate('new URLSearchParams(location.search).has("estado")'), false);
            await go(await evaluate('location.pathname+location.search'));
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 6'));
            assert.equal(await evaluate('new URLSearchParams(location.search).get("pagina")'), '2');
            await click('[data-farmacia-link="inventario"]');
            await until(() => evaluate('document.querySelector(\'[data-farmacia-link="inventario"]\')?.getAttribute("aria-current") === "page" && document.querySelector("#farmaciaMain").hidden === false'));
            assert.equal(await evaluate('document.querySelector("#farmaciaOrders")'), null);
            await click('[data-farmacia-link="dashboard"]');
            await until(() => evaluate('document.querySelector("#panelFarmacia") && document.querySelector("#farmaciaMain").hidden === false'));
            await capture(send, 'panel-escritorio');
            await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
            await capture(send, 'panel-movil');
            await click('#menuToggle');
            await click('[data-farmacia-link="solicitudes"]');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 25'));
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
            await go('/pages/farmacia-inventario.html');
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 25'));
            assert.match(await evaluate('document.querySelector("#inventoryPage").textContent'), /27 registros/);
            assert.match(await evaluate('document.querySelector("#farmaciaInventory tr").textContent'), /0.*Agotado/);
            await capture(send,'inventario-escritorio');
            await click('#inventoryNext');
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 2'));
            await evaluate(`document.querySelector('#buscarFarmacia').value='27';document.querySelector('#buscarInventario').requestSubmit();`);
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 1 && document.querySelector("#inventoryPage").textContent.includes("1 registros" )'));
            assert.match(await evaluate('document.querySelector("#farmaciaInventory").textContent'), /27/);
            fixture.failInventory = true;
            await click('#refreshFarmacia');
            await until(() => evaluate('document.querySelector("#inventoryEmpty").getAttribute("role") === "alert"'));
            assert.equal(await evaluate('document.querySelector("#buscarFarmacia").value'), '27');
            fixture.failInventory = false;
            await evaluate("document.querySelector('#buscarInventario').requestSubmit()");
            await until(() => evaluate('document.querySelector("#inventoryEmpty").textContent === "Información actualizada."'));
            await evaluate(`document.querySelector('#buscarFarmacia').value='sin coincidencias';document.querySelector('#buscarInventario').requestSubmit();`);
            await until(() => evaluate('document.querySelector("#inventoryEmpty").textContent.includes("No se encontraron")'));
            await click('[data-existencias="inventario"] [data-existencias-part="limpiar"]');
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
async function testChat({t,fixture,evaluate,until}) {
    await t.test('Farmacia no puede abrir los paneles retirados ni el chat compartido de paciente', async () => {
        fixture.reset();
        try {
            await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia ficticia',rol:3})); }`);
            for (const old of ['/pages/farmacia-chat.html', '/pages/farmacia-entregas.html', '/pages/chat-farmacia.html']) {
                await evaluate(`location.assign(${JSON.stringify(old)})`);
                await until(() => evaluate('location.pathname === "/pages/farmacia.html" && document.querySelector("#farmaciaMain")?.hidden === false'));
                assert.equal(await evaluate('document.querySelectorAll(".chat-page,[data-farmacia-link=chat],[data-farmacia-link=entregas]").length'), 0);
            }
        } finally { fixture.enabled = false; }
    });
}
module.exports = { createFixture, testIndicators, testTransitions, testNavigation, testInventory, testChat, capture };
