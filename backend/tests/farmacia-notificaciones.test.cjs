require('./support/isolate-database.cjs');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

// All fixtures are in memory. This suite never loads .env or connects to Neon.
let rows, orders, nextId, failure, eventFailure, calls;
const users = [{ id: 30, rol_id: 3, estado: 'ACTIVO' }, { id: 31, rol_id: 3, estado: 'ACTIVO' }, { id: 32, rol_id: 3, estado: 'INACTIVO' }];
function matches(row, where) {
    return Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'not' in value ? row[key] !== value.not : row[key] === value);
}
const model = {
    async findMany({ where, skip = 0, take, select }) {
        calls++;
        if (failure) throw failure;
        return rows.filter(row => matches(row, where)).sort((a, b) => b.created_at - a.created_at || b.id - a.id).slice(skip, take === undefined ? undefined : skip + take).map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]])));
    },
    async count({ where }) { if (failure) throw failure; return rows.filter(row => matches(row, where)).length; },
    async updateMany({ where, data }) {
        if (failure) throw failure;
        const found = rows.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data));
        return { count: found.length };
    },
    async findFirst({ where, select }) { return (await model.findMany({ where, select, take: 1 }))[0] || null; },
    async createMany({ data, skipDuplicates }) {
        if (eventFailure) throw new Error('private database detail');
        let count = 0;
        for (const input of data) {
            const duplicate = rows.some(row => row.destinatario_id === input.destinatario_id && row.referencia_evento === input.referencia_evento);
            if (duplicate && skipDuplicates) continue;
            if (duplicate) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
            rows.push({ id: nextId++, created_at: new Date(), leida_at: null, ...input }); count++;
        }
        return { count };
    }
};
const db = {
    notificacionFarmacia: model,
    usuario: {
        async findUnique({ where }) { if (failure?.code === 'AUTH_FAILURE') throw failure; return users.find(user => user.id === where.id) || null; },
        async findMany({ where }) { return users.filter(user => matches(user, where)).map(({ id }) => ({ id })); }
    },
    solicitud: {
        async updateMany({ where, data }) {
            const order = orders.find(order => order.id === where.id && order.estado === where.estado && order.pagos.some(payment => matches(payment, where.pagos.some)) && order.detalles.length && order.detalles.every(item => item.medicamento.requiere_formula === false));
            if (!order) return { count: 0 }; Object.assign(order, data); return { count: 1 };
        }
    },
    async $transaction(operation) {
        const snapshot = structuredClone({ rows, orders, nextId });
        try { return await operation(db); }
        catch (error) { ({ rows, orders, nextId } = snapshot); throw error; }
    }
};
require.cache[require.resolve('../src/config/prisma')].exports = db;
require.cache[require.resolve('../src/config/database')].exports = { query: async () => ({ rows: [] }) };
db.solicitud.findMany = async () => [];
db.solicitud.count = async () => 0;
db.solicitud.groupBy = async () => [];
db.solicitud.findFirst = async ({ where }) => structuredClone(orders.find(order => order.id === where.id && where.estado.in.includes(order.estado)) || null);
db.medicamento = { findMany: async () => [], count: async () => 0 };
// Only this ephemeral test origin is allowed. Production CORS is unchanged.
const allowedOrigins = new Set();
require('../src/config/cors').getAllowedOrigins = () => allowedOrigins;
const app = require('../src/app');
const pharmacy = require('../src/services/farmacia.service');
const repository = require('../src/repositories/farmacia-notificaciones.repository');
let server, base, io;
const oldSecret = process.env.JWT_SECRET, oldEnabled = process.env.FARMACIA_NOTIFICACIONES_ENABLED;
before(async () => {
    process.env.JWT_SECRET = 'isolated-pharmacy-notifications-only';
    process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'true';
    server = http.createServer(app);
    io = new (require('socket.io').Server)(server);
    require('../src/sockets/farmacia-notificaciones.socket').attachFarmaciaNotifications(io, app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/api/farmacia/notificaciones`;
    allowedOrigins.add(base.replace('/api/farmacia/notificaciones', ''));
});
after(async () => {
    await new Promise(resolve => io.close(resolve));
    for (const [key, value] of [['JWT_SECRET', oldSecret], ['FARMACIA_NOTIFICACIONES_ENABLED', oldEnabled]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});
beforeEach(() => {
    rows = Array.from({ length: 45 }, (_, index) => ({ id: index + 1, destinatario_id: index === 44 ? 31 : 30, tipo: 'SOLICITUD_ESTADO', titulo: 'Aviso de prueba aislada', mensaje: 'Contenido exclusivo de pruebas', referencia_evento: `test:${index}`, created_at: new Date('2026-11-14T10:00:00Z'), leida_at: index === 0 ? new Date('2026-11-14T11:00:00Z') : null }));
    orders = [{ id: 90, estado: 'APROBADA', pagos: [{ estado: 'APROBADO', simulacion: false }] }, { id: 91, estado: 'APROBADA', pagos: [{ estado: 'APROBADO', simulacion: true }] }];
    orders.forEach(order => { order.detalles = [{ cantidad: 1, medicamento: { id: 1, nombre: 'Prueba aislada', requiere_formula: false } }]; });
    nextId = 46; failure = null; eventFailure = false; calls = 0;
});
async function request(path = '', { role = 3, id = 30, method = 'GET', body, token } = {}) {
    const headers = {};
    if (role !== null) headers.Authorization = `Bearer ${token || jwt.sign({ id, rol: role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
}

test('JWT y rol vigente: las cuatro operaciones rechazan otros roles sin consultar notificaciones', async () => {
    for (const [path, method] of [['', 'GET'], ['/no-leidas/count', 'GET'], ['/1/leida', 'PATCH'], ['/leer-todas', 'PATCH']]) {
        for (const role of [null, 1, 2, 4, 99]) assert.equal((await request(path, { role, method })).status, role === null ? 401 : 403);
    }
    assert.equal(calls, 0);
    assert.equal((await request('', { id: 32 })).status, 403);
    assert.equal((await request('', { id: 999 })).status, 403);
    assert.equal((await request('', { token: jwt.sign({ id: 30, rol: 3 }, process.env.JWT_SECRET) })).status, 401);
    assert.equal((await request('', { token: 'invalid' })).status, 401);
    assert.equal((await request('', { token: jwt.sign({ id: 30, rol: 3 }, process.env.JWT_SECRET, { expiresIn: -1 }) })).status, 401);
});

test('listado paginado estable, campos limitados y contador del destinatario', async () => {
    const first = await request();
    assert.equal(first.status, 200); assert.equal(first.cache, 'no-store');
    assert.deepEqual(first.data.paginacion, { pagina: 1, tamano: 20, total: 44, paginas: 3 });
    assert.equal(first.data.noLeidas, 43); assert.equal(first.data.notificaciones[0].id, 44);
    assert.deepEqual(Object.keys(first.data.notificaciones[0]).sort(), ['id', 'tipo', 'titulo', 'mensaje', 'created_at', 'leida_at'].sort());
    const second = await request('?pagina=2&tamano=20');
    assert.equal(second.data.notificaciones.length, 20);
    assert.equal(first.data.notificaciones.some(a => second.data.notificaciones.some(b => a.id === b.id)), false);
    assert.equal((await request('/no-leidas/count')).data.noLeidas, 43);
    assert.equal((await request('', { id: 31 })).data.notificaciones.length, 1);
});

test('filtros de lectura y páginas vacías reflejan registros persistidos', async () => {
    assert.equal((await request('?estado=leidas')).data.notificaciones.length, 1);
    assert.equal((await request('?estado=no-leidas')).data.paginacion.total, 43);
    assert.deepEqual((await request('?pagina=99')).data.notificaciones, []);
    rows = []; const empty = await request();
    assert.equal(empty.data.noLeidas, 0); assert.equal(empty.data.paginacion.total, 0);
});

test('rechaza destinatarios inyectados, límites y parámetros malformados antes de consultar', async () => {
    for (const query of ['?destinatario_id=31', '?pagina=0', '?pagina=100001', '?tamano=51', '?tamano=-1', '?estado=otro', '?estado=todas&estado=leidas', '?pagina=1&pagina=2']) assert.equal((await request(query)).status, 400, query);
    for (const id of ['0', '-1', '1.5', '2147483648', 'abc']) assert.equal((await request(`/${id}/leida`, { method: 'PATCH' })).status, 400);
    assert.equal((await request('/2/leida', { method: 'PATCH', body: { destinatario_id: 31 } })).status, 400);
    assert.equal((await request('/leer-todas?destinatario_id=31', { method: 'PATCH' })).status, 400);
    assert.equal((await request('/no-leidas/count?estado=todas')).status, 400);
    assert.equal(calls, 0);
});

test('marcar una es idempotente y sobrevive a otra consulta y otra instancia de servicio', async () => {
    const read = await request('/2/leida', { method: 'PATCH', body: {} });
    assert.equal(read.status, 200); const at = read.data.notificacion.leida_at;
    assert.ok(at); assert.equal((await request('/2/leida', { method: 'PATCH' })).data.notificacion.leida_at, at);
    assert.equal((await request('/no-leidas/count')).data.noLeidas, 42);
    const fresh = require('../src/services/farmacia-notificaciones.service').createService(repository.createRepository(db), () => true);
    assert.equal((await fresh.listar({ id: 30 }, { estado: 'leidas' })).paginacion.total, 2);
});

test('no permite leer una notificación ajena; leer todas no afecta a otro destinatario', async () => {
    assert.equal((await request('/45/leida', { method: 'PATCH' })).status, 404);
    assert.equal(rows[44].leida_at, null);
    assert.equal((await request('/leer-todas', { method: 'PATCH' })).data.actualizadas, 43);
    assert.equal((await request('/leer-todas', { method: 'PATCH' })).data.actualizadas, 0);
    assert.equal((await request('/no-leidas/count')).data.noLeidas, 0);
    assert.equal((await request('/no-leidas/count', { id: 31 })).data.noLeidas, 1);
});

test('configuración desactivada y esquema ausente no se presentan como lista vacía', async () => {
    process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'false';
    try {
        for (const [path, method] of [['', 'GET'], ['/no-leidas/count', 'GET'], ['/2/leida', 'PATCH'], ['/leer-todas', 'PATCH']]) assert.equal((await request(path, { method })).status, 503);
        assert.equal(calls, 0);
    } finally { process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'true'; }
    failure = Object.assign(new Error('private schema diagnostic'), { code: 'P2021' });
    const missing = await request(); assert.equal(missing.status, 503); assert.equal(JSON.stringify(missing.data).includes('diagnostic'), false);
});

test('errores de infraestructura se sanitizan, incluidas escrituras y autorización', async () => {
    failure = new Error('secret connection details');
    for (const [path, method] of [['', 'GET'], ['/no-leidas/count', 'GET'], ['/2/leida', 'PATCH'], ['/leer-todas', 'PATCH']]) {
        const result = await request(path, { method }); assert.equal(result.status, 500); assert.equal(JSON.stringify(result.data).includes('secret'), false);
    }
    failure.code = 'AUTH_FAILURE'; assert.equal((await request()).status, 503);
});

test('cambio autorizado persiste avisos para farmacias activas antes de emitir; duplicados no se insertan', async () => {
    let emitted = 0;
    const result = await pharmacy.avanzarPedido('90', { estadoActual: 'APROBADA', estado: 'PREPARANDO' }, async ids => {
        emitted++; assert.deepEqual(ids, [30, 31]);
        assert.equal(orders[0].estado, 'PREPARANDO');
        assert.equal(rows.filter(row => row.referencia_evento === 'solicitud:90:estado:PREPARANDO').length, 2);
    });
    assert.equal(result.estado, 'PREPARANDO'); assert.equal(emitted, 1);
    await repository.registrarCambio(db, 90, 'PREPARANDO');
    assert.equal(rows.filter(row => row.referencia_evento === 'solicitud:90:estado:PREPARANDO').length, 2);
    await assert.rejects(pharmacy.avanzarPedido('90', { estadoActual: 'APROBADA', estado: 'PREPARANDO' }), { status: 409 });
    assert.equal(rows.some(row => row.destinatario_id === 32), false);
});

test('pagos simulados no autorizan cambios ni crean notificaciones', async () => {
    const count = rows.length;
    await assert.rejects(pharmacy.avanzarPedido('91', { estadoActual: 'APROBADA', estado: 'PREPARANDO' }), { status: 409 });
    assert.equal(orders[1].estado, 'APROBADA'); assert.equal(rows.length, count);
});

test('HTTP de avance rechaza cuentas inactivas y revalida el rol actual sin alterar el pedido', async () => {
    const origin = base.replace('/notificaciones', '');
    const advance = id => fetch(`${origin}/pedidos/90/estado`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id, rol: 3 }, process.env.JWT_SECRET, { expiresIn: '1h' })}` },
        body: JSON.stringify({ estadoActual: 'APROBADA', estado: 'PREPARANDO' })
    });
    assert.equal((await advance(32)).status, 403);
    users[1].rol_id = 2;
    try { assert.equal((await advance(31)).status, 403); }
    finally { users[1].rol_id = 3; }
    assert.equal(orders[0].estado, 'APROBADA'); assert.equal(rows.length, 45);
});

test('fallo al persistir el aviso revierte el estado y no emite; fallo de transporte no revierte commit', async () => {
    eventFailure = true; let emitted = 0;
    await assert.rejects(pharmacy.avanzarPedido('90', { estadoActual: 'APROBADA', estado: 'PREPARANDO' }, () => emitted++));
    assert.equal(orders[0].estado, 'APROBADA'); assert.equal(emitted, 0); assert.equal(rows.length, 45);
    eventFailure = false;
    await pharmacy.avanzarPedido('90', { estadoActual: 'APROBADA', estado: 'PREPARANDO' }, () => { throw new Error('transport down'); });
    assert.equal(orders[0].estado, 'PREPARANDO'); assert.equal(rows.length, 47);
});

test('desactivado conserva la operación con pago real sin tocar la tabla nueva', async () => {
    process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'false'; eventFailure = true;
    try {
        await pharmacy.avanzarPedido('90', { estadoActual: 'APROBADA', estado: 'PREPARANDO' });
        assert.equal(orders[0].estado, 'PREPARANDO'); assert.equal(rows.length, 45);
    } finally { process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'true'; }
});

test('navegador: filtros, lectura persistida al recargar, eventos reales y responsive', { timeout: 60000 }, async t => {
    const fs = require('node:fs');
    const path = require('node:path');
    const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (!fs.existsSync(edge)) { t.skip('Edge no disponible.'); return; }
    assert.ok(fs.existsSync(path.resolve(__dirname, '../../frontend/dist/pages/farmacia.html')), 'Ejecuta primero npm run build en frontend.');
    const { abrirEdge } = require('./support/afiliados-edge.cjs');
    const browser = await abrirEdge();
    const { evaluate, send, until } = browser;
    const origin = base.replace('/api/farmacia/notificaciones', '');
    const token = jwt.sign({ id: 30, rol: 3 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const seed = `window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token)});sessionStorage.setItem('saludclick_user',JSON.stringify({id:30,rol:3,nombre:'Prueba aislada'}));`;
    const click = async selector => {
        await until(() => evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(selector)});if(!button||button.disabled)return false;button.click();return true;})()`));
    };
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: seed });
        await send('Page.navigate', { url: `${origin}/pages/farmacia.html` });
        try { await until(() => evaluate(`document.querySelector('#farmaciaNotificationsBadge')?.textContent === '43'`)); }
        catch (error) {
            const diagnostics = await evaluate(`({path:location.pathname,ready:document.readyState,mainHidden:document.querySelector('#farmaciaMain')?.hidden,status:document.querySelector('#farmaciaNotificationsStatus')?.textContent,badge:document.querySelector('#farmaciaNotificationsBadge')?.textContent,resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,status:r.responseStatus}))})`);
            throw new Error(`${error.message} ${JSON.stringify({ diagnostics, calls, errors: browser.errores })}`);
        }
        assert.equal(await evaluate(`document.querySelectorAll('#farmaciaNotificationsList > li').length`), 20);
        assert.equal(await evaluate(`document.querySelector('#farmaciaNotificationsBell').getAttribute('aria-label')`), 'Notificaciones de farmacia: 43 no leídas.');
        await click('#farmaciaNotificationsNext');
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsPage').textContent.includes('Página 2')`));
        await click('#farmaciaNotificationsPrevious');
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsPage').textContent.includes('Página 1')`));
        await click('#farmaciaNotificationsList button');
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsBadge').textContent === '42'`));
        await send('Page.reload');
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsBadge')?.textContent === '42'`));
        assert.equal(await evaluate(`document.querySelector('#farmaciaNotificationsList > li').dataset.unread`), 'false');
        await evaluate(`document.querySelector('#farmaciaNotificationsState').value='leidas';document.querySelector('#farmaciaNotificationsState').dispatchEvent(new Event('change'));`);
        await until(() => evaluate(`document.querySelectorAll('#farmaciaNotificationsList > li').length === 2`));
        await evaluate(`document.querySelector('#farmaciaNotificationsState').value='todas';document.querySelector('#farmaciaNotificationsState').dispatchEvent(new Event('change'));`);
        await until(() => io.of('/farmacia-notificaciones').sockets.size > 0);
        const before = rows.length;
        await pharmacy.avanzarPedido('90', { estadoActual: 'APROBADA', estado: 'PREPARANDO' }, app.get('farmaciaNotificationEvents'));
        assert.equal(rows.length, before + 2);
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsBadge').textContent === '43'`));
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsList').textContent.includes('Solicitud actualizada')`));
        for (const width of [1440, 820, 390]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
            const geometry = await evaluate(`(()=>{const panel=document.querySelector('#notificacionesFarmacia'),r=panel.getBoundingClientRect();return {viewport:innerWidth,right:r.right,left:r.left,scroll:panel.scrollWidth,client:panel.clientWidth};})()`);
            assert.ok(geometry.right <= geometry.viewport + 1 && geometry.left >= 0, JSON.stringify(geometry));
            assert.ok(geometry.scroll <= geometry.client + 1, JSON.stringify(geometry));
        }
        await click('#farmaciaReadAll');
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsBadge').textContent === '0'`));
        assert.equal(rows.filter(row => row.destinatario_id === 31 && !row.leida_at).length, 2);
        await evaluate(`document.querySelector('#farmaciaNotificationsState').value='no-leidas';document.querySelector('#farmaciaNotificationsState').dispatchEvent(new Event('change'));`);
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsStatus').textContent === 'No tienes notificaciones sin leer.'`));
        process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'false';
        await click('#farmaciaNotificationsRefresh');
        await until(() => evaluate(`document.querySelector('#farmaciaNotificationsStatus').getAttribute('role') === 'alert'`));
        assert.equal(await evaluate(`document.querySelector('#farmaciaNotificationsBadge').textContent`), '—');
        assert.equal(await evaluate(`document.querySelector('#farmaciaReadAll').disabled`), true);
        assert.deepEqual(browser.errores, []);
    } finally {
        process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'true';
        await browser.cerrar();
    }
});
