const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

test('las rutas Astro no colisionan con public y conservan las páginas HTML y el panel de farmacia', () => {
    const frontend = path.resolve(__dirname, '../../frontend');
    const publicRoot = path.join(frontend, 'public');
    const pagesRoot = path.join(frontend, 'src/pages');
    const collectFiles = directory => fs.readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const file = path.join(directory, entry.name);
            return entry.isDirectory() ? collectFiles(file) : [file];
        });
    const publicRoutes = collectFiles(publicRoot)
        .filter(file => path.extname(file) === '.html')
        .map(file => path.relative(publicRoot, file).replace(/\\/g, '/'));
    const astroRoutes = collectFiles(pagesRoot)
        .filter(file => path.extname(file) === '.astro')
        .map(file => path.relative(pagesRoot, file).replace(/\\/g, '/').replace(/\.astro$/, '.html'));
    const collisions = astroRoutes.filter(route => publicRoutes.includes(route));
    const routes = [...new Set([...publicRoutes, ...astroRoutes])].sort();
    const expectedRoutes = [
        'index.html',
        'login.html',
        'pages/admin-cuentas.html',
        'pages/admin.html',
        'pages/chat.html',
        'pages/dashboard.html',
        'pages/farmacia.html',
        'pages/formulas.html',
        'pages/historial.html',
        'pages/medicamentos.html',
        'pages/pedidos.html',
        'pages/perfil.html',
        'recuperar.html',
        'registro.html',
        'restablecer.html'
    ];

    assert.deepEqual(collisions, []);
    assert.deepEqual(routes, expectedRoutes);
});

// Navegador aislado y servidor estático: no accede a PostgreSQL ni usa sesiones reales.
test('controles del frontend en Edge headless', { timeout: 120000 }, async t => {
    const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (!fs.existsSync(edge)) { t.skip('Microsoft Edge no estÃ¡ instalado; define EDGE_PATH para ejecutar esta prueba.'); return; }
    const realCaptcha = process.env.FRONTEND_TEST_ALLOW_EXTERNAL === '1';
    const publicRoot = path.resolve(__dirname, '../../frontend/public');
    const builtRoot = path.resolve(__dirname, '../../frontend/dist');
    const root = process.env.FRONTEND_TEST_ROOT
        ? path.resolve(process.env.FRONTEND_TEST_ROOT)
        : publicRoot;
    let loginCorrecto = false;
    let loginRole = 2;
    let loginRequests = 0;
    let orderRequests = 0;
    let adminAccountCreates = 0;
    let adminDashboardRequests = 0;
    let farmaciaStatus = 'APROBADA';
    let farmaciaUpdates = 0;
    let farmaciaRequests = 0;
    let chatRequests = 0;
    const adminAccounts = [];
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
        if (pathname.startsWith('/api/chat/') || pathname.startsWith('/socket.io/')) chatRequests++;
        if (pathname.startsWith('/api/farmacia/')) {
            farmaciaRequests++;
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'PATCH') {
                let raw = '';
                req.on('data', chunk => { raw += chunk; });
                req.on('end', () => {
                    const body = JSON.parse(raw);
                    assert.equal(body.estadoActual, farmaciaStatus);
                    farmaciaStatus = body.estado;
                    farmaciaUpdates++;
                    res.end(JSON.stringify({ ok: true, pedido: { id: 81, estado: farmaciaStatus } }));
                });
                return;
            }
            const paginacion = { pagina: 1, tamano: 25, total: 1, paginas: 1 };
            res.end(JSON.stringify(pathname.endsWith('/inventario') ? {
                ok: true, paginacion, medicamentos: [{ nombre: 'Acetaminofén', stock: 10, estado: 'DISPONIBLE', categoria: { nombre: 'Analgésicos' } }]
            } : {
                ok: true, paginacion, pedidos: [{ id: 81, estado: farmaciaStatus, tipo_entrega: 'RECOGER', usuario: { nombre: '<img src=x>', apellido: 'Prueba' }, detalles: [{ cantidad: 2, medicamento: { nombre: 'Acetaminofén' } }] }]
            }));
            return;
        }
        if (pathname === '/api/medicamentos') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, medicamentos }));
            return;
        }
        if (pathname === '/api/admin/cuentas' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, cuentas: adminAccounts }));
            return;
        }
        if (pathname === '/api/admin/cuentas' && req.method === 'POST') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => {
                const entrada = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                adminAccountCreates += 1;
                const cuenta = {
                    id: adminAccountCreates,
                    nombre: entrada.nombre.split(/\s+/)[0],
                    apellido: entrada.nombre.split(/\s+/).slice(1).join(' '),
                    correo: entrada.correo.trim().toLowerCase(),
                    rol_id: Number(entrada.rol_id),
                    estado: 'ACTIVO'
                };
                adminAccounts.push(cuenta);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: true,
                    mensaje: 'Cuenta creada correctamente.',
                    cuenta
                }));
            });
            return;
        }
        if (pathname === '/api/dashboard/admin') {
            adminDashboardRequests += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                estadisticas: {
                    usuarios: { total: 12, activos: 8 },
                    pedidos: { total: 21, activos: 4 },
                    ventas: 20500,
                    inventario: { unidades: 100, disponibles: 4 },
                    formulas: { total: 3, pendientes: 2 },
                    estados: []
                }
            }));
            return;
        }
        if (pathname === '/api/formulas/admin/all') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, formulas: [] }));
            return;
        }
        if (pathname === '/api/admin/pedidos' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, pedidos: [] }));
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
            res.end(JSON.stringify({ ok: true, token: 'frontend-test-only', usuario: { nombre: 'Prueba', correo: 'prueba@example.com', rol: loginRole } }));
            return;
        }
        if (pathname.startsWith('/api/')) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, mensaje: 'Servicio de datos no disponible.' }));
            return;
        }
        let staticRoot = root;
        let file = path.resolve(staticRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (
            !fs.existsSync(file) &&
            (pathname === '/pages/admin-cuentas.html' || pathname === '/pages/chat.html' || pathname.startsWith('/_astro/'))
        ) {
            staticRoot = builtRoot;
            file = path.resolve(staticRoot, '.' + pathname);
        }
        if (!file.startsWith(staticRoot + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
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
    await evaluate(`localStorage.setItem('saludclick_token', 'frontend-test-only'); localStorage.setItem('saludclick_user', JSON.stringify({nombre:'Prueba',correo:'prueba@example.com',rol:2}))`);
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
        await until(() => evaluate('document.querySelectorAll("#carritoPedido tr").length === 5'));
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
        await evaluate(`localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Prueba',correo:'prueba@example.com',rol:2}))`);
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
    await t.test('farmacia consulta inventario, avanza pedidos y rechaza usuarios ajenos', async () => {
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia',rol:3})); }`);
        await go('/pages/farmacia.html');
        await until(() => evaluate('document.querySelector(".farmacia-order button") && document.querySelectorAll("#farmaciaInventory tr").length === 1'));
        assert.equal(await evaluate('document.querySelector("#farmaciaMain").hidden'), false);
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaOrders img").length'), 0);
        assert.match(await evaluate('document.querySelector("#farmaciaInventory").textContent'), /Acetaminofén/);
        for (const status of ['PREPARANDO', 'LISTA', 'ENTREGADA']) {
            await click('.farmacia-order button');
            await until(() => evaluate(`document.querySelector('.farmacia-order h3')?.textContent.includes('${status}')`));
        }
        assert.equal(farmaciaUpdates, 3);
        assert.equal(await evaluate('document.querySelectorAll(".farmacia-order button").length'), 0);
        const before = farmaciaRequests;
        await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Prueba',rol:2}))`);
        await send('Page.navigate', { url: base + '/pages/farmacia.html' });
        await until(() => evaluate('location.pathname === "/pages/dashboard.html"'));
        assert.equal(farmaciaRequests, before);
    });
    await t.test('dashboard administrativo usa datos de API y restringe el acceso al rol 1', async () => {
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Admin de prueba',rol:1})); }`);
        await go('/pages/admin.html');
        await until(() => evaluate('document.querySelector("#adminStats")?.getAttribute("aria-busy") === "false"'));

        assert.equal(await evaluate('document.querySelector("#adminMain h1")?.textContent.trim()'), 'Dashboard');
        assert.match(await evaluate('document.querySelector("#adminStats").textContent'), /12/);
        assert.match(await evaluate('document.querySelector("#adminStats").textContent'), /Usuarios/);
        assert.equal(await evaluate('document.querySelectorAll(".admin-side-link").length'), 5);
        assert.deepEqual(await evaluate('[...document.querySelectorAll(".admin-side-link")].map(link => link.textContent.trim())'), [
            'Dashboard', 'Usuarios', 'Pacientes', 'Farmacias', 'EPS'
        ]);
        assert.equal(await evaluate('document.querySelector(".admin-side-link[aria-current=page]")?.textContent.trim()'), 'Dashboard');

        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await click('#menuToggle');
        assert.equal(await evaluate('document.querySelector("#menu").classList.contains("active")'), true);
        assert.equal(await evaluate('document.querySelector("#menuToggle").getAttribute("aria-expanded")'), 'true');

        const requestsBeforeDeniedRole = adminDashboardRequests;
        await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia',rol:3}))`);
        await send('Page.navigate', { url: base + '/pages/admin.html' });
        await until(() => evaluate('location.pathname === "/pages/farmacia.html"'));
        assert.equal(adminDashboardRequests, requestsBeforeDeniedRole);
    });
    await t.test('el administrador crea cuentas EPS y otros roles no ven el formulario', async subtest => {
        if (!fs.existsSync(path.join(builtRoot, 'pages/admin-cuentas.html'))) {
            subtest.skip('Compila el frontend Astro para probar la página administrativa.');
            return;
        }
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Admin de prueba',rol:1})); }`);
        await go('/pages/admin-cuentas.html');
        await until(() => evaluate('document.querySelector("#createAccountSection")?.hidden === false'));
        await go('/pages/admin-cuentas.html?rol=4');
        await until(() => evaluate('document.querySelector("#accountTypeFilter")?.value === "4"'));
        assert.equal(await evaluate('document.querySelector("[data-account-role=\\"4\\"]")?.getAttribute("aria-current")'), 'page');
        await go('/pages/admin-cuentas.html');
        await until(() => evaluate('document.querySelector("#createAccountSection")?.hidden === false'));
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#newAccountRole option')].map(option=>option.value)`), ['', '2', '3', '4']);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#accountTypeFilter option')].map(option=>option.value)`), ['', '2', '3', '4']);

        await value('#newAccountName', 'Ana María Pérez');
        await value('#newAccountEmail', 'ana.eps@example.test');
        await value('#newAccountPassword', 'clave-segura-123');
        await value('#confirmAccountPassword', 'otra-clave-123');
        await value('#newAccountRole', '4');
        await click('#createAccountSubmit');
        await until(() => evaluate('document.querySelector("#createAccountMessage").textContent.includes("no coinciden")'));
        assert.equal(adminAccountCreates, 0);

        await value('#confirmAccountPassword', 'clave-segura-123');
        await click('#createAccountSubmit');
        await until(() => Promise.resolve(adminAccountCreates === 1));
        await until(() => evaluate('document.querySelector("#createAccountMessage").textContent.includes("Cuenta creada correctamente")'));
        assert.match(await evaluate('document.querySelector("#accountsTable").textContent'), /EPS/);
        assert.match(await evaluate('document.querySelector("#accountsTable").textContent'), /ana\.eps@example\.test/);
        assert.equal(await evaluate('document.querySelector("#newAccountPassword").value'), '');
        assert.equal(await evaluate('document.querySelector("#confirmAccountPassword").value'), '');

        await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia',rol:3}))`);
        await send('Page.navigate', { url: base + '/pages/admin-cuentas.html' });
        await until(() => evaluate('location.pathname === "/pages/farmacia.html"'));
        assert.equal(await evaluate('!!document.querySelector("#createAccountForm")'), false);
        await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Admin de prueba',rol:1}))`);
    });
    await t.test('registro informa que las cuentas requieren habilitaciÃ³n administrativa', async () => {
        await go('/registro.html');
        const pageState = await evaluate(`(()=>({
            hasForm: !!document.querySelector('form'),
            notice: document.querySelector('[role="status"]')?.textContent.trim(),
            loginLink: !!document.querySelector('a[href="login.html"]')
        }))()`);
        assert.equal(pageState.hasForm, false);
        assert.match(pageState.notice, /creación de cuentas requiere habilitación administrativa/i);
        assert.equal(pageState.loginLink, true);
    });
    await t.test('sesiÃ³n temporal, persistente y logout usan las claves existentes', async () => {
        const result = await evaluate(`(async()=>{ const a=await import('/js/auth.js'); a.setSession('test-session',{nombre:'Temporal',rol:2},false); const temporal=sessionStorage.getItem('saludclick_token')==='test-session' && localStorage.getItem('saludclick_token')===null && a.getToken()==='test-session'; a.setSession('test-persist',{nombre:'Persistente',rol:2},true); return temporal && localStorage.getItem('saludclick_token')==='test-persist' && sessionStorage.getItem('saludclick_token')===null; })()`);
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
            if (route === '/pages/admin.html' || route === '/pages/admin-cuentas.html') {
                await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Admin de prueba',rol:1}))`);
            } else if (route === '/pages/farmacia.html') {
                await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia',rol:3}))`);
            } else {
                await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Prueba',rol:2}))`);
            }
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
    await t.test('el inicio ofrece acceso a login y no expone registro', async () => {
        await abrirInicioReal();
        assert.equal(await evaluate(`!!document.querySelector('.botones-nav a[href="registro.html"]')`), false);
        await mouseClick('.botones-nav a[href="login.html"]');
        await esperarPagina('/login.html');
        t.diagnostic(`login.html: clic real -> ${await evaluate('location.href')}`);
    });
    await t.test('servicios de Inicio visibles y accesibles en móvil', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        await go('/index.html');
        assert.equal(await evaluate('document.querySelectorAll("#servicios [data-action]").length'),6);
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".grid-servicios")).display'),'grid');
        assert.equal(await evaluate('document.querySelectorAll("#servicios button[type=button]").length'),6);
    });
    await t.test('imágenes locales del catálogo de medicamentos cargan', async () => {
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Prueba',rol:2}))`);
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
    await t.test('EV-ACC-003 aviso accesible de registro deshabilitado', async () => {
        await go('/registro.html');
        const result = await evaluate(`(()=>({
            form: !!document.querySelector('form'),
            status: document.querySelector('[role="status"]')?.getAttribute('role'),
            login: !!document.querySelector('a[href="login.html"]')
        }))()`);
        assert.deepEqual(result, { form: false, status: 'status', login: true });
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
    await t.test('login respeta el rol incluso si existe un destino pendiente ajeno', async () => {
        try {
            for (const [role, home] of [[1, '/pages/admin.html'], [3, '/pages/farmacia.html'], [4, '/pages/perfil.html']]) {
                await sinSesion();
                await go('/login.html');
                await evaluate(`sessionStorage.setItem('${destinoKey}', '/pages/pedidos.html')`);
                loginRole = role;
                await login();
                await esperarPagina(home);
                assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`), null);
            }
        } finally { loginRole = 2; }
    });
    await t.test('farmacia y EPS no ven opciones personales en el perfil y las sesiones corruptas fallan cerrado', async () => {
        for (const [role, home] of [[3, '/pages/farmacia.html'], [4, '/pages/perfil.html']]) {
            await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Personal',rol:${role}})); }`);
            await go('/pages/perfil.html');
            const forbidden = await evaluate(`[...document.querySelectorAll('nav a[href]')].filter(a=>['/pages/pedidos.html','/pages/formulas.html','/pages/historial.html','/pages/medicamentos.html'].includes(new URL(a.href).pathname)).filter(a=>!a.hidden).length`);
            assert.equal(forbidden, 0);
            await send('Page.navigate', { url: base + '/pages/pedidos.html' });
            await esperarPagina(home);
        }
        await evaluate(`sessionStorage.removeItem('saludclick_user'); localStorage.setItem('saludclick_user','invalid-json')`);
        await send('Page.navigate', { url: base + '/pages/perfil.html' });
        await esperarPagina('/login.html');
    });
    await t.test('chat rechaza sesiones ausentes y roles ajenos antes de consultar o conectar sockets', async () => {
        for (const [role, home] of [[null, '/login.html'], [1, '/pages/admin.html'], [4, '/pages/perfil.html'], [99, '/login.html']]) {
            await sinSesion();
            if (role !== null) await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Personal',rol:${role}}))`);
            const before = chatRequests;
            await send('Page.navigate', { url: base + '/pages/chat.html' });
            await esperarPagina(home);
            assert.equal(chatRequests, before);
        }
    });
    await t.test('sin excepciones JavaScript propias', () => assert.deepEqual(errors,[]));
});

