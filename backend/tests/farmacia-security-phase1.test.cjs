require('./support/isolate-database.cjs');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { validarPerfilFarmacia } = require('../src/validators/farmacia-perfil.validator');

let staffAccount, account, failure, writes, lookups, profile, conversation, messages;
const users = new Map();
const db = {
    usuario: { findUnique: async ({ where }) => { lookups++; if (failure === 'auth') throw new Error('PRIVATE_DATABASE_SECRET'); return users.get(where.id); } },
    conversacion: {
        findMany: async () => [conversation],
        findUnique: async ({ where }) => where.id === 7 ? { ...conversation, cliente: { id: 20 }, agente: { id: conversation.agente_id }, mensajes: [] } : null
    },
    mensajeChat: {
        findMany: async () => messages,
        updateMany: async () => ({ count: 0 }),
        create: async ({ data }) => { const message = { id: messages.length + 1, ...data }; messages.push(message); return message; }
    }
};
db.conversacion.update = async () => conversation;
require.cache[require.resolve('../src/config/prisma')].exports = db;
require.cache[require.resolve('../src/config/database')].exports = {
    query: async (sql, args) => {
        if (failure === 'profile') throw new Error('PRIVATE_DATABASE_SECRET');
        if (sql.startsWith('UPDATE usuarios')) { writes++; profile = { ...profile, nombre: args[0], apellido: args[1] }; }
        if (failure === 'catalogo' && sql.includes('FROM medicamentos')) throw new Error('PRIVATE_CATALOGO_FAILURE');
        if (sql.includes('FROM medicamentos')) return { rows: [
            { estado: 'DISPONIBLE', stock: 3 }, { estado: 'DISPONIBLE', stock: 0 },
            { estado: 'DISPONIBLE', stock: -1 }, { estado: 'AGOTADO', stock: 5 }, { estado: 'INACTIVO', stock: 3 }
        ] };
        return { rows: [{ ...profile, estado: account.estado, rol_id: account.rol_id }] };
    }
};
const app = require('../src/app');
const { attachChatSocket } = require('../src/sockets/chat.socket');
const clients = new Set();
let server, io, origin;
const oldSecret = process.env.JWT_SECRET;
const secret = 'isolated-farmacia-phase1';
const token = (id = 30, rol = 3, expiresIn = '1h', extra = {}) => jwt.sign({ id, rol, ...extra }, secret, { expiresIn });
const body = () => ({ nombre: 'María José', apellido: "D'Ávila", telefono: '+57 3001234567', tipoDocumento: 'CC', numeroDocumento: 'DOC-123', ciudad: 'Bogotá' });
before(async () => {
    process.env.JWT_SECRET = secret;
    server = http.createServer(app); io = new Server(server);
    attachChatSocket(io);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(() => {
    account = { id: 30, rol_id: 3, estado: 'ACTIVO' }; users.clear(); users.set(30, account);
    failure = null; writes = 0; lookups = 0; profile = { id: 30, nombre: 'María', apellido: 'Prueba', correo: 'test@example.test' };
    staffAccount={id:40,rol_id:1,estado:'ACTIVO'};users.set(40,staffAccount);
    conversation = { id: 7, cliente_id: 20, agente_id: 40, estado: 'ABIERTA' }; messages = [];
});
after(async () => {
    clients.forEach(c => c.ws.close()); await new Promise(resolve => io.close(resolve));
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
});
async function request(path, { method = 'GET', data, auth = token() } = {}) {
    const headers = { 'Content-Type': 'application/json' }; if (auth) headers.Authorization = 'Bearer ' + auth;
    const response = await fetch(origin + '/api' + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, data: await response.json() };
}
const routes = [['/farmacia/verificar-acceso', 'GET'], ['/chat/conversaciones', 'GET'], ['/chat/conversaciones/7/mensajes', 'GET'], ['/auth/profile', 'GET'], ['/auth/profile', 'PUT']];
test('Farmacia: JWT ausente, inválido, vencido o sin expiración no accede', async () => {
    for (const auth of [null, 'invalid', token(30, 3, -1), jwt.sign({ id: 30, rol: 3 }, secret)]) {
        for (const [path, method] of routes) assert.equal((await request(path, { method, auth, data: method === 'PUT' ? body() : undefined })).status, 401);
    }
    assert.equal(writes, 0);
});
test('Farmacia: cuenta inactiva, bloqueada, desconocida, ausente o rol revocado falla cerrada', async () => {
    for (const change of [{ estado: 'INACTIVO' }, { estado: 'BLOQUEADO' }, { estado: null }, { rol_id: 1 }, { rol_id: 2 }, { rol_id: 4 }]) {
        Object.assign(account, { rol_id: 3, estado: 'ACTIVO' }, change);
        for (const [path, method] of routes) assert.equal((await request(path, { method, data: method === 'PUT' ? body() : undefined })).status, 403);
    }
    users.delete(30);
    for (const [path, method] of routes) assert.equal((await request(path, { method, data: method === 'PUT' ? body() : undefined })).status, 403);
    assert.equal(writes, 0);
});
test('Farmacia: roles contradictorios y errores del proveedor no filtran información', async () => {
    assert.equal((await request('/auth/profile', { auth: token(30, 3, '1h', { rol_id: 2 }) })).status, 401);
    failure = 'auth';
    for (const [path] of routes) { const r = await request(path); assert.equal(r.status, 503); assert.ok(!JSON.stringify(r.data).includes('PRIVATE')); }
});
test('Perfil Farmacia: guarda solo campos permitidos y sanitiza fallos de persistencia', async () => {
    assert.equal((await request('/auth/profile')).status, 200);
    assert.equal((await request('/auth/profile', { method: 'PUT', data: body() })).status, 200);
    assert.equal(writes, 1);
    for (const field of ['rol', 'rol_id', 'estado', 'password', 'correo', 'administrador_id']) {
        assert.equal((await request('/auth/profile', { method: 'PUT', data: { ...body(), [field]: 'changed' } })).status, 400);
    }
    assert.equal(writes, 1);
    failure = 'profile'; const r = await request('/auth/profile', { method: 'PUT', data: body() });
    assert.equal(r.status, 500); assert.ok(!JSON.stringify(r.data).includes('PRIVATE'));
});
test('Perfil Farmacia: valida tipos, caracteres, longitudes y formatos antes de escribir', async () => {
    for (const change of [{ nombre: '' }, { apellido: ' ' }, { nombre: 'X'.repeat(101) }, { apellido: 'X'.repeat(101) }, { nombre: '<script>' }, { apellido: 123 }, { telefono: 'abc' }, { telefono: '123' }, { telefono: '1'.repeat(21) }, { numeroDocumento: '<img>' }, { numeroDocumento: '1'.repeat(31) }, { tipoDocumento: 'X'.repeat(11) }, { ciudad: 'X'.repeat(101) }, { ciudad: 'a\u0000b' }, { cedula: 'OTHER' }]) {
        assert.equal((await request('/auth/profile', { method: 'PUT', data: { ...body(), ...change } })).status, 400, JSON.stringify(change));
    }
    assert.equal(writes, 0);
    assert.doesNotThrow(() => validarPerfilFarmacia({ nombre: 'X'.repeat(100), apellido: 'Y'.repeat(100), telefono: '', ciudad: '', numeroDocumento: '' }));
});
test('Contratos compartidos: Paciente valida teléfono y EPS conserva su perfil sin consulta Farmacia', async () => {
    for (const rol of [2, 4]) {
        const auth = token(rol, rol);
        assert.equal((await request('/auth/profile', { auth })).status, 200);
        const data = { nombre: 'Ana', apellido: 'Prueba', telefono: '300' };
        if (rol === 2) {
            assert.equal((await request('/auth/profile', { method: 'PUT', auth, data })).status, 400);
            data.telefono = '3001234567';
        }
        assert.equal((await request('/auth/profile', { method: 'PUT', auth, data })).status, 200);
    }
    assert.equal(lookups, 0); assert.equal(writes, 2);
});
test('Dashboard Farmacia: solo estado DISPONIBLE con stock positivo cuenta', async () => {
    const r = await request('/farmacia/dashboard'); assert.equal(r.status, 200);
    assert.deepEqual(r.data.estadisticas, { totalMedicamentos: 5, medicamentosDisponibles: 1 });
});

test('Dashboard Farmacia: rechaza rol cambiado, cuenta inactiva y dependencia de autorización no disponible', async () => {
    for (const change of [{ estado: 'INACTIVO' }, { estado: 'BLOQUEADO' }, { rol_id: 2 }]) {
        Object.assign(account, { rol_id: 3, estado: 'ACTIVO' }, change);
        assert.equal((await request('/farmacia/dashboard')).status, 403);
    }
    Object.assign(account, { rol_id: 3, estado: 'ACTIVO' });
    failure = 'auth';
    const result = await request('/farmacia/dashboard');
    assert.equal(result.status, 503);
    assert.equal(result.data.estadisticas, undefined);
    assert.ok(!JSON.stringify(result.data).includes('PRIVATE'));
});

test('Dashboard Farmacia: fallo de catálogo devuelve error sin estadísticas ficticias', async () => {
    failure = 'catalogo';
    const result = await request('/farmacia/dashboard');
    assert.equal(result.status, 500);
    assert.equal(result.data.estadisticas, undefined);
    assert.equal(result.data.medicamentos, undefined);
    assert.ok(!JSON.stringify(result.data).includes('PRIVATE'));
});
test('Chat HTTP: agente y cliente ajenos no pueden consultar la conversación asignada', async () => {
    users.set(31, { id: 31, rol_id: 3, estado: 'ACTIVO' });
    assert.equal((await request('/chat/conversaciones/7/mensajes', { auth: token(31) })).status, 403);
    assert.equal((await request('/chat/conversaciones/7/mensajes', { auth: token(21, 2) })).status, 404);
    assert.equal((await request('/chat/conversaciones/7/mensajes', { auth: token(20, 2) })).status, 200);
});

async function until(fn) {
    const end = Date.now() + 4000;
    while (Date.now() < end) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); }
    assert.fail('Socket event timeout');
}
async function connect(auth) {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket');
    const client = { ws, events: [], disconnected: false }; clients.add(client);
    let resolve, reject;
    const ready = new Promise((yes, no) => { resolve = yes; reject = no; });
    const timer = setTimeout(() => reject(new Error('Socket timeout')), 4000);
    ws.addEventListener('message', ({ data }) => {
        const packet = String(data);
        if (packet.startsWith('0')) ws.send('40' + JSON.stringify({ token: auth }));
        else if (packet === '2') ws.send('3');
        else if (packet.startsWith('40')) { clearTimeout(timer); resolve(); }
        else if (packet.startsWith('44')) { clearTimeout(timer); reject(new Error('Denied')); }
        else if (packet.startsWith('42')) client.events.push(JSON.parse(packet.slice(2)));
        else if (packet.startsWith('41')) client.disconnected = true;
    });
    ws.addEventListener('close', () => { client.disconnected = true; });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Transport')); });
    try { await ready; } catch (error) { ws.close(); throw error; }
    return client;
}
function socketFor(id) { return [...io.sockets.sockets.values()].find(s => s.data.usuario.id === id); }
test('Socket.IO real: handshake Administrador rechaza inactividad, revocación, expiración y falta de exp', async () => {
    for (const change of [{ estado: 'INACTIVO' }, { estado: 'BLOQUEADO' }, { estado: null }, { rol_id: 2 }]) {
        Object.assign(staffAccount, { rol_id: 1, estado: 'ACTIVO' }, change); await assert.rejects(connect(token(40,1)), /Denied/);
    }
    Object.assign(staffAccount, { rol_id: 1, estado: 'ACTIVO' });
    await assert.rejects(connect(token(40, 1, -1)), /Denied/);
    await assert.rejects(connect(jwt.sign({ id: 40, rol: 1 }, secret)), /Denied/);
});
test('Socket.IO real: token de Administrador vence y desconecta sin alterar sesión Paciente', async () => {
    const staff = await connect(token(40, 1, 1)), patient = await connect(token(20, 2));
    await until(() => staff.disconnected); assert.equal(patient.disconnected, false); patient.ws.close();
});
test('Socket.IO real: revalida receptor pasivo antes de entregar mensajes del paciente', async () => {
    const staff = await connect(token(40,1)), patient = await connect(token(20, 2));
    await socketFor(40).join('chat:7'); await socketFor(20).join('chat:7');
    staffAccount.estado = 'INACTIVO';
    patient.ws.send('42' + JSON.stringify(['chat:send', { conversationId: 7, contenido: 'Mensaje privado' }]));
    await until(() => staff.disconnected && patient.events.some(e => e[0] === 'chat:message'));
    assert.equal(staff.events.some(e => e[0] === 'chat:message'), false); assert.equal(messages.length, 1); patient.ws.close();
});
test('Socket.IO real: rol revocado no puede enviar ni marcar lectura', async () => {
    const staff = await connect(token(40,1)); staffAccount.rol_id = 4;
    staff.ws.send('42' + JSON.stringify(['chat:send', { conversationId: 7, contenido: 'No permitido' }]));
    await until(() => staff.disconnected); assert.equal(messages.length, 0);
});
test('Socket.IO real: agente ajeno no recibe una sala y participantes autorizados siguen conversando', async () => {
    users.set(31, { id: 31, rol_id: 1, estado: 'ACTIVO' });
    const staff = await connect(token(40,1)), other = await connect(token(31,1)), patient = await connect(token(20, 2));
    other.ws.send('42' + JSON.stringify(['chat:join', 7]));
    await socketFor(40).join('chat:7'); await socketFor(20).join('chat:7');
    // Even a stale server-side room membership cannot authorize another agent.
    await socketFor(31).join('chat:7');
    patient.ws.send('42' + JSON.stringify(['chat:send', { conversationId: 7, contenido: 'Autorizado' }]));
    await until(() => staff.events.some(e => e[0] === 'chat:message') && patient.events.some(e => e[0] === 'chat:message'));
    assert.equal(other.events.some(e => e[0] === 'chat:message'), false);
    assert.equal(socketFor(31).rooms.has('chat:7'), false);
    for (const c of [staff, other, patient]) c.ws.close();
});
