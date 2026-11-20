// Static UI and in-memory responses only. Never loads .env or database clients.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const modules = ['dashboard','usuarios','solicitudes','inventario','medicamentos','entregas','notificaciones','chat','perfil'];
const names = ['Dashboard','Usuarios','Solicitudes','Inventario','Medicamentos','Entregas','Notificaciones','Chat','Perfil'];
const route = module => '/pages/farmacia' + (module === 'dashboard' ? '' : '-' + module) + '.html';

test('contexto de Farmacia limita retornos a sus rutas y migra enlaces antiguos sin conceder acceso clínico', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/public/js/farmacia-context.js'), 'utf8');
    const policy = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const previous = global.window; global.window = { location: { origin: 'http://localhost' } };
    try {
        assert.equal(policy.farmaciaReturnUrl('/pages/farmacia.html?estado=APROBADA&pagina=2#pedidosFarmacia'), '/pages/farmacia-solicitudes.html?estado=APROBADA&pagina=2');
        for (const target of ['https://evil.test/pages/farmacia.html','/pages/admin.html','/pages/formulas.html','/pages/farmacia-formulas.html']) assert.equal(policy.farmaciaReturnUrl(target), '/pages/farmacia.html');
        assert.equal(policy.farmaciaReturnUrl('/pages/farmacia-inventario.html?buscar=aspirina&inventarioPagina=2&formula=desconocido&private=secret'), '/pages/farmacia-inventario.html?buscar=aspirina&inventarioPagina=2&formula=desconocido');
    } finally { if (previous === undefined) delete global.window; else global.window = previous; }
});

test('navegador: nueve pantallas independientes, permisos, módulos aislados, llamadas únicas y responsive', { timeout: 120000 }, async t => {
    if (!fs.existsSync(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')) { t.skip('Edge no disponible'); return; }
    const root = path.resolve(__dirname, '../../frontend/dist');
    const calls = []; let access = 200, denyOrders = false;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/api/')) {
            calls.push(url.pathname + url.search);
            res.setHeader('Content-Type', 'application/json');
            const send = data => res.end(JSON.stringify(data));
            const vinculacion = { estado: 'SIN_VINCULO', eps: null, mensaje: 'No tienes una EPS vinculada. Solicita la vinculación al personal administrativo autorizado.' };
            if (url.pathname === '/api/farmacia/eps') return send({ ok: true, vinculacion });
            if (url.pathname === '/api/farmacia/usuarios') return send({ ok: true, vinculacion, pacientes: [], totalActivos: 0, paginacion: { pagina: 1, tamano: 25, total: 0, paginas: 0 } });
            if (url.pathname === '/api/farmacia/verificar-acceso') { res.statusCode = access; return send({ ok: access === 200, mensaje: 'Acceso no vigente.' }); }
            if (url.pathname === '/api/integracion/farmacia/pedidos') {
                if (denyOrders) { res.statusCode = 503; return send({ ok: false, codigo: 'FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE', mensaje: 'Falta titularidad verificable del pedido.' }); }
                return send({ ok: true, resumen: { pendientes: 0, preparando: 0, listas: 0, entregadas: 0 }, pedidos: [], paginacion: { pagina: 1, tamano: 25, total: 0, paginas: 0 } });
            }
            if (['/api/farmacia/inventario','/api/farmacia/medicamentos'].includes(url.pathname)) return send({ ok: true, resumen: { total: 0, disponibles: 0, agotados: 0, inconsistentes: 0, desconocidos: 0 }, medicamentos: [], paginacion: { pagina: 1, tamano: 25, total: 0, paginas: 0 } });
            if (url.pathname === '/api/farmacia/notificaciones') { res.statusCode = 503; return send({ ok: false, codigo: 'FARMACIA_NOTIFICACIONES_NO_DISPONIBLES', mensaje: 'Las notificaciones de Farmacia aún no están disponibles.' }); }
            if (url.pathname === '/api/chat/conversaciones') return send({ ok: true, conversaciones: [] });
            if (url.pathname === '/api/auth/profile') return send({ ok: true, usuario: { id: 30, nombre: 'Farmacia', apellido: 'Prueba', correo: 'test@example.test' } });
            res.statusCode = 403; return send({ ok: false, mensaje: 'Operación no autorizada en esta prueba.' });
        }
        const file = path.resolve(root, '.' + url.pathname);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await require('./support/afiliados-edge.cjs').abrirEdge();
    const { evaluate, send, until } = browser;
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            window.SALUDCLICK_API_URL=location.origin;
            sessionStorage.setItem('saludclick_token','isolated-page-token');
            sessionStorage.setItem('saludclick_user',JSON.stringify({id:30,rol:3,nombre:'Farmacia'}));
            window.io=()=>({connected:true,on(event,cb){if(event==='connect')setTimeout(cb,20);return this;},emit(){},disconnect(){}});
        ` });
        for (const module of modules) {
            const before = calls.length;
            await send('Page.navigate', { url: origin + route(module) });
            await until(() => evaluate('document.querySelector("#farmaciaApp")?.dataset.authorized === "true"'));
            if (module === 'dashboard') await until(() => evaluate('document.querySelector("#farmaciaDashboardStockStatus").textContent.includes("actualizados")'));
            if (['solicitudes','entregas'].includes(module)) await until(() => evaluate('document.querySelector("#farmaciaOrders").getAttribute("aria-busy") === "false"'));
            if (['inventario','medicamentos'].includes(module)) await until(() => evaluate('document.querySelector("tbody").getAttribute("aria-busy") === "false"'));
            if (module === 'perfil') await until(() => evaluate('document.querySelector("#nombre").value === "Farmacia Prueba"'));
            if (module === 'chat') await until(() => evaluate('document.querySelector(".chat-empty-list") !== null'));
            if (module === 'notificaciones') await until(() => evaluate('document.querySelector("#farmaciaNotificationsStatus").getAttribute("role") === "alert"'));
            await until(() => evaluate('document.querySelector("#farmaciaLinkedEps").textContent.includes("No tienes una EPS vinculada")'));
            assert.deepEqual(await evaluate('[...document.querySelectorAll(".admin-side-nav a span")].map(el=>el.textContent)'), names);
            assert.equal(await evaluate('document.querySelectorAll(".admin-side-nav [aria-current=page]").length'), 1);
            assert.equal(await evaluate('document.querySelector(".admin-side-nav [aria-current=page]").dataset.farmaciaLink'), module);
            assert.equal(await evaluate('document.querySelectorAll(".admin-side-nav a[href*=formulas]").length'), 0);
            assert.equal(await evaluate('document.querySelectorAll("main").length'), 1);
            assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
            const actual = calls.slice(before).map(url => url.split('?')[0]);
            const expected = ['/api/farmacia/verificar-acceso'];
            expected.push(module === 'usuarios' ? '/api/farmacia/usuarios' : '/api/farmacia/eps');
            if (module === 'dashboard') expected.push('/api/integracion/farmacia/pedidos','/api/farmacia/inventario');
            if (['solicitudes','entregas'].includes(module)) expected.push('/api/integracion/farmacia/pedidos');
            if (['inventario','medicamentos','notificaciones'].includes(module)) expected.push('/api/farmacia/' + module);
            if (module === 'perfil') expected.push('/api/auth/profile');
            if (module === 'chat') expected.push('/api/chat/conversaciones');
            assert.deepEqual(actual.sort(), expected.sort(), module + ': solo una carga por API necesaria');
            if (module === 'usuarios') {
                assert.match(await evaluate('document.querySelector("#farmaciaUsuariosStatus").textContent'), /No tienes una EPS vinculada/);
                assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosTable").hidden'), true);
                assert.equal(await evaluate('document.querySelector("#farmaciaUsuariosBuscar").disabled'), true);
                assert.equal(await evaluate('document.querySelectorAll("#farmaciaUsuariosRows tr").length'), 0);
            }
            if (module === 'dashboard') assert.equal(await evaluate('document.querySelectorAll("#farmaciaOrders,tbody,#farmaciaNotificationsList,form").length'), 0);
            if (module === 'entregas') assert.deepEqual(await evaluate('[...document.querySelector("#estadoFarmacia").options].map(o=>o.value)'), ['LISTA','ENTREGADA']);
            for (const width of [1440,820,390]) {
                await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
                assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), module + ' ancho ' + width);
            }
            await evaluate('document.querySelector("#menuToggle").click()');
            assert.equal(await evaluate('document.querySelector("#menuToggle").getAttribute("aria-expanded")'), 'true');
            await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');
            assert.equal(await evaluate('document.querySelector("#menu").inert'), true);
            await send('Emulation.clearDeviceMetricsOverride');
        }
        // Una respuesta sin ámbito retira todo dato anterior y nunca ofrece escritura.
        await send('Page.navigate', { url: origin + route('entregas') });
        await until(() => evaluate('document.querySelector("#farmaciaOrders")?.getAttribute("aria-busy") === "false"'));
        await evaluate(`document.querySelector('#farmaciaOrders').textContent='Registro anterior'; document.querySelector('[data-order-count="listas"]').textContent='99'`);
        denyOrders = true;
        await evaluate('document.querySelector("#refreshFarmacia").click()');
        await until(() => evaluate('document.querySelector("#farmaciaOrdersStatus").getAttribute("role") === "alert"'));
        assert.equal(await evaluate('document.querySelector("#farmaciaOrders").textContent'), '');
        assert.equal(await evaluate('document.querySelector("[data-order-count= listas]").textContent'), '—');
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaOrders button").length'), 0);
        for (const width of [1440,820,390]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
            assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
        }
        await send('Emulation.clearDeviceMetricsOverride');
        denyOrders = false;
        // The old human-chat URL retains its patient contract and sends staff to
        // the common pharmacy shell, preserving the approved return destination.
        const back = '/pages/farmacia-solicitudes.html?estado=LISTA&pagina=2';
        await send('Page.navigate', { url: origin + '/pages/chat-farmacia.html?volver=' + encodeURIComponent(back) });
        await until(() => evaluate('location.pathname === "/pages/farmacia-chat.html" && document.querySelector("#farmaciaApp")?.dataset.authorized === "true"'));
        await until(() => evaluate('document.querySelector(".chat-empty-list") !== null'));
        assert.equal(await evaluate('new URL(document.querySelector("#farmaciaChatReturn").href).pathname'), '/pages/farmacia-solicitudes.html');
        // A revoked account cannot load another module's API or reveal its screen.
        access = 403;
        for (const module of modules) {
            const before = calls.length;
            await send('Page.navigate', { url: origin + route(module) });
            await until(() => evaluate('document.querySelector("#farmaciaAccessStatus")?.getAttribute("role") === "alert"'));
            assert.equal(await evaluate('document.querySelector("#farmaciaMain").hidden'), true);
            assert.deepEqual(calls.slice(before), ['/api/farmacia/verificar-acceso']);
        }
        assert.equal(calls.some(url => /\/admin\/|\/formulas/.test(url)), false);
        assert.deepEqual(browser.errores, []);
    } finally { await browser.cerrar(); await new Promise(resolve => server.close(resolve)); }
});
