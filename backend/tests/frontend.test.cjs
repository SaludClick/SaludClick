const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

// Navegador aislado y servidor estático: no accede a PostgreSQL ni usa sesiones reales.
test('controles del frontend en Edge headless', { timeout: 120000 }, async t => {
    const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (!fs.existsSync(edge)) { t.skip('Microsoft Edge no estÃ¡ instalado; define EDGE_PATH para ejecutar esta prueba.'); return; }
    const realCaptcha = process.env.FRONTEND_TEST_ALLOW_EXTERNAL === '1';
    const root = process.env.FRONTEND_TEST_ROOT
        ? path.resolve(process.env.FRONTEND_TEST_ROOT)
        : path.resolve(__dirname, '../../frontend/public');
    let loginCorrecto = false;
    let loginRequests = 0;
    let orderRequests = 0;
    const orderIdempotencyKeys = [];
    const medicamentos = [
        ['Acetaminofén', 'Analgésicos', '500 mg', 'acetaminofen.svg'],
        ['Ibuprofeno', 'Antiinflamatorios', '400 mg', 'ibuprofeno.svg'],
        ['Amoxicilina', 'Antibióticos', '500 mg', 'amoxicilina.svg'],
        ['Loratadina', 'Antialérgicos', '10 mg', 'loratadina.svg'],
        ['Omeprazol', 'Gastrointestinales', '20 mg', 'omeprazol.svg']
    ].map(([nombre, categoria, descripcion, imagen], index) => ({
        id: index + 1,
        nombre,
        categoria,
        categoria_id: index + 1,
        descripcion,
        precio: 1000,
        stock: 10,
        estado: 'DISPONIBLE',
        imagen: `/images/medicamentos/${imagen}`
    }));
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/api/medicamentos') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, medicamentos }));
            return;
        }
        if (pathname === '/api/auth/login') loginRequests += 1;
        if (pathname === '/api/pedidos' && req.method === 'POST') {
            orderRequests += 1;
            orderIdempotencyKeys.push(req.headers['idempotency-key']);
        }
        if (pathname === '/api/auth/login' && loginCorrecto) {
            // Respuesta controlada Ãºnicamente en este servidor de pruebas.
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
    const base = `http://${realCaptcha ? 'localhost' : '127.0.0.1'}:${server.address().port}`;
    const nativeBase = process.env.SALUDCLICK_TEST_ORIGIN || base;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'saludclick-browser-'));
    const portProbe = net.createServer();
    const devtoolsPort = await new Promise((resolve, reject) => {
        portProbe.once('error', reject);
        portProbe.listen(0, '127.0.0.1', () => {
            const selectedPort = portProbe.address().port;
            portProbe.close(error => error ? reject(error) : resolve(selectedPort));
        });
    });
    const browser = spawn(edge, [
        '--headless=new', '--disable-gpu', '--no-first-run',
        `--remote-debugging-port=${devtoolsPort}`, `--user-data-dir=${profile}`, 'about:blank'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let socket;
    let browserError;
    let browserExit;
    let browserStderr = '';
    browser.stderr.on('data', chunk => { browserStderr = (browserStderr + chunk.toString()).slice(-2000); });
    browser.once('error', error => { browserError = error; });
    browser.once('exit', (code, signal) => { browserExit = { code, signal }; });
    t.after(async () => {
        socket?.close();
        if (browser.exitCode === null && browser.signalCode === null && browser.pid) {
            if (process.platform === 'win32') {
                // Edge starts renderer/utility children. Terminate only this
                // test's spawned process tree, never other Edge instances.
                await new Promise(resolve => {
                    const killer = spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
                    killer.once('error', resolve);
                    killer.once('close', resolve);
                });
            } else {
                browser.kill();
            }
        }
        if (!browserExit && browser.exitCode === null) {
            await new Promise(resolve => {
                const timer = setTimeout(resolve, 5000);
                browser.once('exit', () => { clearTimeout(timer); resolve(); });
            });
        }
        await new Promise(resolve => server.close(resolve));
        for (let attempt = 0; ; attempt++) {
            try {
                fs.rmSync(profile, { recursive: true, force: true });
                break;
            } catch (error) {
                if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code) || attempt >= 50) throw error;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(fn, timeoutMs = 7500) {
        const deadline = Date.now() + timeoutMs;
        let lastError = '';
        while (Date.now() < deadline) {
            if (browserError) throw new Error(`Edge no pudo iniciarse: ${browserError.message}`);
            if (browserExit) throw new Error(`Edge terminó durante el inicio (código ${browserExit.code}, señal ${browserExit.signal || 'ninguna'}).`);
            try { if (await fn()) return; }
            catch (error) { lastError = error.message; }
            await delay(50);
        }
        const diagnostics = [
            lastDevtoolsError && `DevTools: ${lastDevtoolsError}`,
            `puerto DevTools: ${devtoolsPort}`,
            browserStderr.trim() && `stderr Edge: ${browserStderr.trim()}`
        ].filter(Boolean).join('; ');
        throw new Error(`Tiempo de espera agotado${lastError ? `; último error: ${lastError}` : ''}${diagnostics ? `; ${diagnostics}` : ''}`);
    }
    let lastDevtoolsError = '';
    await until(async () => {
        for (const host of ['127.0.0.1', 'localhost']) {
            try {
                const response = await fetch(`http://${host}:${devtoolsPort}/json/version`, { signal: AbortSignal.timeout(500) });
                if (response.ok) return true;
            } catch (error) {
                lastDevtoolsError = error.message;
            }
        }
        return false;
    });
    const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Edge DevTools no abrió la conexión WebSocket en 10 segundos.')), 10000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Edge rechazó la conexión WebSocket de DevTools.')); }, { once: true });
        socket.addEventListener('close', () => { clearTimeout(timer); reject(new Error('Edge cerró DevTools antes de abrir la conexión WebSocket.')); }, { once: true });
        if (browserError || browserExit) {
            clearTimeout(timer);
            reject(new Error(`Edge terminó antes de abrir DevTools (código ${browserExit?.code ?? 'desconocido'}, señal ${browserExit?.signal || 'ninguna'}).`));
        }
    });
    const pending = new Map(), errors = [], dialogs = [], navigationRequests = [];
    let sequence = 0;
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => {
                pending.delete(id);
                const stderr = browserStderr.trim() ? ` Detalle Edge: ${browserStderr.trim()}` : '';
                reject(new Error(`Edge DevTools no respondió a ${method} en 10 segundos.${stderr}`));
            }, 10000);
            pending.set(id, {
                resolve: result => { clearTimeout(timer); resolve(result); },
                reject: error => { clearTimeout(timer); reject(error); }
            });
            if (socket.readyState !== WebSocket.OPEN) {
                pending.delete(id);
                clearTimeout(timer);
                reject(new Error(`Edge DevTools no está conectado al ejecutar ${method}.`));
                return;
            }
            socket.send(JSON.stringify({ id, method, params }));
        });
    }
    socket.addEventListener('close', () => {
        for (const [id, task] of pending) {
            pending.delete(id);
            const exit = browserExit ? ` Edge salió con código ${browserExit.code} y señal ${browserExit.signal || 'ninguna'}.` : '';
            const stderr = browserStderr.trim() ? ` Detalle Edge: ${browserStderr.trim()}` : '';
            task.reject(new Error(`Edge cerró la conexión DevTools.${exit}${stderr}`));
        }
    });
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Page.frameRequestedNavigation' || message.method === 'Page.frameScheduledNavigation') navigationRequests.push(message.params.url);
        if (message.id) { const task = pending.get(message.id); pending.delete(message.id); if (task) message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
        if (realCaptcha && message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            const text = message.params.args.map(arg => arg.value || arg.description || '').join(' ');
            if (/recaptcha|google\.com/i.test(text)) errors.push(text);
        }
        if (message.method === 'Page.javascriptDialogOpening') { dialogs.push(message.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
        if (message.method === 'Fetch.requestPaused') {
            const request = message.params;
            if (!request.request.url.startsWith(base) && !request.request.url.startsWith(nativeBase)) send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
            else send('Fetch.continueRequest', { requestId: request.requestId }).catch(() => {});
        }
    });
    await send('Runtime.enable'); await send('Page.enable');
    if (!realCaptcha) {
        await send('Page.addScriptToEvaluateOnNewDocument', {
            source: `window.SALUDCLICK_RECAPTCHA_SITE_KEY = 'test-site-key'; window.grecaptcha = { ready(callback) { callback(); }, render(_container, options) { window.__recaptchaOptions = options; return 1; }, reset() { window.__recaptchaOptions = null; } };`
        });
        await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    }
    async function evaluate(expression) {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    async function go(route) {
        await send('Page.navigate', { url: base + route });
        try {
            await until(async () => { try { return await evaluate(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete'`); } catch { return false; } });
        } catch {
            const actual = await evaluate(`({ pathname: location.pathname, search: location.search, readyState: document.readyState })`).catch(error => ({ evaluationError: error.message }));
            throw new Error(`No se pudo abrir ${route}; estado actual: ${JSON.stringify(actual)}`);
        }
    }
    async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
    async function value(selector, text) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(text)}`); }
    async function enter(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); }
    const visibleNames = () => evaluate(`[...document.querySelectorAll('#catalogoMedicamentos tr')].filter(r => !r.hidden).map(r => r.cells[0].textContent)`);
    const catalogReady = () => evaluate('Array.isArray(window.saludClickCatalogo) && window.saludClickCatalogo.length === 5');
    const state = () => evaluate(`JSON.parse(localStorage.getItem('saludclick_pedido_temporal_v1'))`);
    async function clickCartControl(name, controlIndex) {
        await until(() => evaluate(`[...document.querySelectorAll('#detallePedido tr')].some(r=>r.cells[0]?.textContent.includes(${JSON.stringify(name)}))`));
        await evaluate(`(()=>{const row=[...document.querySelectorAll('#detallePedido tr')].find(r=>r.cells[0]?.textContent.includes(${JSON.stringify(name)})); if(!row) throw new Error('No se encontró la línea del carrito: '+${JSON.stringify(name)}); const button=${controlIndex}===2?row.cells[2].querySelector('button'):row.cells[1].querySelectorAll('button')[${controlIndex}]; button.click();})()`);
    }
    async function setCartQuantity(name, quantity) {
        await until(() => evaluate(`[...document.querySelectorAll('#detallePedido tr')].some(r=>r.cells[0]?.textContent.includes(${JSON.stringify(name)}))`));
        await evaluate(`(()=>{const row=[...document.querySelectorAll('#detallePedido tr')].find(r=>r.cells[0]?.textContent.includes(${JSON.stringify(name)})); if(!row) throw new Error('No se encontró la línea del carrito: '+${JSON.stringify(name)}); const input=row.cells[1].querySelector('input'); input.value=${JSON.stringify(String(quantity))}; input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    }
    if (realCaptcha) {
        await t.test('Astro login renders the configured reCAPTCHA v2 checkbox and blocks empty tokens', async () => {
            await go('/login.html');
            await until(async () => evaluate(`Boolean(document.querySelector('#loginRecaptcha iframe')) || Boolean(document.querySelector('#recaptchaError')?.textContent)`), 30000);
            const widget = await evaluate(`(()=>{const node=document.querySelector('#loginRecaptcha');const style=getComputedStyle(node);const rect=node.getBoundingClientRect();return {siteKey:!!window.SALUDCLICK_RECAPTCHA_SITE_KEY,iframeCount:node.querySelectorAll('iframe').length,display:style.display,visibility:style.visibility,width:rect.width,height:rect.height,error:document.querySelector('#recaptchaError')?.textContent||'',grecaptcha:typeof window.grecaptcha,ready:typeof window.grecaptcha?.ready,render:typeof window.grecaptcha?.render,script:document.querySelector('script[src*=recaptcha]')?.src||''}})()`);
            assert.equal(widget.siteKey, true, 'La clave PUBLIC no llegó al documento Astro.');
            assert.ok(widget.iframeCount > 0, JSON.stringify({ ...widget, consoleErrors: errors }));
            assert.notEqual(widget.display, 'none');
            assert.notEqual(widget.visibility, 'hidden');
            assert.ok(widget.width > 0 && widget.height > 0, 'El contenedor no tiene dimensiones visibles.');

            await value('#email', 'prueba@example.com');
            await value('#password', 'passwordtest');
            const requestsBefore = loginRequests;
            await click('button[type="submit"]');
            assert.equal(loginRequests, requestsBefore, 'El frontend llamó al backend sin token captcha.');
            assert.match(await evaluate(`document.querySelector('#recaptchaError').textContent`), /No soy un robot/);
            assert.deepEqual(errors, [], 'La consola reportó errores JavaScript propios o de reCAPTCHA.');
        });
        return;
    }

    await go('/index.html');
    await evaluate(`localStorage.setItem('saludclick_token', 'frontend-test-only'); localStorage.setItem('saludclick_user', JSON.stringify({nombre:'Prueba',correo:'prueba@example.com'}))`);
    await t.test('inicio: buscar, Enter, vacÃ­o, solicitar y servicios', async () => {
        await value('#busquedaInicio', 'acetaminofen'); await click('#buscarInicio');
        await esperarPagina('/pages/medicamentos.html');
        await until(catalogReady);
        await until(async () => { try { return (await visibleNames()).length === 1; } catch { return false; } });
        assert.deepEqual(await visibleNames(), ['Acetaminofén']);
        assert.equal(await evaluate('location.search'), '?buscar=acetaminofen');
        await go('/index.html'); await value('#busquedaInicio', 'ibuprofeno'); await enter('#busquedaInicio');
        await esperarPagina('/pages/medicamentos.html');
        await until(catalogReady);
        await until(async () => { try { return (await visibleNames()).length === 1; } catch { return false; } });
        assert.deepEqual(await visibleNames(), ['Ibuprofeno']);
        await go('/index.html');
        assert.equal(await evaluate('document.querySelector(".hero-botones a").getAttribute("href")'), 'login.html');
        await go('/index.html'); await click('.hero-botones a[href="#servicios"]');
        await until(() => evaluate('scrollY > 0'));
        assert.ok(['smooth', 'auto'].includes(await evaluate('getComputedStyle(document.documentElement).scrollBehavior')));
        await click('[data-action="pedido"]');
        await esperarPagina('/pages/pedidos.html');
    });
    await go('/pages/medicamentos.html');
    await until(catalogReady);
    await t.test('cinco bÃºsquedas por nombre, Enter, limpiar y parÃ¡metro', async () => {
        assert.equal((await visibleNames()).length, 5);
        for (const [query, expected] of [['acetaminofen','Acetaminofén'],['IBUPROFENO','Ibuprofeno'],['loratadina','Loratadina'],['Omeprazol','Omeprazol'],['Amoxicilina','Amoxicilina']]) {
            await value('#buscadorMedicamentos', query); await click('#buscarMedicamentos'); assert.deepEqual(await visibleNames(), [expected]);
        }
        await value('#buscadorMedicamentos','Acetaminofén'); await enter('#buscadorMedicamentos'); assert.deepEqual(await visibleNames(),['Acetaminofén']);
        await value('#buscadorMedicamentos','500 mg'); await click('#buscarMedicamentos'); assert.equal((await visibleNames()).length,0);
        await click('#limpiarMedicamentos'); assert.equal((await visibleNames()).length,5);
        await go('/pages/medicamentos.html?buscar=IBUPROFENO'); await until(catalogReady); assert.deepEqual(await visibleNames(),['Ibuprofeno']);
        await click('#limpiarMedicamentos'); assert.equal((await visibleNames()).length,5); assert.equal(await evaluate('location.search'),'');
    });
    await t.test('agregar cinco, duplicado, cantidades, eliminar, persistencia y vaciar', async () => {
        await until(catalogReady);
        assert.equal(await evaluate('document.querySelector("#confirmarPedido").disabled'),true);
        for (const id of [1,2,3,4,5]) await click(`[data-medicamento-id="${id}"]`);
        assert.equal((await state()).borrador.length,5);
        await click('[data-medicamento-id="1"]'); assert.equal((await state()).borrador.length,5); assert.equal((await state()).borrador[0].cantidad,2);
        await clickCartControl('Acetaminofén', 1); assert.equal((await state()).borrador[0].cantidad,3);
        await clickCartControl('Acetaminofén', 0); await clickCartControl('Acetaminofén', 0); assert.equal((await state()).borrador[0].cantidad,1);
        await setCartQuantity('Acetaminofén', -2);
        assert.equal((await state()).borrador[0].cantidad,1);
        await go('/pages/medicamentos.html'); assert.equal((await state()).borrador.length,5);
        await until(() => evaluate('document.querySelector("#totalSeleccionado").textContent === "5"'));
        await clickCartControl('Acetaminofén', 2); assert.equal((await state()).borrador.length,4);
        await click('#vaciarPedido'); assert.equal((await state()).borrador.length,0);
        assert.equal(await evaluate('document.querySelector("#confirmarPedido").disabled'),true);
    });
    await t.test('confirmar dirige al checkout y conserva el borrador local', async () => {
        await until(catalogReady);
        for (const id of [1,2,3,4,5]) await click(`[data-medicamento-id="${id}"]`);
        const before = await state();
        await click('#confirmarPedido');
        await esperarPagina('/pages/pedidos.html');
        assert.equal(await evaluate('location.hash'), '#checkout');
        assert.deepEqual(await state(), before);
        assert.equal(await evaluate('document.querySelectorAll("#carritoPedido tr").length'), 5);
        assert.equal(await evaluate('document.querySelector("#resultadoPago").hidden'), true);
    });
    await t.test('doble clic de pago envía una sola solicitud de pedido', async () => {
        await evaluate(`localStorage.setItem('saludclick_pedido_temporal_v1',JSON.stringify({version:1,borrador:[{id:1,cantidad:1}],confirmados:[]}))`);
        await go('/pages/pedidos.html');
        await until(() => evaluate('document.querySelector("#pagarPedido") && !document.querySelector("#pagarPedido").disabled'));
        for (const [id,text] of [['titular','Usuario de prueba'],['numero','4242424242424242'],['vencimiento','12/30'],['cvv','123']]) await value('#'+id,text);
        const before = orderRequests;
        assert.equal(await evaluate(`(()=>{const button=document.querySelector('#pagarPedido');button.click();button.click();return button.disabled})()`),true);
        await until(() => Promise.resolve(orderRequests === before + 1));
        await until(() => evaluate('!document.querySelector("#pagarPedido").disabled'));
        assert.equal(orderRequests,before+1);
        assert.match(orderIdempotencyKeys.at(-1), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        await click('#pagarPedido');
        await until(() => Promise.resolve(orderRequests === before + 2));
        assert.equal(orderIdempotencyKeys.at(-1), orderIdempotencyKeys.at(-2));
    });
    await t.test('perfil: validaciÃ³n, guardar sin falso Ã©xito y cancelar', async () => {
        await evaluate(`sessionStorage.removeItem('saludclick_user')`);
        await evaluate(`localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Prueba',correo:'prueba@example.com'}))`);
        await go('/pages/perfil.html'); await until(() => evaluate('document.querySelector("#email").value === "prueba@example.com"')); assert.equal(await evaluate('document.querySelector("#email").value'),'prueba@example.com');
        await value('#nombre','Editado'); await click('#guardarPerfil');
        assert.match(await evaluate('document.querySelector("#mensajePerfil").textContent'),/Servicio de datos no disponible/);
        assert.equal(await evaluate('JSON.parse(localStorage.getItem("saludclick_user")).nombre'),'Prueba');
        await click('#cancelarPerfil'); await until(() => evaluate('document.querySelector("#nombre").value === "Prueba"')); assert.equal(await evaluate('document.querySelector("#nombre").value'),'Prueba');
    });
    await t.test('menÃºs mÃ³viles, navegaciÃ³n local y dashboard sin listeners duplicados', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        for (const route of ['/pages/medicamentos.html','/pages/pedidos.html','/pages/historial.html','/pages/perfil.html']) {
            await go(route); await click('#menuToggle'); assert.equal(await evaluate('document.querySelector("#menu").classList.contains("active")'),true);
            await click('#menuToggle'); assert.equal(await evaluate('document.querySelector("#menu").classList.contains("active")'),false);
            const links = await evaluate('[...document.querySelectorAll("a[href]")].map(a=>a.href).filter(h=>h.startsWith(location.origin))');
            for (const link of links) assert.equal((await fetch(link)).status,200,link);
        }
        await go('/pages/dashboard.html'); await click('#menuToggle'); assert.equal(await evaluate('document.querySelector("#menu").classList.contains("active")'),true);
        assert.equal(await evaluate('document.querySelector("#bienvenida").textContent'),'¡Bienvenido, Prueba!');
        await click('#logout'); await until(() => evaluate('location.pathname === "/login.html"'));
        assert.equal(await evaluate('localStorage.getItem("saludclick_token")'),null); assert.ok(await state());
    });
    await t.test('registro: contraseÃ±as, documentos y error real de servicio', async () => {
        await go('/registro.html'); await click('#mostrarPassword'); assert.equal(await evaluate('document.querySelector("#password").type'),'text');
        await click('#mostrarConfirmarPassword'); assert.equal(await evaluate('document.querySelector("#confirmarPassword").type'),'text');
        for (const type of ['terminos','privacidad']) { await click(`[data-aviso-legal="${type}"]`); assert.match(await evaluate('document.querySelector("#avisoLegal").textContent'),/no está publicado/); }
        for (const [id,text] of [['nombre','Prueba Local'],['correo','prueba@example.com'],['telefono','3001234567'],['numeroDocumento','123456'],['password','passwordtest'],['confirmarPassword','passwordtest']]) await value('#'+id,text);
        await click('#aceptoTerminos'); await click('button[type="submit"]'); await until(() => dialogs.some(s=>s.includes('Servicio de datos no disponible')));
        assert.equal(await evaluate('location.pathname'),'/registro.html');
    });
    await t.test('sesiÃ³n temporal, persistente y logout usan las claves existentes', async () => {
        const result = await evaluate(`(async()=>{ const a=await import('/js/auth.js'); a.setSession('test-session',{nombre:'Temporal'},false); const temporal=sessionStorage.getItem('saludclick_token')==='test-session' && localStorage.getItem('saludclick_token')===null && a.getToken()==='test-session'; a.setSession('test-persist',{nombre:'Persistente'},true); return temporal && localStorage.getItem('saludclick_token')==='test-persist' && sessionStorage.getItem('saludclick_token')===null; })()`);
        assert.equal(result,true);
        await go('/pages/dashboard.html'); await click('#logout'); await until(() => evaluate('location.pathname === "/login.html"'));
        assert.equal(await evaluate('localStorage.getItem("saludclick_token") || sessionStorage.getItem("saludclick_token")'),null);
    });
    await t.test('login, recuperación y restablecer muestran el error del servicio caído', async () => {
        await go('/login.html');
        await value('#email','prueba@example.com'); await value('#password','passwordtest');
        await evaluate(`window.__recaptchaOptions.callback('test-recaptcha-token')`);
        let count = dialogs.length;
        await click('button[type="submit"]');
        await until(() => dialogs.length > count);
        assert.match(dialogs.at(-1), /Servicio de datos no disponible/);
        assert.equal(await evaluate('location.pathname'),'/login.html');

        await go('/recuperar.html'); await value('#emailRecuperar','prueba@example.com');
        await click('button[type="submit"]');
        await until(() => evaluate('document.querySelector("#recuperarMensaje")?.textContent.length > 0'));
        assert.match(await evaluate('document.querySelector("#recuperarMensaje").textContent'),/Servicio de datos no disponible/);
        assert.equal(await evaluate('location.pathname'),'/recuperar.html');

        await go('/restablecer.html?token=frontend-test-only');
        await value('#nuevaPassword','passwordtest'); await value('#confirmarPassword','passwordtest');
        count = dialogs.length; await click('button[type="submit"]');
        await until(() => dialogs.length > count);
        assert.match(dialogs.at(-1),/Servicio de datos no disponible/);
        assert.equal(await evaluate('location.pathname'),'/restablecer.html');
    });
    await t.test('todos los enlaces internos, scripts y tipos de botÃ³n existen', async () => {
        const routes = fs.readdirSync(root).filter(f=>f.endsWith('.html')).map(f=>'/'+f)
            .concat(fs.readdirSync(path.join(root,'pages')).filter(f=>f.endsWith('.html')).map(f=>'/pages/'+f));
        // SesiÃ³n ficticia Ãºnicamente en el perfil aislado de esta prueba.
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only')`);
        for (const route of routes) {
            if (route === '/pages/admin.html') await evaluate(`localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Admin de prueba',rol:1}))`);
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
        try {
            await until(async () => { try { return await evaluate(`location.pathname === ${JSON.stringify(route.split('?')[0])} && document.readyState === 'complete'`); } catch { return false; } });
        } catch {
            const actual = await evaluate(`({ pathname: location.pathname, search: location.search, readyState: document.readyState })`).catch(error => ({ evaluationError: error.message }));
            throw new Error(`Navegación esperada a ${route}; estado actual: ${JSON.stringify(actual)}`);
        }
    }
    async function login() {
        loginCorrecto = true;
        await value('#email','prueba@example.com'); await value('#password','passwordtest');
        await evaluate(`window.__recaptchaOptions.callback('test-recaptcha-token')`);
        await click('button[type="submit"]');
    }
    await t.test('sin sesiÃ³n: buscar/Enter, solicitar, consultar, estado e historial vuelven a su destino tras login', async () => {
        for (const item of [
            { selector: '#buscarInicio', query: 'acetaminofen', destino: '/pages/medicamentos.html?buscar=acetaminofen' },
            { selector: '#busquedaInicio', enter: true, query: 'acetaminofen', destino: '/pages/medicamentos.html?buscar=acetaminofen' },
            { selector: '[data-action="medicamentos"]', destino: '/pages/medicamentos.html' },
            { selector: '[data-action="pedido"]', destino: '/pages/pedidos.html' },
            { selector: '[data-action="historial"]', destino: '/pages/historial.html' }
        ]) {
            await go('/index.html'); await sinSesion();
            if (item.query) await value('#busquedaInicio',item.query);
            if (item.enter) await enter(item.selector); else await click(item.selector);
            await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),item.destino);
            await login(); await esperarPagina(item.destino);
            assert.equal(await evaluate('location.pathname + location.search'),item.destino);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
            if (item.query) {
                await until(async () => JSON.stringify(await visibleNames()) === JSON.stringify(['Acetaminofén']));
                assert.deepEqual(await visibleNames(),['Acetaminofén']);
            }
        }
    });
    await t.test('domicilio y fÃ³rmula requieren login antes de mostrar indisponibilidad', async () => {
        for (const [accion,destino] of [['pedido','/pages/pedidos.html'],['formula','/pages/formulas.html']]) {
            await go('/index.html'); await sinSesion(); await click(`[data-action="${accion}"]`);
            await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),destino);
            await login(); await esperarPagina(destino);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        }
    });
    await t.test('las cinco pÃ¡ginas privadas recuerdan accesos directos y no entran en bucle', async () => {
        for (const pagina of ['dashboard','medicamentos','pedidos','historial','perfil']) {
            await go('/index.html'); await sinSesion();
            const route = `/pages/${pagina}.html`;
            await send('Page.navigate',{url:base+route}); await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),route);
            await login(); await esperarPagina(route);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        }
    });
    await t.test('login fallido y recarga conservan destino; Ã©xito lo consume una sola vez', async () => {
        await go('/index.html'); await sinSesion(); await click('[data-action="pedido"]'); await esperarPagina('/login.html');
        loginCorrecto = false;
        await value('#email','prueba@example.com'); await value('#password','incorrecta');
        await evaluate(`window.__recaptchaOptions.callback('test-recaptcha-token')`);
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
    await t.test('sin sesiÃ³n no se modifica el pedido aunque la pÃ¡gina ya estuviera abierta', async () => {
        const actions = [
            () => click('[data-medicamento-id="1"]'),
            () => clickCartControl('Acetaminofén', 1),
            () => clickCartControl('Acetaminofén', 0),
            () => clickCartControl('Acetaminofén', 2),
            () => click('#vaciarPedido'),
            () => click('#confirmarPedido')
        ];
        for (const action of actions) {
            await go('/pages/medicamentos.html');
            if (!(await state()).borrador.some(item=>item.id===1)) await click('[data-medicamento-id="1"]');
            const before = await state(); await sinSesion(); await action(); await esperarPagina('/login.html');
            assert.deepEqual(await state(),before);
            await login(); await esperarPagina('/pages/medicamentos.html');
        }
    });
    await t.test('sesiÃ³n: cinco medicamentos, confirmar, logout limpia destino y volver exige login', async () => {
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Prueba',correo:'prueba@example.com'}))`);
        await go('/pages/medicamentos.html'); await until(catalogReady); await click('#vaciarPedido');
        for (const [index,id] of [1,2,3,4,5].entries()) {
            await click(`[data-medicamento-id="${id}"]`);
            await until(async () => (await state()).borrador.length === index + 1);
        }
        assert.equal((await state()).borrador.length,5);
        await click('#confirmarPedido'); await esperarPagina('/pages/pedidos.html');
        assert.equal(await evaluate('location.hash'),'#checkout');
        await until(() => evaluate('document.querySelectorAll("#carritoPedido tr").length === 5'));
        assert.equal(await evaluate('document.querySelectorAll("#carritoPedido tr").length'),5);
        const before = await state();
        await go('/pages/dashboard.html'); await evaluate(`sessionStorage.setItem('${destinoKey}','/pages/perfil.html')`);
        await click('#logout'); await esperarPagina('/login.html');
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
    await t.test('clics de ratÃ³n reales en los cinco servicios privados sin sesiÃ³n', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
        for (const [accion,destino] of [
            ['medicamentos','/pages/medicamentos.html'],['pedido','/pages/pedidos.html'],
            ['historial','/pages/historial.html'],['formula','/pages/formulas.html']
        ]) {
            await abrirInicioReal();
            await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token')`);
            await abrirInicioReal();
            await mouseClick(`#servicios [data-action="${accion}"]`);
            await esperarPagina('/login.html');
            assert.equal(await evaluate('location.pathname'),'/login.html',accion);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),destino);
            t.diagnostic(`${accion}: clic real -> ${await evaluate('location.href')}`);
        }
    });
    await t.test('clic real en Contactar sin autenticaciÃ³n solicita abrir el correo', async () => {
        await abrirInicioReal(); await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token')`); await abrirInicioReal();
        await mouseClick('#servicios [data-action="contacto"]');
        assert.match(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), /mailto:contacto@saludclick\.com\?subject=Soporte%20SaludClick/);
        assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        t.diagnostic('Contactar: clic real -> mailto:contacto@saludclick.com (sin enviar correo)');
    });
    await t.test('clics reales en Iniciar SesiÃ³n y Registrarse', async () => {
        for (const [href,destino] of [['login.html','/login.html'],['registro.html','/registro.html']]) {
            await abrirInicioReal(); await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token')`); await abrirInicioReal();
            await mouseClick(`.botones-nav a[href="${href}"]`); await esperarPagina(destino);
            t.diagnostic(`${href}: clic real -> ${await evaluate('location.href')}`);
        }
    });
    await t.test('servicios de Inicio visibles y accesibles en móvil', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        await go('/index.html');
        assert.equal(await evaluate('document.querySelectorAll("#servicios [data-action]").length'),6);
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".grid-servicios")).display'),'grid');
        assert.equal(await evaluate('document.querySelectorAll("#servicios button[type=button]").length'),6);
    });
    await t.test('imágenes locales del catálogo de medicamentos cargan', async () => {
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Prueba'}))`);
        await go('/pages/medicamentos.html');
        await until(async () => (await visibleNames()).length === 5);
        await until(async () => await evaluate('[...document.querySelectorAll("#catalogoMedicamentos .tabla-medicamento-imagen")].length === 5 && [...document.querySelectorAll("#catalogoMedicamentos .tabla-medicamento-imagen")].every(img => img.complete)'));
        const catalogoImagenes = await evaluate(`[...document.querySelectorAll('#catalogoMedicamentos .tabla-medicamento-imagen')].map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}))`);
        assert.equal(catalogoImagenes.length,5);
        for (const imagen of catalogoImagenes) { assert.equal(imagen.complete,true); assert.ok(imagen.width > 0 && imagen.height > 0); assert.equal((await fetch(new URL(imagen.src,base))).status,200); }
    });
    await t.test('EV-ACC-001 navegación por teclado', async () => {
        await go('/index.html');
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        assert.ok(await evaluate('document.activeElement.matches("a,button,input,select,textarea")'));
    });
    await t.test('EV-ACC-002 foco visible', async () => {
        await go('/index.html');
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        const focus = await evaluate(`(()=>{const s=getComputedStyle(document.activeElement);return {visible:document.activeElement.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth}})()`);
        assert.equal(focus.visible,true);
        assert.notEqual(focus.outlineStyle,'none');
        assert.ok(parseFloat(focus.outlineWidth) >= 2);
    });
    await t.test('EV-ACC-003 etiquetas y mensajes de validación', async () => {
        await go('/registro.html');
        const result = await evaluate(`(()=>{const form=document.querySelector('#registroForm');const fields=[...form.querySelectorAll('input:not([type=hidden]),select,textarea')];return {unlabeled:fields.filter(e=>!e.labels?.length&&!e.hasAttribute('aria-label')&&!e.hasAttribute('aria-labelledby')).map(e=>e.id||e.name||e.type),invalid:!form.checkValidity(),validation:fields.find(e=>!e.checkValidity())?.validationMessage||'',status:document.querySelector('#avisoLegal')?.getAttribute('role')}})()`);
        assert.deepEqual(result.unlabeled,[]);
        assert.equal(result.invalid,true);
        assert.ok(result.validation.length > 0);
        assert.equal(result.status,'status');
    });
    await t.test('EV-ACC-004 contraste de texto WCAG AA', async () => {
        await go('/index.html');
        const contrast = await evaluate(`(()=>{const e=document.querySelector('#buscarInicio'),s=getComputedStyle(e),parse=c=>c.match(/[\\d.]+/g).slice(0,3).map(Number),linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4},l=c=>{const [r,g,b]=parse(c);return .2126*linear(r)+.7152*linear(g)+.0722*linear(b)},a=l(s.color),b=l(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})()`);
        assert.ok(contrast >= 4.5, `Contraste calculado: ${contrast.toFixed(2)}:1`);
    });
    await t.test('EV-ACC-005 encabezados HTML', async () => {
        await go('/index.html');
        const levels = await evaluate('[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(e=>Number(e.tagName.slice(1)))');
        assert.equal(levels.filter(level=>level===1).length,1);
        for (let index=1;index<levels.length;index++) assert.ok(levels[index]-levels[index-1]<=1,`Salto de encabezado h${levels[index-1]} a h${levels[index]}`);
    });
    await t.test('EV-ACC-006 textos alternativos de imágenes', async () => {
        await go('/index.html');
        const images = await evaluate('[...document.images].filter(e=>!e.hasAttribute("alt")).map(e=>e.src)');
        assert.deepEqual(images,[]);
    });
    await t.test('EV-ACC-007 zoom y diseño adaptable a 320 px', async () => {
        await go('/index.html');
        const viewport = await evaluate('document.querySelector(\'meta[name="viewport"]\')?.content||""');
        assert.match(viewport,/width=device-width/);
        await send('Emulation.setDeviceMetricsOverride',{width:320,height:800,deviceScaleFactor:1,mobile:true});
        const dimensions = await evaluate('({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})');
        assert.ok(dimensions.scrollWidth<=dimensions.width,`Desbordamiento horizontal: ${JSON.stringify(dimensions)}`);
        await send('Emulation.clearDeviceMetricsOverride');
    });
    await t.test('sin excepciones JavaScript propias', () => assert.deepEqual(errors,[]));
});

