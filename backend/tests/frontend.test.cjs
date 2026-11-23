const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

test('las rutas Astro no colisionan con public y conservan las páginas HTML esperadas', () => {
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
        'pages/admin-afiliados.html',
        'pages/admin-cuentas.html',
        'pages/admin-pacientes.html',
        'pages/admin.html',
        'pages/chat-farmacia.html',
        'pages/chat.html',
        'pages/dashboard.html',
        'pages/eps-convenios.html',
        'pages/eps-v1.html',
        'pages/eps.html',
        'pages/farmacia.html',
        ...['chat','entregas','inventario','medicamentos','notificaciones','perfil','solicitudes','usuarios'].map(name => `pages/farmacia-${name}.html`),
        'pages/formulas.html',
        'pages/historial.html',
        'pages/medicamentos.html',
        'pages/pedidos.html',
        'pages/perfil.html',
        'pages/soporte.html',
        'recuperar.html',
        'registro.html',
        'restablecer.html'
    ];

    assert.deepEqual(collisions, []);
    assert.deepEqual(routes, expectedRoutes.sort());
});

// Navegador aislado y servidor estático: no accede a PostgreSQL ni usa sesiones reales.
test('controles del frontend en Edge headless', { timeout: 300000 }, async t => {
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
    let farmaciaDashboardRequests = 0;
    const farmaciaPanel = require('./support/farmacia-panel-browser.cjs');
    const farmaciaPanelFixture = farmaciaPanel.createFixture();
    let epsResumenRequests = 0;
    let vitalixApiRequests = 0;
    let farmaciaStatus = 'APROBADA';
    let farmaciaUpdates = 0;
    let farmaciaRequests = 0;
    let chatRequests = 0;
    let paymentFixture = null;
    const paymentRecords = new Map();
    const paymentChecks = [];
    let medicationFixture = null;
    let dashboardFixture = null;
    let formulaFixture = null;
    let profileEnabled = false;
    let profileUpdate;
    const demoProfile = { id: 30, nombre: 'Farmacia', apellido: 'Prueba', correo: 'farmacia@example.test', numeroDocumento: 'DOC-123', rol_id: 3 };
    const adminAccounts = [];
    const administrativeFixture=require('./support/administrative-browser.cjs').createFixture();
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
    const server = http.createServer(async (req, res) => {
        if(await administrativeFixture.handle(req,res))return;
        if(req.url==='/socket.io/socket.io.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('/* realtime unavailable in isolated fixture */');return;}
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (dashboardFixture && pathname === '/api/health') {
            const ok = dashboardFixture.healthOk !== false;
            res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok }));
            return;
        }
        if (dashboardFixture && ['/api/auth/profile', '/api/dashboard/me'].includes(pathname)) {
            const config = { ...dashboardFixture };
            const second = req.headers.authorization === 'Bearer patient-b';
            const status = pathname === '/api/auth/profile' ? (config.profileStatus || 200) : (config.statsStatus || 200);
            const identity = config.identity || { id: second ? 72 : 71, nombre: second ? 'Beatriz' : 'Ana', apellido: 'Prueba', rol_id: 2, correo: 'patient@example.test' };
            const statistics = config.statistics || (second ? { pedidos: 8, formulas: 4, pedidosActivos: 3, totalPagado: 27000 } : { pedidos: 5, formulas: 3, pedidosActivos: 2, totalPagado: 12500 });
            if (config.delay) await new Promise(resolve => setTimeout(resolve, config.delay));
            if (config.disconnect) { req.socket.destroy(); return; }
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status === 200 ? { ok: true, ...(pathname === '/api/auth/profile' ? { usuario: identity } : { estadisticas: statistics }) } : { ok: false, mensaje: status === 401 ? 'Sesion expirada de prueba.' : 'Servicio de datos no disponible.' }));
            return;
        }
        if (pathname === '/api/farmacia/eps' || pathname === '/api/farmacia/usuarios') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, vinculacion: { estado: 'SIN_VINCULO', eps: null, mensaje: 'No tienes una EPS vinculada.' }, pacientes: [], totalActivos: 0, paginacion: { pagina: 1, tamano: 25, total: 0, paginas: 0 } })); return;
        }
        if (pathname === '/api/farmacia/verificar-acceso') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, mensaje: 'Acceso de prueba autorizado.' })); return;
        }
        if (pathname.startsWith('/api/chat/')) vitalixApiRequests += 1;
        if (pathname === '/api/auth/profile' && profileEnabled) {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'PUT') {
                let raw = '';
                req.on('data', chunk => { raw += chunk; });
                req.on('end', () => {
                    profileUpdate = JSON.parse(raw);
                    Object.assign(demoProfile, profileUpdate);
                    res.end(JSON.stringify({ ok: true, mensaje: 'Perfil actualizado correctamente.', usuario: demoProfile }));
                });
            } else res.end(JSON.stringify({ ok: true, usuario: demoProfile }));
            return;
        }
        if (pathname.startsWith('/api/chat/') || pathname.startsWith('/socket.io/')) chatRequests++;
        if(pathname.startsWith('/api/chat/') && farmaciaPanelFixture.handle(req,res,new URL(req.url,'http://localhost')))return;
        if(pathname.startsWith('/api/chat/')) {
            const conversation={id:1,estado:'ABIERTA',cliente:{id:20,nombre:'Cliente',apellido:'Prueba'},agente:{id:30,nombre:'Farmacia',apellido:'Prueba'},mensajes:[]};
            res.writeHead(200,{'Content-Type':'application/json'});
            res.end(JSON.stringify(pathname.endsWith('/mensajes')?{ok:true,messages:[],conversation}:{ok:true,conversaciones:[conversation]}));
            return;
        }
        if (farmaciaPanelFixture.handle(req, res, new URL(req.url, 'http://localhost'))) return;
        if (pathname.startsWith('/api/farmacia/medicamentos')) {
            farmaciaDashboardRequests++;
            const items = medicamentos.map(item => ({ ...item, stock: item.stock ?? 10, presentacion: null, principio_activo: null,
                categoria: { nombre: item.categoria }, disponibilidad: item.estado === 'DISPONIBLE' ? 'DISPONIBLE' : 'AGOTADO',
                requisitoFormula: 'DESCONOCIDO', requiere_formula: null }));
            const paginacion = { pagina: 1, tamano: 25, total: items.length, paginas: 1 };
            const resumen = { total: items.length, disponibles: items.filter(item => item.disponibilidad === 'DISPONIBLE').length, agotados: items.filter(item => item.disponibilidad === 'AGOTADO').length, inactivos: 0, inconsistentes: 0, desconocidos: 0 };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(/\/medicamentos\/\d+$/.test(pathname) ? { ok: true, medicamento: items[0] } : { ok: true, medicamentos: items, paginacion, resumen }));
            return;
        }
        if (pathname === '/api/farmacia/inventario' || pathname.startsWith('/api/farmacia/pedidos') || pathname.startsWith('/api/integracion/farmacia/pedidos') || pathname.startsWith('/api/integracion/farmacia/solicitudes/')) {
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
            const pedido = { id: 81, estado: farmaciaStatus, tipo_entrega: 'RECOGER', fecha: '2026-11-14T12:00:00Z', usuario: { nombre: '<img src=x>', apellido: 'Prueba' }, detalles: [{ cantidad: 2, medicamento: { nombre: 'Acetaminofén', requiere_formula: false } }], operacion: { siguienteEstado: { APROBADA:'PREPARANDO', PREPARANDO:'LISTA', LISTA:'ENTREGADA' }[farmaciaStatus] || null, bloqueos: [] } };
            res.end(JSON.stringify(pathname.endsWith('/inventario') ? {
                ok: true, paginacion, resumen: { total: 1, disponibles: 1, agotados: 0, inactivos: 0, inconsistentes: 0, desconocidos: 0 }, medicamentos: [{ id: 1, nombre: 'Acetaminofén', stock: 10, presentacion: null, requiere_formula: false, requisitoFormula: 'NO_REQUIERE', disponibilidad: 'DISPONIBLE', estado: 'DISPONIBLE', categoria: { nombre: 'Analgésicos' } }]
            } : /\/pedidos\/\d+$/.test(pathname) ? { ok: true, pedido } : {
                ok: true, paginacion, pedidos: [pedido], resumen: { pendientes: 1, preparando: 0, listas: 0, entregadas: 0 }
            }));
            return;
        }
        if (pathname === '/api/medicamentos/publico') {
            const buscar = new URL(req.url, 'http://localhost').searchParams.get('buscar') ?? '';
            const normalizar = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
            const resultados = medicamentos.filter(item => normalizar(item.nombre).includes(normalizar(buscar)));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, medicamentos: resultados, siguiente: false }));
            return;
        }
        if (pathname === '/api/medicamentos') {
            const config = medicationFixture ? { ...medicationFixture } : {};
            if (config.delay) await new Promise(resolve => setTimeout(resolve, config.delay));
            const status = config.status || 200;
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status === 200 ? { ok: true, medicamentos: config.medicamentos || medicamentos } : { ok: false, mensaje: 'Catalogo no disponible.' }));
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
        if(pathname==='/api/farmacia/dashboard/estadisticas'){
            farmaciaDashboardRequests++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,disponible:false,motivo:'Asignaciones pendientes',indicadores:null,actividad:[]}));return;
        }
        if (pathname === '/api/farmacia/dashboard') {
            farmaciaDashboardRequests += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                medicamentos,
                estadisticas: {
                    totalMedicamentos: medicamentos.length,
                    medicamentosDisponibles: medicamentos.filter(item => item.estado === 'DISPONIBLE').length
                }
            }));
            return;
        }
        if (pathname === '/api/eps/v1/dashboard' || pathname === '/api/eps/v1/notificaciones' || pathname === '/api/eps/v1/inventario') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(pathname.endsWith('/dashboard')
                ? { ok: true, estadisticas: { farmacias: 2 } }
                : { ok: true, datos: [], paginacion: { pagina: 1, paginas: 0, total: 0 } }));
            return;
        }
        if (pathname === '/api/eps/dashboard/resumen') {
            epsResumenRequests += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true, eps: { id: '1', nombre: 'EPS de prueba' },
                afiliados: { total: 0, activos: 0, inactivos: 0 },
                solicitudes: { total: 0, estados: [], meses: [], recientes: [] },
                farmacias: { total: 0, activas: 0, recientes: [] }
            }));
            return;
        }
        if (pathname === '/api/eps/afiliados') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true, eps: { id: '1', nombre: 'EPS de prueba' }, afiliados: [], totalActivos: 0,
                paginacion: { pagina: 1, tamano: 25, total: 0, paginas: 0 }
            }));
            return;
        }
        if (formulaFixture && pathname === '/api/formulas') {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'POST') {
                let raw = '';
                for await (const chunk of req) raw += chunk;
                const data = JSON.parse(raw);
                assert.equal(data.nombre, 'Formula ficticia');
                assert.match(data.archivo, /^data:application\/pdf;base64,/);
                formulaFixture.uploads++;
                await new Promise(resolve => setTimeout(resolve, 120));
                formulaFixture.formulas.push({ id: 71, nombre: data.nombre, estado: 'PENDIENTE', tipo_mime: 'application/pdf', tamano: 8, created_at: '2026-11-14' });
                res.statusCode = 201;
                res.end(JSON.stringify({ ok: true, mensaje: 'Documento guardado.' }));
            } else {
                res.end(JSON.stringify({ ok: true, formulas: formulaFixture.formulas }));
            }
            return;
        }
        if (formulaFixture && pathname === '/api/formulas/71') {
            assert.equal(req.headers.authorization, 'Bearer frontend-test-only');
            res.setHeader('Content-Type', 'application/pdf');
            res.end('%PDF-1.4');
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
        if (paymentFixture && (pathname === '/api/pedidos' || /^\/api\/pedidos\/\d+$/.test(pathname))) {
            if (req.method === 'POST') {
                const config = {...paymentFixture};
                let raw = '';
                for await (const chunk of req) raw += chunk;
                const input = JSON.parse(raw);
                const safe = ['4242424242424242','5555555555554444','4000000000000002'].includes(input.pago?.numero) && input.pago?.cvv === '123' && input.pago?.titular === 'Titular de prueba';
                paymentChecks.push({safe,key:req.headers['idempotency-key'],tipoEntrega:input.tipoEntrega,direccion:input.direccion});
                assert.equal(safe,true,'Solo pueden salir fixtures ficticios del escenario');
                if (config.delay) await new Promise(resolve => setTimeout(resolve,config.delay));
                let status = config.status || (input.pago.numero === '4000000000000002' ? 400 : 201);
                if (status !== 201) {
                    res.writeHead(status,{'Content-Type':'application/json'});
                    res.end(JSON.stringify({ok:false,mensaje:config.message || (status === 400 ? 'Pago rechazado. Referencia: SIM-REJECT-TEST' : 'Sesion expirada de prueba.')}));
                    return;
                }
                const key=req.headers['idempotency-key'];
                if (!paymentRecords.has(key)) paymentRecords.set(key,{
                    solicitudId:801+paymentRecords.size,total:4321,
                    pago:{referencia:'SIM-TEST-'+(801+paymentRecords.size),metodo:'TARJETA',marca:input.pago.numero.startsWith('5')?'MASTERCARD':'VISA',ultimos_digitos:input.pago.numero.slice(-4),estado:'APROBADO'}
                });
                res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,...paymentRecords.get(key)}));return;
            }
            res.writeHead(200,{'Content-Type':'application/json'});
            const records=[...paymentRecords.values()];
            if (pathname === '/api/pedidos') res.end(JSON.stringify({ok:true,pedidos:records.map(r=>({id:r.solicitudId,fecha:'2026-11-14T12:00:00Z',estado:'APROBADA',total:r.total,pago_estado:'APROBADO',ultimos_digitos:r.pago.ultimos_digitos}))}));
            else {
                const record=records.find(r=>r.solicitudId===Number(pathname.split('/').at(-1)));
                res.end(JSON.stringify({ok:true,pedido:record?[{id:record.solicitudId,fecha:'2026-11-14T12:00:00Z',estado:'APROBADA',pago_estado:'APROBADO',referencia:record.pago.referencia,metodo:'TARJETA'}]:[]}));
            }
            return;
        }
        if (pathname === '/api/auth/login' && loginCorrecto) {
            // Respuesta controlada Ãºnicamente en este servidor de pruebas.
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, token: 'frontend-test-only', usuario: { id: 71, nombre: 'Prueba', correo: 'prueba@example.com', rol: loginRole } }));
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
            (pathname === '/' || pathname === '/pages/admin-afiliados.html' || pathname === '/login.html' || pathname === '/index.html' || pathname === '/pages/admin-cuentas.html' || pathname === '/pages/admin-pacientes.html' || pathname === '/pages/chat.html' || pathname === '/pages/chat-farmacia.html' || pathname === '/pages/farmacia.html' || pathname === '/pages/perfil.html' || pathname.startsWith('/pages/farmacia-') || ['/pages/eps.html', '/pages/eps-v1.html', '/pages/eps-convenios.html'].includes(pathname) || pathname.startsWith('/_astro/'))
        ) {
            staticRoot = builtRoot;
            file = path.resolve(staticRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
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
        // Let Edge release cache handles before falling back to process-tree termination.
        if (socket?.readyState === WebSocket.OPEN) {
            try { await send('Browser.close'); } catch { /* Closing DevTools may reject its final command. */ }
            if (!browserExit) await new Promise(resolve => {
                const timer = setTimeout(resolve, 2000);
                browser.once('exit', () => { clearTimeout(timer); resolve(); });
            });
        }
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
            await until(async () => { try { return await evaluate(`(location.pathname === ${JSON.stringify(route.split(/[?#]/)[0])} || (${JSON.stringify(route)}==='/index.html' && location.pathname==='/' && document.body.classList.contains('home-page'))) && document.readyState === 'complete'`); } catch { return false; } });
        } catch {
            const actual = await evaluate(`({ pathname: location.pathname, search: location.search, readyState: document.readyState })`).catch(error => ({ evaluationError: error.message }));
            throw new Error(`No se pudo abrir ${route}; estado actual: ${JSON.stringify(actual)}`);
        }
    }
    async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
    async function value(selector, text) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(text)}`); }
    async function enter(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); }
    const visibleNames = () => evaluate(`[...document.querySelectorAll('#catalogoMedicamentos .mc-card h3')].map(node => node.textContent)`);
    const catalogReady = () => evaluate('Array.isArray(window.saludClickCatalogo) && window.saludClickCatalogo.length === 5');
    const state = () => evaluate(`JSON.parse(localStorage.getItem('saludclick_pedido_temporal_v1:71'))`);
    async function clickCartControl(name, controlIndex) {
        await until(() => evaluate(`[...document.querySelectorAll('#detallePedido .mc-selection-item')].some(row=>row.querySelector('strong')?.textContent.includes(${JSON.stringify(name)}))`));
        await evaluate(`(()=>{const row=[...document.querySelectorAll('#detallePedido .mc-selection-item')].find(row=>row.querySelector('strong')?.textContent.includes(${JSON.stringify(name)})); const button=${controlIndex}===2?row.querySelector(':scope > button'):row.querySelectorAll('.mc-quantity button')[${controlIndex}]; button.click();})()`);
    }
    async function setCartQuantity(name, quantity) {
        await until(() => evaluate(`[...document.querySelectorAll('#detallePedido .mc-selection-item')].some(row=>row.querySelector('strong')?.textContent.includes(${JSON.stringify(name)}))`));
        await evaluate(`(()=>{const row=[...document.querySelectorAll('#detallePedido .mc-selection-item')].find(row=>row.querySelector('strong')?.textContent.includes(${JSON.stringify(name)}));const input=row.querySelector('input');input.value=${JSON.stringify(String(quantity))};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    }
    if (process.env.FRONTEND_TEST_ADMIN_ONLY === '1') {
        await go('/login.html');
        await require('./support/administrative-browser.cjs').testWorkspace({t,evaluate,go,click,value,until,send,fixture:administrativeFixture});
        assert.deepEqual(errors,[]);
        return;
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
    if(process.env.SALUDCLICK_ADMIN_BROWSER_ONLY==='1'){
        await go('/login.html');
        await t.test('farmacia consulta inventario, avanza pedidos y rechaza usuarios ajenos', async () => {
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia',rol:3})); }`);
        await go('/pages/farmacia-inventario.html');
        await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 1'));
        assert.match(await evaluate('document.querySelector("#farmaciaInventory").textContent'), /Acetaminof\u00e9n/);
        await go('/pages/farmacia-solicitudes.html');
        await until(() => evaluate('document.querySelector(".farmacia-order button") !== null'));
        assert.equal(await evaluate('document.querySelector("#farmaciaMain").hidden'), false);
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaOrders img").length'), 0);
        for (const status of ['PREPARANDO', 'LISTA', 'ENTREGADA']) {
            await click('.farmacia-order button');
            await click('#farmaciaSolicitudConfirmar');
            await until(() => evaluate(`document.querySelector('.farmacia-order h3')?.textContent.includes('${({PREPARANDO:'En preparación',LISTA:'Lista',ENTREGADA:'Entregada'})[status]}')`));
        }
        assert.equal(farmaciaUpdates, 3);
        assert.equal(await evaluate('document.querySelectorAll(".farmacia-order button").length'), 1);
        const before = farmaciaRequests;
        await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Prueba',rol:2}))`);
        await send('Page.navigate', { url: base + '/pages/farmacia.html' });
        await until(() => evaluate('location.pathname === "/pages/dashboard.html"'));
        assert.equal(farmaciaRequests, before);
    });

    await require('./support/administrative-browser.cjs').testWorkspace({t,evaluate,go,click,value,until,send,fixture:administrativeFixture});
        assert.deepEqual(errors,[]);
        return;
    }
    await require('./support/vitalix-browser.cjs')({ t, evaluate, go, click, until, send, getApiRequests: () => vitalixApiRequests });
    await require('./support/afiliados-browser.cjs')({ t, evaluate, go, click, until, send });
    if (process.env.FRONTEND_TEST_VITALIX_ONLY === '1') {
        assert.deepEqual(errors, [], 'VITALIX no debe producir excepciones JavaScript.');
        return;
    }
    await evaluate(`for(const s of [localStorage,sessionStorage]){s.setItem('saludclick_token','frontend-test-only');s.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Prueba',correo:'prueba@example.com',rol:2}));}`);
    await go('/index.html');
    const nombresCatalogoPublico = () => evaluate('[...document.querySelectorAll("#catalogo-publico-lista h3")].map(item => item.textContent)');
    await t.test('inicio: buscar, Enter, limpiar, solicitar y servicios', async () => {
        await value('#busquedaInicio', 'acetaminofen'); await click('#buscarInicio');
        await until(async () => JSON.stringify(await nombresCatalogoPublico()) === JSON.stringify([medicamentos[0].nombre]));
        assert.equal(await evaluate('location.pathname + location.search'), '/index.html');
        await go('/index.html'); await value('#busquedaInicio', 'ibuprofeno'); await enter('#busquedaInicio');
        await until(async () => JSON.stringify(await nombresCatalogoPublico()) === JSON.stringify(['Ibuprofeno']));
        assert.equal(await evaluate('location.pathname + location.search'), '/index.html');
        await value('#busquedaInicio', ''); await click('#buscarInicio');
        await until(async () => (await nombresCatalogoPublico()).length === medicamentos.length);
        await go('/index.html');
        await click('.hero-botones a[href="#catalogo-publico"]');
        await until(() => evaluate('location.hash === "#catalogo-publico"'));
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
    await t.test('carrito: separa cuentas y evita recuperar el borrador comun', async () => {
        const result = await evaluate('(async()=>{ const auth = await import("/js/auth.js"); const { carritoSesion } = await import("/js/carrito-sesion.js"); const key = "saludclick_pedido_temporal_v1"; localStorage.setItem(key,"legacy"); auth.setSession("patient-a",{id:71,rol:2},false); carritoSesion.setItem(key,"own"); auth.setSession("patient-b",{id:72,rol:2},false); const other = carritoSesion.getItem(key); auth.setSession("frontend-test-only",{id:71,nombre:"Prueba",rol:2},false); const own = carritoSesion.getItem(key); localStorage.removeItem(key); return {other,own}; })()');
        assert.deepEqual(result, {other:null,own:'own'});
    });
    await t.test('doble clic de pago envía una sola solicitud de pedido', async () => {
        await evaluate(`localStorage.setItem('saludclick_pedido_temporal_v1:71',JSON.stringify({version:1,borrador:[{id:1,cantidad:1}],confirmados:[]}))`);
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
        await evaluate(`localStorage.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Prueba',correo:'prueba@example.com',rol:2}))`);
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
        dashboardFixture = { identity: { id:71, nombre:'Prueba', apellido:'Paciente', rol_id:2 } };
        try {
            await go('/pages/dashboard.html');
            await until(() => evaluate('document.querySelector("#dashboardEstado").dataset.state === "loaded"'));
            await click('#menuToggle'); assert.equal(await evaluate('document.querySelector("#menu").classList.contains("active")'),true);
            assert.equal(await evaluate('document.querySelector("#bienvenida").textContent'),'¡Bienvenido, Prueba!');
            await click('#logout'); await until(() => evaluate('location.pathname === "/login.html"'));
            assert.equal(await evaluate('localStorage.getItem("saludclick_token")'),null); assert.ok(await state());
        } finally { dashboardFixture = null; }
    });
    await t.test('farmacia consulta inventario, avanza pedidos y rechaza usuarios ajenos', async () => {
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia',rol:3})); }`);
        await go('/pages/farmacia-inventario.html');
        await until(() => evaluate('document.querySelectorAll("#farmaciaInventory tr").length === 1'));
        assert.match(await evaluate('document.querySelector("#farmaciaInventory").textContent'), /Acetaminof\u00e9n/);
        await go('/pages/farmacia-solicitudes.html');
        await until(() => evaluate('document.querySelector(".farmacia-order button") !== null'));
        assert.equal(await evaluate('document.querySelector("#farmaciaMain").hidden'), false);
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaOrders img").length'), 0);
        for (const status of ['PREPARANDO', 'LISTA', 'ENTREGADA']) {
            await click('.farmacia-order button');
            await click('#farmaciaSolicitudConfirmar');
            await until(() => evaluate(`document.querySelector('.farmacia-order h3')?.textContent.includes('${({PREPARANDO:'En preparación',LISTA:'Lista',ENTREGADA:'Entregada'})[status]}')`));
        }
        assert.equal(farmaciaUpdates, 3);
        assert.equal(await evaluate('document.querySelectorAll(".farmacia-order button").length'), 1);
        const before = farmaciaRequests;
        await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Prueba',rol:2}))`);
        await send('Page.navigate', { url: base + '/pages/farmacia.html' });
        await until(() => evaluate('location.pathname === "/pages/dashboard.html"'));
        assert.equal(farmaciaRequests, before);
    });

    await require('./support/administrative-browser.cjs').testWorkspace({t,evaluate,go,click,value,until,send,fixture:administrativeFixture});
    await farmaciaPanel.testIndicators({t,fixture:farmaciaPanelFixture,evaluate,go,click,until});
    await farmaciaPanel.testTransitions({t,fixture:farmaciaPanelFixture,evaluate,go,click,until});
    await farmaciaPanel.testNavigation({t,fixture:farmaciaPanelFixture,evaluate,go,click,until,send});
    await farmaciaPanel.testInventory({t,fixture:farmaciaPanelFixture,evaluate,go,click,until,send});
    await farmaciaPanel.testChat({t,fixture:farmaciaPanelFixture,evaluate,go,click,until,send});
    await t.test('dashboard de farmacia contiene solo resumen y navega a inventario independiente', async () => {
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia de prueba',rol:3})); }`);
        await go('/pages/farmacia.html');
        await until(() => evaluate('document.querySelector("#farmaciaMain")?.hidden === false'));
        assert.equal(await evaluate('document.querySelector("#farmaciaMain h1").textContent'), 'Panel de control');
        assert.deepEqual(await evaluate('[...document.querySelectorAll(".admin-side-link span")].map(n=>n.textContent)'), ['Dashboard','Solicitudes','Usuarios','Inventario','Medicamentos','Notificaciones','Perfil']);
        assert.equal(await evaluate('document.querySelectorAll("#farmaciaMedicamentos,#farmaciaInventory,#farmaciaOrders,#farmaciaNotificationsList").length'), 0);
        await send('Emulation.setDeviceMetricsOverride', {width:375,height:812,deviceScaleFactor:1,mobile:true});
        await click('#menuToggle');
        await click('[data-farmacia-link="inventario"]');
        await until(() => evaluate('location.pathname === "/pages/farmacia-inventario.html" && document.querySelector("#farmaciaMain")?.hidden === false'));
        assert.equal(await evaluate('document.querySelector("#menuToggle").getAttribute("aria-expanded")'), 'false');
        await send('Emulation.clearDeviceMetricsOverride');
        await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Paciente',rol:2}))`);
        await send('Page.navigate', { url: base + '/pages/farmacia.html' });
        await until(() => evaluate('location.pathname === "/pages/dashboard.html"'));
    });

    await t.test('dashboard paciente: accesos compactos y chat con enlaces a ambos canales', async () => {
        await evaluate('sessionStorage.setItem("saludclick_token","frontend-test-only");sessionStorage.setItem("saludclick_user",JSON.stringify({id:71,nombre:"Paciente",rol:2}));');
        await go('/pages/dashboard.html');
        assert.equal(await evaluate('document.querySelector("[data-eps-integration]")'), null);
        assert.doesNotMatch(await evaluate('document.body.textContent'), /Ayuda con tu cuenta/);
        assert.deepEqual(await evaluate('[...document.querySelectorAll(".dashboard-actions a")].map(a=>new URL(a.href).pathname)'), [
            '/pages/medicamentos.html', '/pages/pedidos.html', '/pages/formulas.html', '/pages/historial.html', '/pages/chat-farmacia.html'
        ]);
        try {
            for (const [width, columns] of [[1440,5],[1024,3],[768,2],[375,1]]) {
                await send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:width<800});
                const layout = await evaluate('(() => { const rect = s=>document.querySelector(s).getBoundingClientRect(); return {top:Math.round(rect(".dashboard-welcome").top-rect("#navbar").bottom),bottom:Math.round(rect("#contacto").top-rect(".dashboard-info-grid").bottom),columns:getComputedStyle(document.querySelector(".dashboard-actions")).gridTemplateColumns.split(" ").length,fits:document.documentElement.scrollWidth <= innerWidth}; })()');
                assert.equal(layout.columns, columns, JSON.stringify(layout));
                assert.ok(layout.top >= 10 && layout.top <= 25, JSON.stringify(layout));
                assert.ok(layout.bottom >= 16 && layout.bottom <= 34, JSON.stringify(layout));
                assert.equal(layout.fits, true);
            }
            const chat = '.dashboard-actions a[href="chat-farmacia.html"]';
            assert.match(await evaluate('document.querySelector('+JSON.stringify(chat)+').textContent'), /Comunícate con farmacia y soporte/);
            await click(chat);
            await until(() => evaluate('location.pathname === "/pages/chat-farmacia.html" && Boolean(document.querySelector(".chat-composer"))'));
            const soporte = '.farmacia-chat-nav a[href="/pages/soporte.html"]';
            await click(soporte);
            await until(() => evaluate('location.pathname === "/pages/soporte.html" && Boolean(document.querySelector("#adminView"))'));
        } finally {
            await send('Emulation.clearDeviceMetricsOverride');
        }
    });

    await t.test('dashboard EPS valida el acceso y redirige roles no autorizados', async () => {
        await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'EPS de prueba',rol:4})); }`);
        await go('/pages/eps.html');
        await until(() => evaluate('document.querySelector("#epsDashboardDatos")?.hidden === false'));

        assert.equal(await evaluate('document.querySelector("#epsMain h1")?.textContent.trim()'), 'Dashboard');
        assert.equal(await evaluate('document.querySelector("#epsDashboardEntidad").textContent'), 'EPS de prueba');
        assert.equal(await evaluate('document.querySelectorAll(".admin-side-link").length'), 9);
        assert.deepEqual(await evaluate('[...document.querySelectorAll(".admin-side-link")].map(link => link.querySelector("span")?.textContent.trim())'), [
            'Dashboard', 'Afiliados', 'Farmacias vinculadas', 'Solicitudes', 'Notificaciones', 'Reportes', 'Perfil', 'Gestión EPS', 'Inventario y convenios'
        ]);
        assert.equal(await evaluate('document.querySelectorAll(".eps-nav-disabled[aria-disabled=true]").length'), 0);
        assert.equal(await evaluate('document.getElementById("epsNavSolicitudes").getAttribute("href")'), '#solicitudes');
        assert.equal(await evaluate('document.querySelector(\'.admin-side-link[href="#afiliados"]\')?.textContent.trim()'), 'Afiliados');
        assert.equal(epsResumenRequests, 1);
        await evaluate('document.getElementById("epsNavAfiliados").click()');
        await until(() => evaluate('document.getElementById("epsAfiliadosEstado").textContent.includes("Sin resultados")'));
        assert.equal(await evaluate('document.getElementById("epsNavAfiliados").getAttribute("aria-current")'), 'location');

        await go('/pages/eps-convenios.html');
        await until(() => evaluate('document.querySelector("#epsWorkspace")?.textContent.includes("Farmacias activas")'));
        await click('[data-eps-view="inventario"]');
        await until(() => evaluate('document.querySelector("#epsTitle")?.textContent === "Inventario" && document.querySelector("#epsWorkspace").getAttribute("aria-busy") === "false"'));

        const adminRequests = adminDashboardRequests;
        await send('Page.navigate', { url: base + '/pages/admin.html' });
        await until(() => evaluate('location.pathname === "/pages/eps.html"'));
        assert.equal(adminDashboardRequests, adminRequests);

        const pharmacyRequests = farmaciaDashboardRequests;
        await send('Page.navigate', { url: base + '/pages/farmacia.html' });
        await until(() => evaluate('location.pathname === "/pages/eps.html"'));
        assert.equal(farmaciaDashboardRequests, pharmacyRequests);

        for (const [rol, destino] of [
            [1, '/pages/admin.html'],
            [2, '/pages/dashboard.html'],
            [3, '/pages/farmacia.html']
        ]) {
            await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({nombre:'Rol ${rol}',rol:${rol}}))`);
            await send('Page.navigate', { url: base + '/pages/eps.html' });
            await until(() => evaluate(`location.pathname === ${JSON.stringify(destino)}`));
        }
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
            const access = await evaluate(`(async () => {
                const { puedeAcceder, PAGINAS_PRIVADAS } = await import('/js/roles.js');
                const route = ${JSON.stringify(route)};
                return { role: [2, 1, 3, 4].find(rol => puedeAcceder(route, { rol })),
                    restricted: PAGINAS_PRIVADAS.has(route) };
            })()`);
            assert.equal((await fetch(base + route)).status, 200, route);
            const user = { id: 42, nombre: 'Prueba', rol: access.role ?? 2 };
            await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user', JSON.stringify(${JSON.stringify(user)}))`);
            if (access.restricted && !access.role) {
                await send('Page.navigate', { url: base + route });
                await esperarPagina('/pages/dashboard.html');
            } else if (['/pages/admin-cuentas.html', '/pages/admin-pacientes.html'].includes(route)) {
                await send('Page.navigate', { url: base + route });
                await esperarPagina('/pages/admin.html');
                await until(() => evaluate('location.hash === "#usuarios"'));
            } else if (route === '/restablecer.html') {
                await go(route + '?token=frontend-test-only');
            } else {
                await go(route);
                await evaluate(`for (const s of [localStorage,sessionStorage]) s.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Prueba',rol:2}))`);
            }
            const controls = await evaluate(`({ links:[...document.querySelectorAll('a[href],script[src]')].map(e=>e.href||e.src), empty:[...document.querySelectorAll('a[href]')].filter(e=>e.getAttribute('href')==='#').length, buttons:[...document.querySelectorAll('button')].every(e=>e.hasAttribute('type')) })`);
            assert.equal(controls.empty,0,route); assert.equal(controls.buttons,true,route);
            for (const link of controls.links.filter(link=>link.startsWith(base))) {
                const url = new URL(link);
                assert.equal((await fetch(url)).status,200,link);
                const fragment = decodeURIComponent(url.hash.slice(1));
                if (route === '/pages/eps-v1.html' && url.pathname === route && fragment) {
                    const selector = `[data-eps-view=${JSON.stringify(fragment)}]`;
                    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) {
                        await click(selector);
                        await until(() => evaluate(`location.hash === ${JSON.stringify(url.hash)} &&
                            document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-current') === 'page'`));
                        continue;
                    }
                }
                if (url.hash && url.pathname === route && !/^#(dashboard|usuarios|solicitudes|mensajes|notificaciones|informes|auditoria|configuracion)(\/\d+)?$/.test(url.hash)) assert.equal(await evaluate(`!!document.getElementById(${JSON.stringify(decodeURIComponent(url.hash.slice(1)))})`),true,link);
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
    async function login(rol = 2) {
        loginCorrecto = true;
        loginRole = rol;
        await value('#email','prueba@example.com'); await value('#password','passwordtest');
        await evaluate(`window.__recaptchaOptions.callback('test-recaptcha-token')`);
        await click('button[type="submit"]');
    }
    await t.test('sin sesion: catalogo publico y retorno a acciones privadas tras login', async () => {
        await go('/index.html'); await sinSesion();
        await value('#busquedaInicio', 'acetaminofen'); await enter('#busquedaInicio');
        await until(async () => JSON.stringify(await nombresCatalogoPublico()) === JSON.stringify([medicamentos[0].nombre]));
        await click('[data-action="medicamentos"]');
        assert.equal(await evaluate('document.activeElement.id'), 'catalogo-publico');
        assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`), null);
        for (const [accion, destino] of [['pedido', '/pages/pedidos.html'], ['historial', '/pages/historial.html']]) {
            await go('/index.html'); await sinSesion();
            await click(`[data-action="${accion}"]`);
            await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`), destino);
            await login(); await esperarPagina(destino);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`), null);
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
    await t.test('las siete pÃ¡ginas privadas recuerdan accesos directos y no entran en bucle', async () => {
        for (const pagina of ['dashboard','medicamentos','pedidos','historial','perfil','farmacia','eps']) {
            await go('/index.html'); await sinSesion();
            const route = `/pages/${pagina}.html`;
            await send('Page.navigate',{url:base+route}); await esperarPagina('/login.html');
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),route);
            await login(pagina === 'farmacia' ? 3 : pagina === 'eps' ? 4 : 2); await esperarPagina(route);
            assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        }
    });
    await t.test('el login EPS sin destino pendiente abre su dashboard', async () => {
        await go('/index.html'); await sinSesion(); await go('/login.html');
        await login(4); await esperarPagina('/pages/eps.html');
        await until(() => evaluate('document.querySelector("#epsDashboardDatos")?.hidden === false'));
        assert.equal(await evaluate('document.querySelector("#epsDashboardEntidad").textContent'), 'EPS de prueba');
        await click('#logout'); await esperarPagina('/login.html');
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
            await until(catalogReady);
            if (!(await state()).borrador.some(item=>item.id===1)) await click('[data-medicamento-id="1"]');
            const before = await state(); await sinSesion(); await action(); await esperarPagina('/login.html');
            assert.deepEqual(await state(),before);
            await login(); await esperarPagina('/pages/medicamentos.html');
        }
    });
    await t.test('sesiÃ³n: cinco medicamentos, confirmar, logout limpia destino y volver exige login', async () => {
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Prueba',correo:'prueba@example.com'}))`);
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
        await until(() => evaluate('document.querySelector("#catalogo-publico-lista").getAttribute("aria-busy") === "false"'));
    }
    async function mouseClick(selector) {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant',block:'center'})`);
        const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
        await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    }
    await t.test('clics de raton en catalogo publico y servicios privados sin sesion', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
        await abrirInicioReal(); await sinSesion();
        await mouseClick('#servicios [data-action="medicamentos"]');
        assert.equal(await evaluate('document.activeElement.id'), 'catalogo-publico');
        assert.equal(await evaluate('location.pathname'), '/index.html');
        for (const [accion,destino] of [
            ['pedido','/pages/pedidos.html'],
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
            if (accion === 'formula') {
                await login();
                await esperarPagina(destino);
                assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`), null);
            }
        }
    });
    await t.test('clic real en Contactar sin autenticacion abre VITALIX sin correo', async () => {
        await abrirInicioReal(); await evaluate(`sessionStorage.clear(); localStorage.removeItem('saludclick_token')`); await abrirInicioReal();
        await mouseClick('#servicios [data-action="contacto"]');
        await esperarPagina('/pages/chat.html');
        assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8'), /mailto:/);
        assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`),null);
        t.diagnostic('Contactar: clic real -> VITALIX sin iniciar sesion');
    });
    await t.test('el inicio ofrece acceso a login y no expone registro', async () => {
        await abrirInicioReal();
        assert.equal(await evaluate(`!!document.querySelector('.botones-nav a[href="registro.html"]')`), false);
        await mouseClick('.home-login-link[href="/login.html"]');
        await esperarPagina('/login.html');
        t.diagnostic(`login.html: clic real -> ${await evaluate('location.href')}`);
    });
    await t.test('servicios de Inicio visibles y accesibles en móvil', async () => {
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
        await go('/index.html');
        assert.equal(await evaluate('document.querySelectorAll("#servicios [data-action]").length'),6);
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".grid-servicios")).display'),'grid');
        assert.equal(await evaluate('getComputedStyle(document.querySelector("#servicios .grid-servicios")).gridTemplateColumns.split(" ").length'),1);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#servicios a[data-action]')].map(link => link.getAttribute('href'))`),
            ['#catalogo-publico', '/pages/pedidos.html', '/pages/historial.html', '/pages/formulas.html', '/pages/historial.html', '/pages/chat.html']);
    });
    await t.test('imágenes locales del catálogo de medicamentos cargan', async () => {
        await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Prueba',rol:2}))`);
        await go('/pages/medicamentos.html');
        await until(async () => (await visibleNames()).length === 5);
        const images = await evaluate("document.querySelectorAll('#catalogoMedicamentos .mc-medication-image').length");
        for (let i=0;i<images;i++) {
            await evaluate(`document.querySelectorAll('#catalogoMedicamentos .mc-medication-image')[${i}].scrollIntoView()`);
            await until(() => evaluate(`document.querySelectorAll('#catalogoMedicamentos .mc-medication-image')[${i}].complete`));
        }
        const catalogoImagenes = await evaluate(`[...document.querySelectorAll('#catalogoMedicamentos .mc-medication-image')].map(img=>({src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}))`);
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
            for (const [role, home] of [[1, '/pages/admin.html'], [3, '/pages/farmacia.html'], [4, '/pages/eps.html']]) {
                await sinSesion();
                await go('/login.html');
                await evaluate(`sessionStorage.setItem('${destinoKey}', '/pages/pedidos.html')`);
                loginRole = role;
                await login(role);
                await esperarPagina(home);
                assert.equal(await evaluate(`sessionStorage.getItem('${destinoKey}')`), null);
            }
        } finally { loginRole = 2; }
    });
    await t.test('farmacia y EPS no ven opciones personales en el perfil y las sesiones corruptas fallan cerrado', async () => {
        for (const [role, home] of [[3, '/pages/farmacia.html'], [4, '/pages/eps.html']]) {
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
    await t.test('guardar perfil conserva sesion temporal, rol y documento sin ofrecer cambio de correo', async () => {
        profileEnabled = true;
        try {
            await sinSesion();
            await evaluate(`(async()=>{const auth=await import('/js/auth.js'); auth.setSession('frontend-test-only',{nombre:'Farmacia',rol:3},false);})()`);
            await go('/pages/perfil.html');
            await until(() => evaluate('document.querySelector("#numeroDocumento").value === "DOC-123"'));
            assert.equal(await evaluate('document.querySelector("#email").readOnly'), true);
            await value('#numeroDocumento', 'DOC-456');
            await click('#guardarPerfil');
            await until(() => evaluate('document.querySelector("#mensajePerfil").textContent.includes("actualizado correctamente")'));
            assert.equal(profileUpdate.numeroDocumento, 'DOC-456');
            assert.equal(profileUpdate.rol_id, undefined);
            assert.equal(profileUpdate.correo, undefined);
            assert.equal(await evaluate('localStorage.getItem("saludclick_token")'), null);
            assert.equal(await evaluate('sessionStorage.getItem("saludclick_token")'), 'frontend-test-only');
            assert.equal(await evaluate('JSON.parse(sessionStorage.getItem("saludclick_user")).rol'), 3);
        } finally { profileEnabled = false; }
    });
    await t.test('chat rechaza sesiones ausentes y roles ajenos antes de consultar o conectar sockets', async () => {
        for (const [role, home] of [[null, '/login.html'], [1, '/pages/admin.html'], [3, '/pages/farmacia.html'], [4, '/pages/eps.html'], [99, '/login.html']]) {
            await sinSesion();
            if (role !== null) await evaluate(`localStorage.setItem('saludclick_token','frontend-test-only'); localStorage.setItem('saludclick_user',JSON.stringify({nombre:'Personal',rol:${role}}))`);
            const before = chatRequests;
            await send('Page.navigate', { url: base + '/pages/chat-farmacia.html' });
            await esperarPagina(home);
            assert.equal(chatRequests, before);
        }
    });
    await t.test('paciente conserva el chat humano con envio y recepcion de mensajes',async()=>{
        const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
          window.io=()=>{
            const handlers={};let sequence=0;
            const socket={connected:true,on(event,callback){handlers[event]=callback;if(event==='connect')setTimeout(callback,20);return socket;},
              emit(event,data,ack){
                if(event==='chat:join')ack?.({ok:true,mensajes:[]});
                if(event==='chat:send'){
                  const user=JSON.parse(sessionStorage.getItem('saludclick_user')||localStorage.getItem('saludclick_user'));
                  const message={id:++sequence,conversacion_id:data.conversationId,remitente_id:user.id,contenido:data.contenido,estado:'ENVIADO',created_at:new Date().toISOString()};
                  handlers['chat:message']?.(message);ack?.({ok:true,message});
                }
              },disconnect(){socket.connected=false;}};return socket;
          };`});
        try{
            for(const [role,id] of [[2,20]]){
                await evaluate(`for(const s of [localStorage,sessionStorage]){s.setItem('saludclick_token','frontend-test-only');s.setItem('saludclick_user',JSON.stringify({id:${id},nombre:'Prueba',rol:${role}}));}`);
                await go(role === 3 ? '/pages/farmacia-chat.html' : '/pages/chat-farmacia.html');
                await until(()=>evaluate(`document.querySelector('.chat-connection')?.textContent.includes('En línea') && document.querySelector('#chatMessage')?.disabled===false`));
                await evaluate(`document.querySelector('#chatMessage').focus()`);
                await send('Input.insertText',{text:'Consulta de prueba'});
                await until(()=>evaluate(`!document.querySelector('.chat-composer button').disabled`));
                await click('.chat-composer button');
                await until(()=>evaluate(`document.querySelector('.chat-bubble')?.textContent.includes('Consulta de prueba')`));
            }
        }finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});}
    });



    async function paymentPage(config = {}, empty = false) {
        paymentFixture = config;
        paymentRecords.clear();
        paymentChecks.length = 0;
        await go('/login.html');
        await evaluate("localStorage.clear();sessionStorage.clear();sessionStorage.setItem('saludclick_token','patient-payment');sessionStorage.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Paciente',rol:2}));");
        if (!empty) await evaluate("localStorage.setItem('saludclick_pedido_temporal_v1:71',JSON.stringify({version:1,borrador:[{id:1,cantidad:1}],confirmados:[]}))");
        await go('/pages/pedidos.html#checkout');
        if (!empty) await until(() => evaluate("!document.getElementById('pagarPedido').disabled"));
        else await until(() => evaluate("document.getElementById('carritoPedido').rows.length > 0"));
    }
    const paymentState = state => evaluate('document.getElementById("pagoSimulado").dataset.state === '+JSON.stringify(state));
    try {
        await t.test('pago: aprobacion confirmada, comprobante con fecha persistida e historial actualizado', async () => {
            await paymentPage({delay:500});
            await evaluate("document.getElementById('titular').value='NO ENVIAR ESTE NOMBRE';document.getElementById('pagarPedido').click();document.getElementById('pagarPedido').click();");
            assert.equal(await paymentState('processing'),true);
            assert.equal(await evaluate("document.getElementById('resultadoPago').hidden"),true);
            await until(() => paymentState('approved'));
            await until(() => evaluate("document.getElementById('resultadoPago').textContent.includes('2026')"));
            assert.equal(paymentRecords.size,1);
            assert.equal(paymentChecks.length,1);
            assert.equal(paymentChecks[0].safe,true);
            const receipt=await evaluate("document.getElementById('resultadoPago').textContent");
            for(const text of ['SIM-TEST-801','#801','TARJETA','APROBADO','APROBADA','2026']) assert.ok(receipt.includes(text),text);
            assert.equal(await evaluate("document.getElementById('resultadoPago').textContent.includes(new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(4321))"),true);
            await until(() => evaluate("document.getElementById('tablaPedidos').textContent.includes('#801')"));
            assert.equal((await state()).borrador.length,0);
            assert.equal(await evaluate("document.getElementById('pagarPedido').disabled"),true);
            await go('/pages/historial.html');
            await until(() => evaluate('Boolean(document.querySelector(".btn-ver-pedido"))'));
            await click('.btn-ver-pedido');
            await until(() => evaluate('document.querySelector("#modalPedidoContenido")?.textContent.includes("SIM-TEST-801")'));
            assert.match(await evaluate('document.querySelector("#modalPedidoContenido").textContent'), /Aprobado/);
            await click('#cerrarModalPedido');
        });
        await t.test('pago: rechazo real de la simulacion conserva el carrito y permite reintento', async () => {
            await paymentPage();
            await value('#escenarioPago','rechazada');
            await evaluate("document.getElementById('escenarioPago').dispatchEvent(new Event('change'))");
            await click('#pagarPedido');
            await until(() => paymentState('rejected'));
            assert.equal(paymentRecords.size,0);
            assert.equal((await state()).borrador.length,1);
            assert.equal(await evaluate("document.getElementById('resultadoPago').hidden"),true);
            await value('#escenarioPago','alternativa');await evaluate("document.getElementById('escenarioPago').dispatchEvent(new Event('change'))");
            await click('#pagarPedido');await until(() => paymentState('approved'));
            assert.equal([...paymentRecords.values()][0].pago.marca,'MASTERCARD');
        });
        await t.test('pago: respuesta perdida recupera el mismo registro con la misma clave', async () => {
            await paymentPage();
            await evaluate("(()=>{const original=window.fetch;window.fetch=async function(...args){const response=await original.apply(this,args);if(String(args[0]).includes('/api/pedidos')&&args[1]?.method==='POST'){window.fetch=original;throw new TypeError('Respuesta perdida de prueba');}return response;};})()");
            await click('#pagarPedido');await until(() => paymentState('error'));
            assert.equal(paymentRecords.size,1);
            assert.equal((await state()).borrador.length,1);
            assert.equal(await evaluate("document.getElementById('resultadoPago').hidden"),true);
            await click('#pagarPedido');await until(() => paymentState('approved'));
            assert.equal(paymentRecords.size,1);
            assert.equal(paymentChecks[0].key,paymentChecks[1].key);
        });
        await t.test('pago: carrito vacio, stock insuficiente y sesion expirada no muestran aprobacion', async () => {
            await paymentPage({},true);
            assert.equal(await evaluate("document.getElementById('pagarPedido').disabled"),true);
            assert.equal(paymentChecks.length,0);
            await paymentPage({status:409,message:'Stock insuficiente para el medicamento.'});
            await click('#pagarPedido');await until(() => paymentState('error'));
            assert.equal((await state()).borrador.length,1);
            assert.equal(paymentRecords.size,0);
            await paymentPage({status:401});await click('#pagarPedido');
            await until(() => evaluate("location.pathname==='/login.html'"));
            assert.equal(await evaluate("sessionStorage.getItem('saludclick_token')"),null);
        });
        await t.test('pago: campos de demostracion no admiten numeros arbitrarios ni los transmiten', async () => {
            await paymentPage();
            assert.equal(await evaluate("['titular','numero','vencimiento','cvv'].every(id=>document.getElementById(id).readOnly)"),true);
            await value('#numero','1111111111111111');await click('#pagarPedido');await until(() => paymentState('error'));
            assert.equal(paymentChecks.length,0);
            assert.equal(await evaluate("document.getElementById('numero').value.split(' ').join('')"),'4242424242424242');
        });
        await t.test('pago: fallo de almacenamiento local tras confirmar no permite crear otro pedido', async () => {
            await paymentPage();
            await evaluate("(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='saludclick_pedido_temporal_v1:71')throw new Error('Storage unavailable in fixture');return original.call(this,key,value);};})()");
            await click('#pagarPedido');await until(() => paymentState('approved'));
            assert.equal(paymentRecords.size,1);
            assert.equal(await evaluate("document.getElementById('pagarPedido').disabled"),true);
            await click('#pagarPedido');
            assert.equal(paymentChecks.length,1);
            assert.equal((await state()).borrador.length,1);
            assert.ok(await evaluate("!!sessionStorage.getItem('saludclick_pedido_idempotencia:71')"));
        });
        await t.test('pago: cuatro campos visibles de demostracion con selector tecnico oculto', async () => {
            await paymentPage();
            assert.equal(await evaluate("document.getElementById('escenarioPago').getClientRects().length"),0);
            assert.equal(await evaluate("['titular','numero','vencimiento','cvv'].every(id=>{const node=document.getElementById(id);return node.getClientRects().length>0&&node.readOnly&&node.autocomplete==='off'})"),true);
            assert.deepEqual(await evaluate("['titular','numero','vencimiento','cvv'].map(id=>document.getElementById(id).value)"),['Titular de prueba','4242 4242 4242 4242','12/30','123']);
            assert.equal(await evaluate("document.querySelector('.sc-pay-card')===null"),true);
            assert.equal(await evaluate("document.querySelector('.sc-pay-badge').textContent"),'Pago simulado');
            assert.equal(await evaluate("document.querySelectorAll('#escenarioPago option').length"),3);
        });
        await t.test('pago: entrega en farmacia y domicilio conservan requisitos y datos enviados', async () => {
            await paymentPage();
            assert.equal(await evaluate("document.getElementById('tipoEntrega').value"),'RECOGER');
            assert.equal(await evaluate("document.getElementById('direccion').disabled && !document.getElementById('direccion').required"),true);
            await value('#tipoEntrega','DOMICILIO');
            await evaluate("document.getElementById('tipoEntrega').dispatchEvent(new Event('change'))");
            assert.equal(await evaluate("!document.getElementById('direccion').disabled && document.getElementById('direccion').required"),true);
            await click('#pagarPedido');await until(() => paymentState('error'));
            assert.equal(paymentChecks.length,0);
            assert.equal(await evaluate("document.getElementById('direccion').getAttribute('aria-invalid')"),'true');
            await value('#direccion','Direccion ficticia de pruebas 123');
            await click('#pagarPedido');await until(() => paymentState('approved'));
            assert.equal(paymentChecks[0].tipoEntrega,'DOMICILIO');
            assert.equal(paymentChecks[0].direccion,'Direccion ficticia de pruebas 123');
            await paymentPage();await click('#pagarPedido');await until(() => paymentState('approved'));
            assert.equal(paymentChecks[0].tipoEntrega,'RECOGER');
            assert.equal(paymentChecks[0].direccion,'');
        });
        await t.test('pago: panel y comprobante adaptables a escritorio y movil', async () => {
            await paymentPage();
            const directory=fs.mkdtempSync(path.join(os.tmpdir(),'saludclick-payment-preview-'));
            for(const width of [1440,768,390,320]){
                await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
                await evaluate("document.getElementById('pagoSimulado').scrollIntoView({behavior:'instant'})");
                assert.equal(await evaluate("(()=>{const r=document.getElementById('pagoSimulado').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"),true);
                assert.equal(await evaluate("document.querySelector('.sc-pay-method').getBoundingClientRect().height < 160"),true);
                assert.equal(await evaluate("document.getElementById('escenarioPago').getClientRects().length===0"),true);
                assert.equal(await evaluate("(()=>{const titular=document.getElementById('titular').getBoundingClientRect(),number=document.getElementById('numero').getBoundingClientRect(),expiry=document.getElementById('vencimiento').getBoundingClientRect(),cvv=document.getElementById('cvv').getBoundingClientRect();return Math.abs(titular.width-number.width)<1&&number.width>expiry.width&&Math.abs(expiry.top-cvv.top)<1&&expiry.right<=cvv.left&&['titular','numero','vencimiento','cvv'].every(id=>document.getElementById(id).getClientRects().length>0)})()"),true);
                const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
                fs.writeFileSync(path.join(directory,width+'.png'),Buffer.from(shot.data,'base64'));
            }
            await click('#pagarPedido');await until(() => paymentState('approved'));
            await until(() => evaluate("document.getElementById('resultadoPago').textContent.includes('2026')"));
            assert.equal(await evaluate("(()=>{const r=document.getElementById('resultadoPago').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"),true);
            t.diagnostic('Capturas pago: '+directory);
            await send('Emulation.clearDeviceMetricsOverride');
        });
    } finally { paymentFixture = null; }

    async function medicationPage(config = {}) {
        medicationFixture = config;
        await go('/login.html');
        await evaluate(`localStorage.clear();sessionStorage.clear();sessionStorage.setItem('saludclick_token','patient-a');sessionStorage.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Paciente',rol:2}));`);
        await go('/pages/medicamentos.html');
    }
    try {
        await t.test('medicamentos: carga sin filas de prueba, vacio real, error y reintento', async () => {
            await medicationPage({delay:900});
            assert.equal(await evaluate(`document.querySelector('#catalogoEstado').dataset.state`),'loading');
            assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),0);
            await until(catalogReady);
            await medicationPage({medicamentos:[]});
            await until(() => evaluate(`document.querySelector('#catalogoEstado').dataset.state==='empty'`));
            assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),0);
            assert.equal(await evaluate(`document.querySelector('#confirmarPedido').disabled`),true);
            await medicationPage({status:500});
            await until(() => evaluate(`document.querySelector('#catalogoEstado').dataset.state==='error'`));
            assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),0);
            medicationFixture = {};
            await click('#reintentarCatalogo');
            await until(catalogReady);
        });
        await t.test('medicamentos: categorias reales, presentacion, receta y disponibilidad sin inferencias', async () => {
            await medicationPage({medicamentos:medicamentos.map((med,i)=>({...med,presentacion:i===0?'Caja de prueba x 20':null,requiere_formula:i===0?true:null,...(i===1?{stock:0}:{})}))});
            await until(catalogReady);
            assert.match(await evaluate(`document.querySelector('[data-catalog-id="1"]').textContent`),/Caja de prueba x 20/);
            assert.match(await evaluate(`document.querySelector('[data-catalog-id="1"]').textContent`),/Requiere fórmula/);
            assert.equal(await evaluate(`document.querySelector('[data-medicamento-id="2"]').disabled`),true);
            await value('#filtroCategoriaMedicamentos','1');
            await evaluate(`document.querySelector('#filtroCategoriaMedicamentos').dispatchEvent(new Event('change'))`);
            assert.deepEqual(await visibleNames(),['Acetaminofén']);
            await value('#buscadorMedicamentos','inexistente');await click('#buscarMedicamentos');
            assert.equal((await visibleNames()).length,0);
            assert.match(await evaluate(`document.querySelector('#catalogoEstado').textContent`),/coincidan/);
        });
        await t.test('medicamentos: limita cantidades segun stock sin crear pedidos desde el catalogo', async () => {
            await medicationPage({medicamentos:medicamentos.map((med,i)=>({...med,stock:i===0?2:med.stock}))});
            await until(catalogReady);
            const before=orderRequests;
            await click('[data-medicamento-id="1"]');await click('[data-medicamento-id="1"]');
            assert.equal((await state()).borrador[0].cantidad,2);
            assert.equal(await evaluate(`document.querySelector('[data-medicamento-id="1"]').disabled`),true);
            await setCartQuantity('Acetaminofén',3);
            assert.equal((await state()).borrador[0].cantidad,2);
            assert.equal(orderRequests,before);
            await click('#vaciarPedido');
            assert.equal(await evaluate(`document.querySelector('[data-medicamento-id="1"]').disabled`),false);
            assert.equal(await evaluate(`document.querySelector('#catalogoMedicamentos table')===null&&document.querySelector('#detallePedido table')===null`),true);
            assert.equal(await evaluate(`document.querySelector('#tituloPedido').textContent.includes('Mi pedido temporal')`),false);
        });
        await t.test('medicamentos: pagina tarjetas sin perder filtros ni seleccion', async () => {
            await medicationPage({medicamentos:Array.from({length:30},(_,i)=>({...medicamentos[0],id:i+1,nombre:'Catalogo '+String(i+1).padStart(2,'0')}))});
            await until(() => evaluate(`document.querySelectorAll('.mc-card').length===24`));
            await click('#verMasMedicamentos');
            assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),30);
            await click('[data-medicamento-id="30"]');
            assert.equal((await state()).borrador[0].id,30);
            await value('#buscadorMedicamentos','Catalogo 30');await click('#buscarMedicamentos');
            assert.deepEqual(await visibleNames(),['Catalogo 30']);
        });
        await t.test('medicamentos: escritorio y movil sin desbordamiento; imagenes de referencia', async () => {
            await medicationPage();await until(catalogReady);await click('[data-medicamento-id="1"]');
            const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'saludclick-medication-preview-'));
            for(const width of [1440,768,390,320]) {
                await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
                await evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
                assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
                assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),5);
                const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
                fs.writeFileSync(path.join(screenshots,width+'.png'),Buffer.from(shot.data,'base64'));
            }
            t.diagnostic('Capturas medicamentos: '+screenshots);
            await send('Emulation.clearDeviceMetricsOverride');
        });
    } finally { medicationFixture = null; }

    async function patientDashboard(config = {}) {
        dashboardFixture = config;
        await go('/login.html');
        await evaluate(`localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('saludclick_token','patient-a'); sessionStorage.setItem('saludclick_user',JSON.stringify({id:71,nombre:'Nombre local anterior',rol:2}));`);
        await go('/pages/dashboard.html');
    }
    const dashboardState = state => evaluate(`document.querySelector('#dashboardEstado')?.dataset.state === ${JSON.stringify(state)}`);
    try {
        await t.test('dashboard paciente: carga, cuatro valores reales de la respuesta e identidad verificada', async () => {
            await patientDashboard({ delay: 1000 });
            assert.equal(await dashboardState('loading'), true);
            assert.equal(await evaluate(`document.querySelector('.dashboard-stats').getAttribute('aria-busy')`), 'true');
            assert.deepEqual(await evaluate(`['totalPedidos','totalFormulas','pedidosActivos','totalGastado'].map(id=>document.getElementById(id).textContent)`), ['—','—','—','—']);
            assert.equal(await evaluate(`document.querySelector('#nombreUsuarioPanel').textContent.trim()`), 'Usuario');
            await until(() => dashboardState('loaded'));
            assert.deepEqual(await evaluate(`['totalPedidos','totalFormulas','pedidosActivos'].map(id=>document.getElementById(id).textContent)`), ['5','3','2']);
            assert.equal(await evaluate(`document.querySelector('#totalGastado').textContent === new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(12500)`), true);
            assert.deepEqual(await evaluate(`['nombreUsuarioTop','nombreUsuario','nombreUsuarioPanel'].map(id=>document.getElementById(id).textContent)`), ['Ana','Ana','Ana']);
            assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('saludclick_user')).nombre`), 'Ana');
            assert.equal(await evaluate(`localStorage.getItem('saludclick_token')`), null);
            for (const width of [1440,768,390,320]) {
                await send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:false});
                assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
                assert.equal(await evaluate(`document.querySelectorAll('.dashboard-stat').length`), 4);
            }
            await send('Emulation.clearDeviceMetricsOverride');
        });
        await t.test('dashboard paciente: salud de la API se muestra sin falsear estadisticas', async () => {
            await patientDashboard({});
            await until(() => evaluate('document.querySelector("#dashboardSaludEstado").textContent === "Conexión operativa"'));
            await patientDashboard({healthOk:false});
            await until(() => evaluate('document.querySelector("#dashboardSaludEstado").textContent === "Conexión no verificada"'));
            await until(() => evaluate('document.querySelector("#dashboardEstado").dataset.state === "loaded"'));
            assert.equal(await evaluate('document.querySelector("#totalPedidos").textContent'), '5');
        });
        await t.test('dashboard paciente: cero es ausencia de registros y no error', async () => {
            await patientDashboard({ statistics: { pedidos:0, formulas:0, pedidosActivos:0, totalPagado:0 } });
            await until(() => dashboardState('empty'));
            assert.deepEqual(await evaluate(`['totalPedidos','totalFormulas','pedidosActivos'].map(id=>document.getElementById(id).textContent)`), ['0','0','0']);
            assert.match(await evaluate(`document.querySelector('#dashboardEstado').textContent`), /Sin registros/);
        });
        await t.test('dashboard paciente: errores HTTP y de conexion no se muestran como ceros; permite recarga', async () => {
            for (const config of [{statsStatus:503},{disconnect:true}]) {
                await patientDashboard(config);
                await until(() => dashboardState('error'));
                assert.equal(await evaluate(`document.querySelector('#totalPedidos').textContent`), '—');
                assert.equal(await evaluate(`document.querySelector('#dashboardEstado').getAttribute('role')`), 'alert');
            }
            dashboardFixture = {};
            await evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);
            await until(() => dashboardState('loaded'));
        });
        await t.test('dashboard paciente: respuestas incompletas o invalidas no inventan indicadores', async () => {
            for (const statistics of [{pedidos:0,formulas:0},{pedidos:1,formulas:0,pedidosActivos:-1,totalPagado:1},{pedidos:1,formulas:0,pedidosActivos:1,totalPagado:'incorrecto'}]) {
                await patientDashboard({ statistics });
                await until(() => dashboardState('error'));
                assert.equal(await evaluate(`document.querySelector('#totalGastado').textContent`), '—');
            }
        });
        await t.test('dashboard paciente: identidad ajena o de otro rol impide mostrar el resumen', async () => {
            for (const identity of [{id:72,nombre:'Otro paciente',rol_id:2},{id:71,nombre:'Otro rol',rol_id:3}]) {
                await patientDashboard({ identity });
                await until(() => dashboardState('error'));
                assert.equal(await evaluate(`document.querySelector('#totalPedidos').textContent`), '—');
                assert.equal(await evaluate(`document.querySelector('#nombreUsuarioPanel').textContent`), 'Usuario');
            }
        });
        await t.test('dashboard paciente: fallo de perfil no usa el nombre local como identidad verificada', async () => {
            await patientDashboard({profileStatus:503});
            await until(() => dashboardState('error'));
            assert.equal(await evaluate(`document.querySelector('#nombreUsuarioPanel').textContent`), 'Usuario');
            assert.equal(await evaluate(`document.querySelector('#totalPedidos').textContent`), '5');
        });
        await t.test('dashboard paciente: descarta respuestas pendientes al cambiar de paciente', async () => {
            await patientDashboard({delay:700});
            dashboardFixture = {};
            await evaluate(`sessionStorage.setItem('saludclick_token','patient-b');sessionStorage.setItem('saludclick_user',JSON.stringify({id:72,nombre:'Beatriz local',rol:2}));window.dispatchEvent(new StorageEvent('storage',{key:'saludclick_token'}));`);
            await until(() => dashboardState('loaded'));
            await delay(900);
            assert.equal(await evaluate(`document.querySelector('#totalPedidos').textContent`), '8');
            assert.equal(await evaluate(`document.querySelector('#nombreUsuarioPanel').textContent`), 'Beatriz');
        });
        await t.test('dashboard paciente: sesion expirada borra datos y vuelve al login', async () => {
            await patientDashboard({statsStatus:401,delay:100});
            await until(() => evaluate(`location.pathname === '/login.html'`));
            assert.equal(await evaluate(`sessionStorage.getItem('saludclick_token') || localStorage.getItem('saludclick_token')`), null);
        });
    } finally { dashboardFixture = null; }

    await t.test('formula del paciente: evita doble carga y abre el visor desde el clic', async () => {
        formulaFixture = { uploads: 0, formulas: [] };
        try {
            await evaluate('sessionStorage.setItem("saludclick_token","frontend-test-only"); sessionStorage.setItem("saludclick_user",JSON.stringify({id:71,nombre:"Paciente",rol:2}));');
            await go('/pages/formulas.html');
            await until(() => evaluate('Boolean(document.querySelector("#listaFormulas .empty-state"))'));
            await value('#formulaNombre', 'Formula ficticia');
            await evaluate('(() => { const files = new DataTransfer(); files.items.add(new File(["%PDF-1.4"], "fixture.pdf", {type:"application/pdf"})); document.querySelector("#formulaArchivo").files = files.files; const submit = document.querySelector("#formulaForm button[type=submit]"); submit.click(); submit.click(); })()');
            await until(() => evaluate('Boolean(document.querySelector(".formula-card button"))'));
            assert.equal(formulaFixture.uploads, 1);
            await evaluate('(() => { window.open = () => ({closed:false,close(){},location:{replace(url){window.formulaPreview = url;}}}); document.querySelector(".formula-card button").click(); window.open = () => null; })()');
            await until(() => evaluate('window.formulaPreview?.startsWith("blob:")'));
        } finally { formulaFixture = null; }
    });
    await t.test('sin excepciones JavaScript propias', () => assert.deepEqual(errors,[]));
});

