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
        fixture.inventory = Array.from({ length: 27 }, (_, i) => ({ nombre: `Medicamento ficticio ${String(i + 1).padStart(2, '0')}`, stock: i, estado: 'DISPONIBLE', categoria: { nombre: 'Categoría ficticia' } }));
        fixture.pedidos = Array.from({ length: 31 }, (_, i) => ({
            id: i + 1, estado: i < 26 ? 'APROBADA' : i < 29 ? 'PREPARANDO' : 'LISTA',
            fecha: '2026-11-13T10:00:00Z', tipo_entrega: 'RECOGER',
            usuario: { nombre: 'Paciente ficticio', apellido: String(i + 1) },
            detalles: [{ cantidad: 1, medicamento: { nombre: 'Medicamento ficticio' } }]
        }));
    };
    fixture.handle = (req, res, url) => {
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
            await go('/pages/farmacia.html#inventarioFarmacia');
            await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 25'));
            assert.match(await evaluate('document.querySelector("#inventoryPage").textContent'), /de 27/);
            assert.match(await evaluate('document.querySelector("#farmaciaInventory tr").textContent'), /0 unidades.*Sin existencias.*DISPONIBLE/);
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
module.exports = { createFixture, testIndicators, testTransitions, testNavigation, testInventory, capture };
