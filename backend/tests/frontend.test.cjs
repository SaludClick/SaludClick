const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

// Navegador aislado y servidor estático: no accede a MySQL ni usa sesiones reales.
test('controles del frontend en Edge headless', { timeout: 120000 }, async t => {
    const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (!fs.existsSync(edge)) { t.skip('Microsoft Edge no está instalado; define EDGE_PATH para ejecutar esta prueba.'); return; }
    const root = path.resolve(__dirname, '../../frontend');
    let loginCorrecto = false;
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/api/auth/login' && loginCorrecto) {
            // Respuesta controlada únicamente en este servidor de pruebas.
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, token: 'frontend-test-only', usuario: { nombre: 'Prueba', correo: 'prueba@example.com' } }));
            return;
        }
        if (pathname.startsWith('/api/')) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, mensaje: 'Servicio de datos no disponible.' }));
            return;
        }
        const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const nativeBase = process.env.SALUDCLICK_TEST_ORIGIN || base;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'saludclick-browser-'));
    const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let socket;
    t.after(() => { socket?.close(); browser.kill(); server.close(); });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(fn) { for (let i = 0; i < 150; i++) { if (await fn()) return; await delay(50); } throw new Error('Tiempo de espera agotado'); }
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => fs.existsSync(portFile));
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    const pending = new Map(), errors = [], dialogs = [], navigationRequests = [];
    let sequence = 0;
    function send(method, params = {}) {
        return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    }
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Page.frameRequestedNavigation') navigationRequests.push(message.params.url);
        if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
        if (message.method === 'Page.javascriptDialogOpening') { dialogs.push(message.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
        if (message.method === 'Fetch.requestPaused') {
            const request = message.params;
            if (!request.request.url.startsWith(base) && !request.request.url.startsWith(nativeBase)) send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
            else send('Fetch.continueRequest', { requestId: request.requestId }).catch(() => {});
        }
    });
    await send('Runtime.enable'); await send('Page.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    async function evaluate(expression) {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    async function go(route) { await send('Page.navigate', { url: base + route }); await until(async () => { try { return await evaluate(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete'`); } catch { return false; } }); }
    async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
    async function value(selector, text) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(text)}`); }
    async function enter(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); }
    const visibleNames = () => evaluate(`[...document.querySelectorAll('#catalogoMedicamentos tr')].filter(r => !r.hidden).map(r => r.cells[0].textContent)`);
    const state = () => evaluate(`JSON.parse(localStorage.getItem('saludclick_pedido_temporal_v1'))`);
    await go('/index.html');
    await evaluate(`localStorage.setItem('saludclick_token', 'frontend-test-only'); localStorage.setItem('saludclick_user', JSON.stringify({nombre:'Prueba',correo:'prueba@example.com'}))`);
    await t.test('inicio: buscar, Enter, vacío, solicitar y servicios', async () => {
        await click('#buscarInicio'); assert.equal(await evaluate('location.pathname'), '/index.html');
        assert.ok(await evaluate('document.querySelector("#buscadorInicio").validationMessage'));
        await value('#buscadorInicio', 'acetaminofen'); await click('#buscarInicio');
        await until(async () => { try { return (await visibleNames()).length === 1; } catch { return false; } });
        assert.deepEqual(await visibleNames(), ['Acetaminofén']);
        assert.equal(await evaluate('location.search'), '?buscar=acetaminofen');
        await go('/index.html'); await value('#buscadorInicio', 'acetaminofen'); await enter('#buscadorInicio');
        await until(async () => { try { return (await visibleNames()).length === 1; } catch { return false; } });
        assert.deepEqual(await visibleNames(), ['Acetaminofén']);
        await go('/index.html'); await click('.hero-botones a');
        await until(async () => { try { return (await visibleNames()).length === 5; } catch { return false; } });
        await go('/index.html'); await click('.hero-botones a[href="#servicios"]');
        await until(() => evaluate('scrollY > 0'));
        assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollBehavior'), 'smooth');
        for (const action of ['domicilio', 'formula']) { await click(`[data-servicio="${action}"]`); assert.match(await evaluate('document.querySelector("#mensajeServicio").textContent'), /no está disponible/); }
    });
    await go('/pages/medicamentos.html');
    await t.test('cinco búsquedas por nombre, Enter, limpiar y parámetro', async () => {
        assert.equal((await visibleNames()).length, 5);
        for (const [query, expected] of [['acetaminofen','Acetaminofén'],['IBUPROFENO','Ibuprofeno'],['loratadina','Loratadina'],['Omeprazol','Omeprazol'],['Amoxicilina','Amoxicilina']]) {
            await value('#buscadorMedicamentos', query); await click('#buscarMedicamentos'); assert.deepEqual(await visibleNames(), [expected]);
        }
        await value('#buscadorMedicamentos','Acetaminofén'); await enter('#buscadorMedicamentos'); assert.deepEqual(await visibleNames(),['Acetaminofén']);
        await value('#buscadorMedicamentos','500 mg'); await click('#buscarMedicamentos'); assert.equal((await visibleNames()).length,0);
        await click('#limpiarMedicamentos'); assert.equal((await visibleNames()).length,5);
        await go('/pages/medicamentos.html?buscar=IBUPROFENO'); assert.deepEqual(await visibleNames(),['Ibuprofeno']);
        await click('#limpiarMedicamentos'); assert.equal((await visibleNames()).length,5); assert.equal(await evaluate('location.search'),'');
    });
    await t.test('agregar cinco, duplicado, cantidades, eliminar, persistencia y vaciar', async () => {
        assert.equal(await evaluate('document.querySelector("#confirmarPedido").disabled'),true);
        for (const id of [1,2,3,4,5]) await click(`[data-medicamento-id="${id}"]`);
        assert.equal((await state()).borrador.length,5);
        await click('[data-medicamento-id="1"]'); assert.equal((await state()).borrador.length,5); assert.equal((await state()).borrador[0].cantidad,2);
        await click('[aria-label="Aumentar Acetaminofén"]'); assert.equal((await state()).borrador[0].cantidad,3);
        await click('[aria-label="Disminuir Acetaminofén"]'); await click('[aria-label="Disminuir Acetaminofén"]'); assert.equal((await state()).borrador[0].cantidad,1);
        assert.equal(await evaluate(`document.querySelector('[aria-label="Disminuir Acetaminofén"]').disabled`),true);
        await value('[aria-label="Cantidad de Acetaminofén"]','-2');
        await evaluate(`document.querySelector('[aria-label="Cantidad de Acetaminofén"]').dispatchEvent(new Event("change"))`);
        assert.equal((await state()).borrador[0].cantidad,1);
        await go('/pages/medicamentos.html'); assert.equal((await state()).borrador.length,5); assert.equal(await evaluate('document.querySelector("#totalSeleccionado").textContent'),'5');
        await click('[aria-label="Eliminar Acetaminofén"]'); assert.equal((await state()).borrador.length,4);
        await click('#vaciarPedido'); assert.equal((await state()).borrador.length,0);
        assert.equal(await evaluate('document.querySelector("#confirmarPedido").disabled'),true);
    });
    await t.test('confirmar y mostrar en Pedidos e Historial', async () => {
        for (const id of [1,2,3,4,5]) await click(`[data-medicamento-id="${id}"]`);
        await click('#confirmarPedido'); const pedido = (await state()).confirmados[0];
        assert.match(pedido.id,/^LOCAL-/); assert.equal(pedido.totalUnidades,5); assert.equal(pedido.medicamentos.length,5);
        assert.equal(await evaluate('document.querySelector("#mensajePedido").textContent'),'Pedido guardado temporalmente en este navegador.');
        await click('a[href="pedidos.html"]');
        await until(() => evaluate('!!document.querySelector("#tablaPedidos tr")'));
        assert.match(await evaluate('document.querySelector("#tablaPedidos").textContent'),/Pedido local de prueba/);
        assert.ok((await evaluate('document.querySelector("#tablaPedidos").textContent')).includes(pedido.id));
        await go('/pages/historial.html'); assert.ok((await evaluate('document.querySelector("#tablaHistorial").textContent')).includes(pedido.id));
    });
    await t.test('perfil: validación, guardar sin falso éxito y cancelar', async () => {
        await go('/pages/perfil.html'); assert.equal(await evaluate('document.querySelector("#email").value'),'prueba@example.com');
        await value('#nombre','Editado'); await click('#guardarPerfil');
        assert.match(await evaluate('document.querySelector("#mensajePerfil").textContent'),/servicio de datos no está disponible/);
        assert.equal(await evaluate('JSON.parse(localStorage.getItem("saludclick_user")).nombre'),'Prueba');
        await click('#cancelarPerfil'); assert.equal(await evaluate('document.querySelector("#nombre").value'),'Prueba');
    });
    await t.test('menús móviles, navegación local y dashboard sin listeners duplicados', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        for (const route of ['/index.html','/pages/medicamentos.html','/pages/pedidos.html','/pages/historial.html','/pages/perfil.html']) {
            await go(route); await click('#menuToggle'); assert.equal(await evaluate('getComputedStyle(document.querySelector("#menu")).display'),'flex');
            await click('#menuToggle'); assert.equal(await evaluate('document.querySelector("#menu").classList.contains("active")'),false);
            const links = await evaluate('[...document.querySelectorAll("a[href]")].map(a=>a.href).filter(h=>h.startsWith(location.origin))');
            for (const link of links) assert.equal((await fetch(link)).status,200,link);
        }
        await go('/pages/dashboard.html'); await click('#menuToggle'); assert.equal(await evaluate('document.querySelector("#sidebar").classList.contains("sidebar-closed")'),false);
        await click('#closeSidebar'); assert.equal(await evaluate('document.querySelector("#sidebar").classList.contains("sidebar-closed")'),true);
        await click('#userBtn'); assert.equal(await evaluate('document.querySelector("#userDropdown").classList.contains("active")'),true);
        assert.equal(await evaluate('document.querySelector("#totalPedidos").textContent'),'1');
        await click('#logoutDropdown'); await until(() => evaluate('location.pathname === "/login.html"'));
        assert.equal(await evaluate('localStorage.getItem("saludclick_token")'),null); assert.ok(await state());
    });
    await t.test('registro: contraseñas, documentos y error real de servicio', async () => {
        await go('/registro.html'); await click('#mostrarPassword'); assert.equal(await evaluate('document.querySelector("#password").type'),'text');
        await click('#mostrarConfirmarPassword'); assert.equal(await evaluate('document.querySelector("#confirmarPassword").type'),'text');
        for (const type of ['terminos','privacidad']) { await click(`[data-aviso-legal="${type}"]`); assert.match(await evaluate('document.querySelector("#avisoLegal").textContent'),/no está publicado/); }
        for (const [id,text] of [['nombre','Prueba Local'],['correo','prueba@example.com'],['telefono','3001234567'],['numeroDocumento','123456'],['password','passwordtest'],['confirmarPassword','passwordtest']]) await value('#'+id,text);
        await click('#aceptoTerminos'); await click('button[type="submit"]'); await until(() => dialogs.some(s=>s.includes('Servicio de datos no disponible')));
        assert.equal(await evaluate('location.pathname'),'/registro.html');
    });
    await t.test('sesión temporal, persistente y logout usan las claves existentes', async () => {
        const result = await evaluate(`(async()=>{ const a=await import('/js/auth.js'); a.setSession('test-session',{nombre:'Temporal'},false); const temporal=sessionStorage.getItem('saludclick_token')==='test-session' && localStorage.getItem('saludclick_token')===null && a.getToken()==='test-session'; a.setSession('test-persist',{nombre:'Persistente'},true); return temporal && localStorage.getItem('saludclick_token')==='test-persist' && sessionStorage.getItem('saludclick_token')===null; })()`);
        assert.equal(result,true);
        await go('/pages/dashboard.html'); await click('#logoutSidebar'); await until(() => evaluate('location.pathname === "/login.html"'));
        assert.equal(await evaluate('localStorage.getItem("saludclick_token") || sessionStorage.getItem("saludclick_token")'),null);
    });
    await t.test('login, recuperación y restablecer no simulan éxito con servicio caído', async () => {
        for (const item of [
            { route: '/login.html', fields: [['email','prueba@example.com'],['password','passwordtest']] },
            { route: '/recuperar.html', fields: [['emailRecuperar','prueba@example.com']] },
            { route: '/restablecer.html?token=frontend-test-only', fields: [['nuevaPassword','passwordtest'],['confirmarPassword','passwordtest']] }
        ]) {
            await go(item.route);
            for (const [id,text] of item.fields) await value('#'+id,text);
            const count = dialogs.length;
            await click('button[type="submit"]');
            await until(() => dialogs.length > count);
            assert.match(dialogs.at(-1), /Servicio de datos no disponible/);
            assert.equal(await evaluate('location.pathname'),item.route.split('?')[0]);
        }
    });
    await t.test('todos los enlaces internos, scripts y tipos de botón existen', async () => {
        const routes = fs.readdirSync(root).filter(f=>f.endsWith('.html')).map(f=>'/'+f)
            .concat(fs.readdirSync(path.join(root,'pages')).filter(f=>f.endsWith('.html')).map(f=>'/pages/'+f));
        // Sesión ficticia únicamente en el perfil aislado de esta prueba.
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only')`);
        for (const route of routes) {
            if (route === '/restablecer.html') await go(route+'?token=frontend-test-only');
            else await go(route);
            const controls = await evaluate(`({ links:[...document.querySelectorAll('a[href],script[src]')].map(e=>e.href||e.src), empty:[...document.querySelectorAll('a[href]')].filter(e=>e.getAttribute('href')==='#').length, buttons:[...document.querySelectorAll('button')].every(e=>e.hasAttribute('type')) })`);
            assert.equal(controls.empty,0,route); assert.equal(controls.buttons,true,route);
            for (const link of controls.links.filter(link=>link.startsWith(base))) {
                const url = new URL(link);
                assert.equal((await fetch(url)).status,200,link);
                if (url.hash && url.pathname === route) assert.equal(await evaluate(`!!document.getElementById(${JSON.stringify(decodeURIComponent(url.hash.slice(1)))})`),true,link);
            }
        }
    });
    const destinoKey = 'saludclick_destino_pendiente_v1';
    async function sinSesion() {
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.removeItem('saludclick_token'); s.removeItem('saludclick_user'); } sessionStorage.removeItem('${destinoKey}')`);
    }
    async function esperarPagina(route) {
        await until(async () => { try { return await evaluate(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete'`); } catch { return false; } });
    }
    async function login() {
        loginCorrecto = true;
        await value('#email','prueba@example.com'); await value('#password','passwordtest');
        await click('button[type="submit"]');
    }
    await t.test('sin sesión: buscar/Enter, solicitar, consultar, estado e historial vuelven a su destino tras login', async () => {
        for (const item of [
            { selector: '#buscarInicio', query: 'acetaminofen', destino: '/pages/medicamentos.html?buscar=acetaminofen' },
            { selector: '#buscadorInicio', enter: true, query: 'acetaminofen', destino: '/pages/medicamentos.html?buscar=acetaminofen' },
            { selector: '.hero-botones a', destino: '/pages/medicamentos.html' },
            { selector: '[data-servicio="medicamentos"]', destino: '/pages/medicamentos.html' },
            { selector: '[data-servicio="pedidos"]', destino: '/pages/pedidos.html' },
            { selector: '[data-servicio="historial"]', destino: '/pages/historial.html' }
        ]) {
            await go('/index.html'); await sinSesion();
            if (item.query) await value('#buscadorInicio',item.query);
            if (item.enter) await enter(item.selector); else await click(item.selector);
            await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),item.destino);
            await login(); await esperarPagina(item.destino);
            assert.equal(await evaluate('location.pathname + location.search'),item.destino);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
            if (item.query) assert.deepEqual(await visibleNames(),['Acetaminofén']);
        }
    });
    await t.test('domicilio y fórmula requieren login antes de mostrar indisponibilidad', async () => {
        for (const accion of ['domicilio','formula']) {
            await go('/index.html'); await sinSesion(); await click(`[data-servicio="${accion}"]`);
            await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),`/index.html?accion=${accion}#servicios`);
            await login(); await esperarPagina('/index.html');
            assert.match(await evaluate('document.querySelector("#mensajeServicio").textContent'),/no está disponible/);
        }
    });
    await t.test('las cinco páginas privadas recuerdan accesos directos y no entran en bucle', async () => {
        for (const pagina of ['dashboard','medicamentos','pedidos','historial','perfil']) {
            await go('/index.html'); await sinSesion();
            const route = `/pages/${pagina}.html`;
            await send('Page.navigate',{url:base+route}); await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),route);
            await login(); await esperarPagina(route);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        }
    });
    await t.test('login fallido y recarga conservan destino; éxito lo consume una sola vez', async () => {
        await go('/index.html'); await sinSesion(); await click('[data-servicio="pedidos"]'); await esperarPagina('/login.html');
        loginCorrecto = false;
        await value('#email','prueba@example.com'); await value('#password','incorrecta');
        const count = dialogs.length; await click('button[type="submit"]'); await until(()=>dialogs.length>count);
        assert.equal(await evaluate('location.pathname'),'/login.html');
        assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),'/pages/pedidos.html');
        await go('/login.html'); assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),'/pages/pedidos.html');
        await login(); await esperarPagina('/pages/pedidos.html');
        await go('/login.html'); await login(); await esperarPagina('/pages/dashboard.html');
    });
    await t.test('destinos externos, login y rutas inexistentes se rechazan', async () => {
        const invalidos = ['https://example.com','//example.com','/\\example.com','javascript:alert(1)','/login.html','/pages/no-existe.html','/index.html?accion=externa','/pages/medicamentos.html\n'];
        assert.deepEqual(await evaluate(`(async()=>{const a=await import('/js/auth.js');return ${JSON.stringify(invalidos)}.map(a.validarDestino)})()`),invalidos.map(()=>null));
        await go('/index.html'); await sinSesion(); await go('/login.html');
        await evaluate(`sessionStorage.setItem('${destinoKey}','https://example.com')`);
        await login(); await esperarPagina('/pages/dashboard.html');
        assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
    });
    await t.test('sin sesión no se modifica el pedido aunque la página ya estuviera abierta', async () => {
        for (const selector of ['[data-medicamento-id="1"]','[aria-label="Aumentar Acetaminofén"]','[aria-label="Disminuir Acetaminofén"]','[aria-label="Eliminar Acetaminofén"]','#vaciarPedido','#confirmarPedido']) {
            await go('/pages/medicamentos.html');
            if (!(await state()).borrador.some(item=>item.id===1)) await click('[data-medicamento-id="1"]');
            await click('[data-medicamento-id="1"]');
            const before = await state(); await sinSesion(); await click(selector); await esperarPagina('/login.html');
            assert.deepEqual(await state(),before);
            await login(); await esperarPagina('/pages/medicamentos.html');
        }
    });
    await t.test('sesión: cinco medicamentos, confirmar, logout limpia destino y volver exige login', async () => {
        await go('/pages/medicamentos.html'); await click('#vaciarPedido');
        for (const id of [1,2,3,4,5]) await click(`[data-medicamento-id="${id}"]`);
        assert.equal((await state()).borrador.length,5);
        const previos = (await state()).confirmados.length;
        await click('#confirmarPedido'); assert.equal((await state()).confirmados.length,previos+1);
        assert.equal((await state()).confirmados.at(-1).totalUnidades,5);
        const before = await state();
        await go('/pages/dashboard.html'); await evaluate(`sessionStorage.setItem('${destinoKey}','/pages/perfil.html')`);
        await click('#logoutSidebar'); await esperarPagina('/login.html');
        assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        assert.equal(await evaluate('localStorage.getItem("saludclick_token") || sessionStorage.getItem("saludclick_token")'),null);
        await send('Page.navigate',{url:base+'/pages/pedidos.html'}); await esperarPagina('/login.html');
        assert.deepEqual(await state(),before);
    });
    async function abrirInicioReal() {
        await send('Page.navigate',{url:nativeBase+'/index.html'});
        await esperarPagina('/index.html');
    }
    async function mouseClick(selector) {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'center'})`);
        const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
        await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    }
    await t.test('clics de ratón reales en los cinco servicios privados sin sesión', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
        for (const [accion,destino] of [
            ['medicamentos','/pages/medicamentos.html'],['domicilio','/index.html?accion=domicilio#servicios'],
            ['pedidos','/pages/pedidos.html'],['formula','/index.html?accion=formula#servicios'],['historial','/pages/historial.html']
        ]) {
            await abrirInicioReal();
            await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token')`);
            await abrirInicioReal();
            await mouseClick(`#servicios [data-servicio="${accion}"]`);
            await esperarPagina('/login.html');
            assert.equal(await evaluate('location.pathname'),'/login.html',accion);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),destino);
            t.diagnostic(`${accion}: clic real -> ${await evaluate('location.href')}`);
        }
    });
    await t.test('clic real en Contactar sin autenticación solicita abrir el correo', async () => {
        await abrirInicioReal(); await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token')`); await abrirInicioReal();
        await mouseClick('#servicios [data-servicio="contacto"]');
        await until(()=>navigationRequests.includes('mailto:contacto@saludclick.com'));
        assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        t.diagnostic('Contactar: clic real -> mailto:contacto@saludclick.com (sin enviar correo)');
    });
    await t.test('clics reales en Iniciar Sesión y Registrarse', async () => {
        for (const [href,destino] of [['login.html','/login.html'],['registro.html','/registro.html']]) {
            await abrirInicioReal(); await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token')`); await abrirInicioReal();
            await mouseClick(`.botones-nav a[href="${href}"]`); await esperarPagina(destino);
            t.diagnostic(`${href}: clic real -> ${await evaluate('location.href')}`);
        }
    });
    await t.test('cinco medicamentos de inicio: botones reales sin y con sesión, Ver todos y responsive', async () => {
        const tarjetas = [
            ['acetaminofen', '/pages/medicamentos.html?buscar=acetaminofen'],
            ['ibuprofeno', '/pages/medicamentos.html?buscar=ibuprofeno'],
            ['loratadina', '/pages/medicamentos.html?buscar=loratadina'],
            ['omeprazol', '/pages/medicamentos.html?buscar=omeprazol'],
            ['amoxicilina', '/pages/medicamentos.html?buscar=amoxicilina']
        ];
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        await go('/index.html');
        assert.equal(await evaluate('document.querySelectorAll("#medicamentosInicio .medicamento-card").length'),5);
        assert.equal(await evaluate('getComputedStyle(document.querySelector("#medicamentosInicio .grid-medicamentos-inicio")).display'),'grid');
        for (const [busqueda, destino] of tarjetas) {
            await go('/index.html');
            await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token'); localStorage.removeItem('saludclick_user')`);
            await go('/index.html');
            await mouseClick(`.btn-solicitar-medicamento[data-busqueda="${busqueda}"]`);
            await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),destino);
        }
        await go('/index.html'); await evaluate(`sessionStorage.clear(); localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Prueba'}))`); await go('/index.html');
        for (const [busqueda, destino] of tarjetas) {
            await go('/index.html');
            await mouseClick(`.btn-solicitar-medicamento[data-busqueda="${busqueda}"]`);
            await esperarPagina('/pages/medicamentos.html');
            assert.equal(await evaluate('location.pathname + location.search'),destino);
        }
        await go('/index.html'); await mouseClick('.medicamentos-ver-todos'); await esperarPagina('/pages/medicamentos.html');
        assert.equal(await evaluate('location.pathname + location.search'),'/pages/medicamentos.html');
    });
    await t.test('imágenes locales de los cinco medicamentos cargan en Inicio y Medicamentos', async () => {
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Prueba'}))`);
        await go('/index.html');
        const inicioImagenes = await evaluate(`[...document.querySelectorAll('#catalogoInicio .medicamento-imagen')].map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}))`);
        assert.equal(inicioImagenes.length,5);
        for (const imagen of inicioImagenes) { assert.equal(imagen.complete,true); assert.ok(imagen.width > 0 && imagen.height > 0); assert.equal((await fetch(new URL(imagen.src,base))).status,200); }
        await go('/pages/medicamentos.html');
        const catalogoImagenes = await evaluate(`[...document.querySelectorAll('#catalogoMedicamentos .tabla-medicamento-imagen')].map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}))`);
        assert.equal(catalogoImagenes.length,5);
        for (const imagen of catalogoImagenes) { assert.equal(imagen.complete,true); assert.ok(imagen.width > 0 && imagen.height > 0); assert.equal((await fetch(new URL(imagen.src,base))).status,200); }
    });
    await t.test('sin excepciones JavaScript propias', () => assert.deepEqual(errors,[]));
});
