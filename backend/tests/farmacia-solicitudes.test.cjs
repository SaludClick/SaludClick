require('./support/isolate-database.cjs');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
let orders, calls, writes, failure, race;
const users = [{ id: 30, rol_id: 3, estado: 'ACTIVO' }, { id: 31, rol_id: 3, estado: 'INACTIVO' }, { id: 32, rol_id: 2, estado: 'ACTIVO' }];
function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object') {
            if ('is' in value) return (row[key] ?? null) === value.is;
            if ('in' in value) return value.in.includes(row[key]);
            if ('some' in value || 'every' in value || 'none' in value) return (!('some' in value) || row[key].some(item => matches(item, value.some))) && (!('every' in value) || row[key].every(item => matches(item, value.every))) && (!('none' in value) || !row[key].some(item => matches(item, value.none)));
            return matches(row[key], value);
        }
        return row[key] === value;
    });
}
function project(row, select) {
    if (!row) return null;
    return Object.fromEntries(Object.entries(select).map(([key, spec]) => [key, spec === true ? row[key] : Array.isArray(row[key]) ? row[key].map(item => project(item, spec.select)) : project(row[key], spec.select)]));
}
const db = {
    usuario: { findUnique: async ({ where }) => users.find(user => user.id === where.id) || null },
    solicitud: {
        async findMany(options) { calls.push(options); if (failure) throw failure; return orders.filter(row => matches(row, options.where)).sort((a,b) => a.id-b.id).slice(options.skip, options.skip+options.take).map(row => project(row, options.select)); },
        async count({ where }) { return orders.filter(row => matches(row, where)).length; },
        async groupBy({ where }) {
            const grouped = {};
            orders.filter(row => matches(row, where)).forEach(row => { grouped[row.estado] = (grouped[row.estado] || 0)+1; });
            return Object.entries(grouped).map(([estado, count]) => ({ estado, _count: { _all: count } }));
        },
        async findFirst({ where, select }) { calls.push({ detail: where }); if (failure) throw failure; return structuredClone(project(orders.find(row => matches(row, where)), select)); },
        async updateMany({ where, data }) {
            writes++;
            if (race) { race(orders); race = null; }
            const row = orders.find(row => matches(row, where));
            if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 };
        }
    },
    medicamento: { findMany: async () => [], count: async () => 0 },
    async $transaction(operation) { const previous = structuredClone(orders); try { return await operation(db); } catch (error) { orders = previous; throw error; } }
};
require.cache[require.resolve('../src/config/prisma')].exports = db;
require.cache[require.resolve('../src/config/database')].exports = { query: async () => ({ rows: [] }) };
const origins = new Set(); require('../src/config/cors').getAllowedOrigins = () => origins;
// Contratos históricos preparados: fixture sin el cierre estructural de rutas.
// NO certifican disponibilidad en producción; farmacia-entregas prueba el app real.
const app = require('express')();
app.use(require('express').json());
const { requireFarmacia } = require('../src/middlewares/farmacia.middleware');
const { requireFarmaciaVigente } = require('../src/middlewares/farmacia-notificaciones.middleware');
const controller = require('../src/controllers/farmacia.controller');
app.use('/api/farmacia/pedidos', requireFarmacia, requireFarmaciaVigente);
app.get('/api/farmacia/pedidos', (req, res) => {
    const { documento, ...query } = req.query;
    // The legacy controller fixture has no document filter. Map its synthetic documents to order IDs.
    if (documento) Object.defineProperty(req, 'query', { value: { ...query, id: documento } });
    return controller.pedidos(req, res);
});
app.get('/api/farmacia/pedidos/:id', controller.detallePedido);
app.patch('/api/farmacia/pedidos/:id/estado', controller.avanzarPedido);
app.use('/api/integracion/farmacia', requireFarmacia, requireFarmaciaVigente);
app.get('/api/integracion/farmacia/pedidos', controller.pedidos);
app.get('/api/integracion/farmacia/pedidos/:id', controller.detallePedido);
app.patch('/api/integracion/farmacia/solicitudes/:id/estado', controller.avanzarPedido);
app.use(require('../src/app'));
let server, origin;
const secretBefore = process.env.JWT_SECRET, enabledBefore = process.env.FARMACIA_NOTIFICACIONES_ENABLED;
before(async () => {
    process.env.JWT_SECRET = 'solicitudes-isolated-test-only';
    process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'false';
    server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`; origins.add(origin);
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of [['JWT_SECRET', secretBefore], ['FARMACIA_NOTIFICACIONES_ENABLED', enabledBefore]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function order(id, estado = 'APROBADA', formula = false, simulated = false) {
    return { id, estado, fecha: new Date('2026-11-14T12:00:00Z'), tipo_entrega: id === 2 ? 'DOMICILIO' : 'RECOGER', direccion: 'Dirección aislada de prueba',
        usuario: { nombre: '<img src=x>', apellido: 'Prueba', correo: 'privado@example.test', cedula: 'privado', password: 'privado' },
        observaciones: 'Información que no se debe exponer', pagos: [{ estado: 'APROBADO', simulacion: simulated, referencia: 'privado', monto: 100, ultimos_digitos: '0000' }],
        detalles: [{ cantidad: 2, precio: 100, medicamento: { id: 1, nombre: '<img src=x> Medicamento de prueba', descripcion: 'Descripción de prueba', requiere_formula: formula } }] };
}
beforeEach(() => {
    orders = Array.from({ length: 60 }, (_, i) => order(i+1, ['APROBADA','PREPARANDO','LISTA','ENTREGADA'][i%4]));
    orders.push(order(61, 'APROBADA', false, true), order(62, 'APROBADA', true), order(63, 'APROBADA', null), { ...order(64), detalles: [] }, order(65, 'PENDIENTE'));
    calls = []; writes = 0; failure = null; race = null;
});
const token = (id = 30, rol = 3, expiresIn = '1h') => jwt.sign({ id, rol }, process.env.JWT_SECRET, { expiresIn });
async function request(path = '', { id = 30, role = 3, body, auth } = {}) {
    const response = await fetch(`${origin}/api/farmacia/pedidos${path}`, {
        method: body === undefined ? 'GET' : 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(role === null ? {} : { Authorization: `Bearer ${auth || token(id, role)}` }) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
}
const advance = (id = 1, actual = 'APROBADA', estado = 'PREPARANDO') => request(`/${id}/estado`, { body: { estadoActual: actual, estado } });

test('entregar y reintentar una solicitud no vuelve a descontar el stock reservado al crearla', async () => {
    const stockYaDescontado = 7;
    orders = [order(1, 'LISTA')];
    let saldo = stockYaDescontado;
    const previous = db.medicamento;
    // Cualquier intento de acceso al saldo desde la entrega hace fallar la prueba.
    db.medicamento = new Proxy({}, { get() { saldo--; assert.fail('La entrega intentó acceder al inventario.'); } });
    try {
        const results = await Promise.all([advance(1,'LISTA','ENTREGADA'), advance(1,'LISTA','ENTREGADA')]);
        assert.deepEqual(results.map(r=>r.status).sort(), [200,409]);
        assert.equal(orders[0].estado,'ENTREGADA'); assert.equal(saldo,stockYaDescontado);
        assert.equal((await advance(1,'LISTA','ENTREGADA')).status,409);
    } finally { db.medicamento = previous; }
});

test('JWT, cuenta activa y rol actual 3 en listado, detalle y avance', async () => {
    for (const [path, body] of [['', undefined], ['/1', undefined], ['/1/estado', { estadoActual: 'APROBADA', estado: 'PREPARANDO' }]]) {
        for (const role of [null, 1, 2, 4, 99]) assert.equal((await request(path, { role, body })).status, role === null || role === 99 ? 401 : 403);
        for (const id of [31, 32, 999]) assert.equal((await request(path, { id, body })).status, 403);
        assert.equal((await request(path, { auth: token(30, 3, -1), body })).status, 401);
    }
    assert.equal(calls.length, 0); assert.equal(writes, 0);
});
test('paginación estable, máximo 50, filtros por estado y búsqueda por ID combinados', async () => {
    const first = await request(); assert.equal(first.status, 200); assert.equal(first.cache, 'no-store');
    assert.equal(first.data.pedidos.length, 25); assert.equal(first.data.paginacion.total, 49);
    const second = await request('?pagina=2'); assert.equal(second.data.pedidos.length, 24);
    assert.equal(first.data.pedidos.some(a => second.data.pedidos.some(b => a.id === b.id)), false);
    assert.equal((await request('?estado=todas&tamano=50')).data.pedidos.length, 50);
    assert.equal((await request('?estado=ENTREGADA')).data.paginacion.total, 15);
    assert.deepEqual((await request('?estado=todas&id=4')).data.pedidos.map(row => row.id), [4]);
    assert.equal((await request('?estado=APROBADA&id=4')).data.paginacion.total, 0);
    assert.deepEqual((await request('?pagina=99999')).data.pedidos, []);
});
test('indicadores de toda la cola, independientes de filtros y con significado explícito', async () => {
    const filtered = await request('?estado=ENTREGADA&id=4');
    assert.deepEqual(filtered.data.resumen, { pendientes: 19, preparando: 15, listas: 15, entregadas: 15 });
    orders = []; const empty = await request();
    assert.deepEqual(empty.data.pedidos, []); assert.deepEqual(empty.data.resumen, { pendientes: 0, preparando: 0, listas: 0, entregadas: 0 });
});
test('detalle mínimo; no expone documentos, contactos, observaciones o pagos, y dirección solo domicilio', async () => {
    const list = (await request()).data.pedidos[0];
    assert.equal(list.usuario, undefined); assert.equal(list.direccion, undefined); assert.equal(list.pagos, undefined);
    const detail = (await request('/1')).data.pedido;
    assert.deepEqual(Object.keys(detail.usuario).sort(), ['apellido', 'nombre']);
    assert.equal(detail.direccion, undefined); assert.equal(detail.observaciones, undefined); assert.equal(detail.pagos, undefined);
    assert.equal(detail.detalles[0].cantidad, 2); assert.equal(detail.detalles[0].precio, undefined);
    assert.equal((await request('/2')).data.pedido.direccion, 'Dirección aislada de prueba');
    for (const id of [65, 999]) assert.equal((await request(`/${id}`)).status, 404);
});
test('rechaza parámetros manipulados sin consultas ni escrituras', async () => {
    for (const path of ['?pagina=0', '?pagina=100001', '?tamano=51', '?estado=CANCELADA', '?estado=APROBADA&estado=LISTA', '?id=1 OR 1=1', '?id=2147483648', '?usuario_id=30', '/0', '/abc', '/1?usuario_id=30']) assert.equal((await request(path)).status, 400, path);
    for (const body of [{}, { estadoActual: 'APROBADA', estado: 'ENTREGADA' }, { estadoActual: 'LISTA', estado: 'APROBADA' }, { estadoActual: 'APROBADA', estado: 'PREPARANDO', usuario_id: 30 }]) assert.equal((await request('/1/estado', { body })).status, 400);
    assert.equal(calls.length, 0); assert.equal(writes, 0);
});
test('servidor deriva transiciones desde estado persistido; avanzar es consecutivo y no reejecutable', async () => {
    assert.equal((await advance()).status, 200);
    assert.equal((await advance()).status, 409);
    assert.equal((await advance(1, 'PREPARANDO', 'LISTA')).status, 200);
    assert.equal((await advance(1, 'LISTA', 'ENTREGADA')).status, 200);
    assert.equal(orders[0].estado, 'ENTREGADA'); assert.equal(writes, 3);
    // The browser supplies a valid tuple which does not match the stored row.
    assert.equal((await advance(2, 'APROBADA', 'PREPARANDO')).status, 409);
    assert.equal(orders[1].estado, 'PREPARANDO');
});
test('bloqueo de pagos simulados, fórmulas requeridas/desconocidas y solicitudes vacías', async () => {
    const cases = [[61,'PAGO_REAL_NO_APROBADO'],[62,'VALIDACION_FARMACEUTICA_PENDIENTE'],[63,'REQUISITO_FORMULA_DESCONOCIDO'],[64,'SIN_MEDICAMENTOS']];
    for (const [id, reason] of cases) {
        const result = await request(`/${id}`); assert.equal(result.data.pedido.operacion.siguienteEstado, null); assert.ok(result.data.pedido.operacion.bloqueos.includes(reason));
        assert.equal((await advance(id)).status, 409); assert.equal(orders.find(row => row.id === id).estado, 'APROBADA');
    }
    assert.equal(writes, 0);
});
test('comprobación atómica impide avance si cambian estado, pago o requisito de fórmula después de leer', async () => {
    for (const change of [row => { row.estado = 'PREPARANDO'; }, row => { row.pagos[0].simulacion = true; }, row => { row.detalles[0].medicamento.requiere_formula = true; }, row => { row.detalles[0].medicamento.requiere_formula = null; }]) {
        orders[0] = order(1); race = rows => change(rows[0]);
        assert.equal((await advance()).status, 409);
        assert.notEqual(orders[0].estado, 'LISTA');
    }
});
test('fallos no filtran diagnósticos ni hacen pasar un error por listado vacío', async () => {
    failure = new Error('private connection secret');
    for (const path of ['', '/1']) { const result = await request(path); assert.equal(result.status, 500); assert.equal(JSON.stringify(result.data).includes('secret'), false); }
    assert.equal(writes, 0);
});
test('Notificaciones permanece desactivado y no necesita su tabla para operar', async () => {
    assert.equal(process.env.FARMACIA_NOTIFICACIONES_ENABLED, 'false');
    assert.equal((await advance()).status, 200);
    const response = await fetch(`${origin}/api/farmacia/notificaciones`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 503); assert.equal(db.notificacionFarmacia, undefined);
});

test('navegador: búsqueda, detalle, confirmación/cancelación, bloqueos, errores y responsive', { timeout: 60000 }, async t => {
    const fs = require('node:fs');
    if (!fs.existsSync(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')) { t.skip('Edge no disponible.'); return; }
    const browser = await require('./support/afiliados-edge.cjs').abrirEdge();
    const { evaluate, send, until } = browser;
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const search = async id => {
        await evaluate(`document.querySelector('#documentoSolicitudFarmacia').value=${JSON.stringify(String(id))};document.querySelector('#filtroPedidos').requestSubmit();`);
        await until(() => evaluate(`document.querySelectorAll('.farmacia-order').length===1 && document.querySelector('.farmacia-order h3')?.textContent.includes('#${id} ') && document.querySelector('#farmaciaOrders').getAttribute('aria-busy')==='false'`));
    };
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token())});sessionStorage.setItem('saludclick_user',JSON.stringify({id:30,rol:3,nombre:'Prueba aislada'}));` });
        await send('Page.navigate', { url: `${origin}/pages/farmacia-solicitudes.html` });
        await until(() => evaluate(`document.querySelectorAll('.farmacia-order').length===25`));
        await search(1);
        assert.equal(await evaluate(`document.querySelectorAll('#farmaciaOrders img').length`), 0);
        assert.equal(await evaluate(`document.querySelector('#farmaciaOrders').textContent.includes('Destinatario:')`), false);
        await click('[data-detail="1"]');
        await until(() => evaluate(`document.querySelector('#farmaciaSolicitudDetalleContent table')!==null`));
        assert.ok(await evaluate(`document.querySelector('#farmaciaSolicitudDetalleContent').textContent.includes('Paciente: <img src=x> Prueba')`));
        assert.ok(await evaluate(`document.querySelector('#farmaciaSolicitudDetalleContent').textContent.includes('Fórmula no disponible')`));
        assert.equal(await evaluate(`document.querySelectorAll('#farmaciaSolicitudDetalleContent img').length`), 0);
        await click('#farmaciaSolicitudCerrar');
        await click('.farmacia-order button');
        assert.equal(orders[0].estado, 'APROBADA'); assert.equal(writes, 0);
        await click('#farmaciaSolicitudCancelar'); assert.equal(writes, 0);
        await click('.farmacia-order button'); await click('#farmaciaSolicitudConfirmar');
        await until(() => orders[0].estado === 'PREPARANDO');
        await until(() => evaluate(`document.querySelector('.farmacia-order h3')?.textContent.includes('En preparación')`));
        await send('Page.reload');
        await until(() => evaluate(`document.querySelectorAll('.farmacia-order').length===25 && !document.querySelector('#documentoSolicitudFarmacia').value`));
        await search(62);
        assert.equal(await evaluate(`document.querySelector('.farmacia-order').textContent.includes('validación farmacéutica')`), false);
        await click('.farmacia-order-actions button');
        assert.ok(await evaluate(`document.querySelector('.farmacia-order').textContent.includes('validación farmacéutica')`));
        assert.equal(writes, 1);
        for (const width of [1440, 820, 390]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
            const sizes = await evaluate(`(()=>{const p=document.querySelector('#pedidosFarmacia'),r=p.getBoundingClientRect();return {right:r.right,width:innerWidth,scroll:p.scrollWidth,client:p.clientWidth};})()`);
            assert.ok(sizes.right <= sizes.width+1 && sizes.scroll <= sizes.client+1, JSON.stringify(sizes));
        }
        await evaluate(`document.querySelector('#documentoSolicitudFarmacia').value='999';document.querySelector('#filtroPedidos').requestSubmit();`);
        await until(() => evaluate(`document.querySelector('#farmaciaOrdersStatus').textContent==='No hay solicitudes para esta cédula.'`));
        assert.match(await evaluate(`document.querySelector('[data-order-count]').textContent`), /^\d+$/);
        failure = new Error('private test failure'); await click('#farmaciaOrdersRefresh');
        await until(() => evaluate(`document.querySelector('#farmaciaOrdersStatus').getAttribute('role')==='alert'`));
        assert.equal(await evaluate(`document.querySelector('[data-order-count]').textContent`), '—');
        assert.ok(await evaluate(`document.querySelector('#farmaciaOrdersSummaryStatus').textContent.includes('no disponibles')`));
        assert.equal(await evaluate(`document.querySelectorAll('.farmacia-order').length`), 0);
        assert.deepEqual(browser.errores, []);
    } finally { await browser.cerrar(); }
});
