require('./support/isolate-database.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService, registrar, validar } = require('../src/services/farmacia-entregas.service');
const command = (patch = {}) => ({ pedidoId: 10, version: 1, estadoActual: 'LISTA', estado: 'ENTREGADA',
    clave: '9dd84487-0616-4ca0-a630-204894e810ce', recepcion: 'Recepción declarada de prueba', ...patch });
function fixture() {
    let state = { cuenta: { id: 4, rol_id: 3, estado: 'ACTIVO' }, owner: 4, permiso: true,
        pedido: { estado: 'LISTA', version: 1, pagos: [{ estado: 'APROBADO', simulacion: false }],
            detalles: [{ medicamento: { requiere_formula: false } }] }, eventos: [] };
    let pending = Promise.resolve(), auditFailure = false, conflict = false;
    const service = createService({ async transaction(operation) {
        const before = pending; let release; pending = new Promise(r => { release = r; }); await before;
        const draft = structuredClone(state);
        try {
            const result = await operation({
                async autorizarYBloquear(actor, pedido) { return { cuenta: draft.cuenta,
                    titularidadVerificada: draft.owner === actor && pedido === 10,
                    estadosPermitidos: draft.permiso ? ['ENTREGADA'] : [] }; },
                async buscarClave(clave) { return draft.eventos.find(e => e.clave === clave); },
                async bloquearPedido() { return draft.pedido; },
                async actualizarEstado(id, version, actual, next) {
                    if (conflict || draft.pedido.version !== version || draft.pedido.estado !== actual) return 0;
                    draft.pedido.estado = next; draft.pedido.version++; return 1;
                },
                async registrarEvento(evento) { if (auditFailure) throw Error('Auditoría fallida'); draft.eventos.push(evento); return evento; }
            });
            state = draft; return result;
        } finally { release(); }
    } });
    return { service, state: () => structuredClone(state), change: fn => fn(state),
        failAudit: () => { auditFailure = true; }, conflict: () => { conflict = true; } };
}
test('producción: rutas reales cierran cola global para ambas farmacias sin consultar pedidos ni inventario', async () => {
    const id = require.resolve('../src/config/prisma');
    const old = require.cache[id].exports;
    require.cache[id].exports = { usuario: { findUnique: async ({ where }) => ({ id: where.id, rol_id: where.id === 7 ? 2 : 3, estado: where.id === 6 ? 'INACTIVO' : where.id === 8 ? 'BLOQUEADO' : 'ACTIVO' }) } };
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = 'entregas-isolated-secret';
    const app = require('../src/app'); const server = require('node:http').createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        for (const rol of [null,1,2,4,3]) {
            const token = rol === null ? null : require('jsonwebtoken').sign({ id: 4, rol }, process.env.JWT_SECRET, { expiresIn: rol === 3 ? -1 : '1h' });
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/farmacia/pedidos/10`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            assert.equal(response.status, rol === null || rol === 3 ? 401 : 403);
        }
        for (const account of [4,5,6,7,8]) for (const [path, method] of [['?estado=LISTA&pagina=2&id=10','GET'], ['/10','GET'], ['/10/estado','PATCH'], ['/10/formulas/1','GET'], ['/10/formulas/1?descarga=1','GET']]) {
            const token = require('jsonwebtoken').sign({ id: account, rol: 3 }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/farmacia/pedidos${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(method === 'PATCH' ? { body: JSON.stringify(command()) } : {}) });
            assert.equal(response.status, account >= 6 ? 403 : 503);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            const body = await response.json(); assert.equal(body.pedidos, undefined); assert.equal(body.pedido, undefined);
            if (account < 6) assert.equal(body.codigo, 'FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE');
        }
    } finally { await new Promise(r => server.close(r)); require.cache[id].exports = old; if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
});
test('sin adaptador no hay escritura real', async () => {
    await assert.rejects(registrar(4, command()), { status: 503 });
});
test('transiciones, evidencia y campos de servidor se validan sin inventarlos', () => {
    for (const patch of [{ estadoActual: 'APROBADA' }, { estado: 'CANCELADA' }, { version: 0 }, { clave: 'x' },
        { recepcion: '' }, { recepcion: 'x\n' }, { observaciones: 'x'.repeat(501) }, { actorId: 7 }, { fecha: '2026-11-16' }, { firma: 'x' }]) assert.throws(() => validar(command(patch)), { status: 400 });
});
test('cuenta, titularidad y permisos se comprueban dentro de transacción', async () => {
    for (const change of [s => { s.owner = 5; }, s => { s.cuenta.estado = 'INACTIVO'; }, s => { s.cuenta.rol_id = 2; }, s => { s.cuenta.id = 5; }, s => { s.permiso = false; }]) {
        const f = fixture(); f.change(change); const before = f.state();
        await assert.rejects(f.service.registrar(4, command()), { status: 403 }); assert.deepEqual(f.state(), before);
    }
});
test('pago simulado, pendiente, fórmula requerida o desconocida bloquean entrega', async () => {
    for (const change of [s => { s.pedido.pagos[0].simulacion = true; }, s => { s.pedido.pagos = []; },
        s => { s.pedido.pagos[0].estado = 'PENDIENTE'; }, s => { s.pedido.detalles = []; },
        s => { s.pedido.detalles[0].medicamento.requiere_formula = true; }, s => { s.pedido.detalles[0].medicamento.requiere_formula = null; }]) {
        const f = fixture(); f.change(change); const before = f.state();
        await assert.rejects(f.service.registrar(4, command()), { status: 409 }); assert.deepEqual(f.state(), before);
    }
});
test('reintentos concurrentes idénticos generan un evento; misma clave con otro contenido produce conflicto', async () => {
    const f = fixture(); const results = await Promise.all([f.service.registrar(4, command()), f.service.registrar(4, command())]);
    assert.deepEqual(results.map(r => r.repetido), [false, true]); assert.equal(f.state().eventos.length, 1);
    const evento = results[0].evento; assert.equal(evento.actorId, 4); assert.ok(evento.fecha instanceof Date);
    assert.equal(evento.recepcion, command().recepcion); assert.equal(f.state().pedido.estado, 'ENTREGADA');
    await assert.rejects(f.service.registrar(4, command({ observaciones: 'Cambio' })), { status: 409 });
    f.change(s => { s.owner = 5; }); await assert.rejects(f.service.registrar(4, command()), { status: 403 });
});
test('versiones concurrentes, compare-and-swap y fallo de auditoría no dejan cambios parciales', async () => {
    const f = fixture();
    const results = await Promise.allSettled([f.service.registrar(4, command()), f.service.registrar(4, command({ clave: '8dd84487-0616-4ca0-a630-204894e810ce' }))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.state().eventos.length, 1);
    for (const fault of ['failAudit','conflict']) {
        const g = fixture(), before = g.state(); g[fault](); await assert.rejects(g.service.registrar(4, command())); assert.deepEqual(g.state(), before);
    }
    // El contrato del adaptador no ofrece ninguna operación de stock.
});
