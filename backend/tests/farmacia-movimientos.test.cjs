const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService, registrar } = require('../src/services/farmacia-movimientos.service');
const { movimiento } = require('../src/validators/farmacia-movimientos.validator');
const command = (overrides = {}) => ({ inventarioId: 10, medicamentoId: 20, tipo: 'ENTRADA', cantidad: 3,
    motivo: 'Recepción documental de prueba', clave: '9dd84487-0616-4ca0-a630-204894e810ce', ...overrides });

// Adaptador exclusivamente de prueba: mutex, snapshot y commit/rollback en memoria.
// No importa app, configuración, conexiones PostgreSQL ni archivos .env.
function fixture() {
    let state = { saldos: { 20: { stock: 5, version: 1 }, 21: { stock: 9, version: 1 } }, movimientos: [],
        cuenta: { id: 4, rol_id: 3, estado: 'ACTIVO' }, propietario: 4, tipos: ['ENTRADA', 'SALIDA', 'AJUSTE'] };
    let pending = Promise.resolve(), auditFailure = false, conflict = false;
    const repository = { async transaction(operation) {
        const before = pending; let release; pending = new Promise(resolve => { release = resolve; });
        await before;
        const working = structuredClone(state); let inventoryLocked = false;
        try {
            const result = await operation({
                async autorizar(actor, inventory) { return { cuenta: working.cuenta,
                    titularidadVerificada: working.propietario === actor && inventory === 10,
                    tiposPermitidos: working.tipos }; },
                async bloquearInventario(inventory) { assert.equal(inventory, 10); inventoryLocked = true; },
                async bloquearSaldo(inventory, medication) { assert.ok(inventoryLocked); return working.saldos[medication]; },
                async buscarClave(inventory, key) { assert.ok(inventoryLocked); return working.movimientos.find(m => m.clave === key); },
                async actualizarSaldo(inventory, medication, version, stock) {
                    if (conflict || working.saldos[medication].version !== version) return 0;
                    working.saldos[medication] = { stock, version: version + 1 }; return 1;
                },
                async registrarAuditoria(entry) {
                    if (auditFailure) throw new Error('Fallo de auditoría aislado');
                    assert.equal(working.movimientos.some(m => m.clave === entry.clave), false);
                    const row = { id: working.movimientos.length + 1, ...entry }; working.movimientos.push(row); return row;
                }
            });
            state = working; return result;
        } finally { release(); }
    } };
    return { service: createService(repository), state: () => structuredClone(state),
        change: callback => callback(state), failAudit: () => { auditFailure = true; },
        conflict: () => { conflict = true; } };
}

test('sin adaptador persistente no hay movimientos reales ni acceso a conexiones', async () => {
    await assert.rejects(registrar(4, command()), { status: 503, codigo: 'INVENTARIO_ESTRUCTURA_PENDIENTE' });
});
test('valida tipos, cantidades, motivo, UUID y rechaza actor, fecha, lotes o campos ajenos', () => {
    for (const patch of [{ cantidad: 0 }, { cantidad: -1 }, { cantidad: 1.2 }, { cantidad: '3' },
        { cantidad: 2147483648 }, { inventarioId: 0 }, { medicamentoId: [] }, { tipo: 'ENTREGA' },
        { motivo: '   ' }, { motivo: 'texto\u0000' }, { motivo: 'x'.repeat(501) }, { clave: 'duplicado' },
        { actorId: 1 }, { fecha: '2026-01-01' }, { lote: 'inventado' }, { direccion: 'AUMENTAR' },
        { tipo: 'AJUSTE' }, { tipo: 'AJUSTE', direccion: 'otro' }]) {
        assert.throws(() => movimiento(command(patch)), { status: 400 });
    }
    for (const value of [null, [], 'entrada']) assert.throws(() => movimiento(value), { status: 400 });
});
test('titularidad, cuenta vigente, rol y permiso por operación se revalidan antes del saldo', async () => {
    for (const mutate of [s => { s.propietario = 5; }, s => { s.cuenta.estado = 'INACTIVO'; },
        s => { s.cuenta.rol_id = 1; }, s => { s.cuenta.id = 5; }, s => { s.tipos = ['ENTRADA']; }]) {
        const f = fixture(); f.change(mutate); const before = f.state();
        await assert.rejects(f.service.registrar(4, command({ tipo: 'SALIDA' })), { status: 403 });
        assert.deepEqual(f.state(), before);
    }
    const f = fixture();
    await assert.rejects(f.service.registrar(4, command({ inventarioId: 11 })), { status: 403 });
    await assert.rejects(f.service.registrar(4, command({ medicamentoId: 99 })), { status: 404 });
    await assert.rejects(f.service.registrar('4', command()), { status: 403 });
});
test('entrada, salida y ajustes registran responsable del servidor, fecha, motivo y saldos', async () => {
    for (const [patch, expected] of [[{}, 8], [{ tipo: 'SALIDA' }, 2],
        [{ tipo: 'AJUSTE', direccion: 'AUMENTAR' }, 8], [{ tipo: 'AJUSTE', direccion: 'DISMINUIR' }, 2]]) {
        const f = fixture(), start = Date.now();
        const result = await f.service.registrar(4, command(patch)), row = result.movimiento;
        assert.equal(row.actorId, 4); assert.equal(row.saldoAnterior, 5); assert.equal(row.saldoFinal, expected);
        assert.equal(row.motivo, command().motivo); assert.equal(row.tipo, patch.tipo || 'ENTRADA');
        assert.ok(row.fecha instanceof Date && row.fecha.getTime() >= start);
        assert.equal(f.state().saldos[20].stock, expected); assert.equal(f.state().movimientos.length, 1);
    }
});
test('saldos negativos, corruptos y overflow se rechazan sin mutaciones', async () => {
    for (const [stock, patch] of [[5, { tipo: 'SALIDA', cantidad: 6 }], [5, { tipo: 'AJUSTE', direccion: 'DISMINUIR', cantidad: 6 }],
        [-1, {}], [1.5, {}], [2147483647, {}]]) {
        const f = fixture(); f.change(s => { s.saldos[20].stock = stock; }); const before = f.state();
        await assert.rejects(f.service.registrar(4, command(patch)), { status: 409 }); assert.deepEqual(f.state(), before);
    }
});
test('reintentos concurrentes idénticos producen un solo movimiento y un solo cambio de saldo', async () => {
    const f = fixture(), results = await Promise.all(Array.from({ length: 8 }, () => f.service.registrar(4, command())));
    assert.equal(results.filter(r => !r.repetido).length, 1); assert.equal(f.state().movimientos.length, 1);
    assert.equal(f.state().saldos[20].stock, 8);
    f.change(s => { s.propietario = 5; });
    await assert.rejects(f.service.registrar(4, command()), { status: 403 });
});
test('misma clave con otro medicamento o contenido genera conflicto incluso concurrentemente', async () => {
    const f = fixture();
    const results = await Promise.allSettled([f.service.registrar(4, command()), f.service.registrar(4, command({ medicamentoId: 21 }))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.codigo, 'CLAVE_REUTILIZADA');
    await assert.rejects(f.service.registrar(4, command({ cantidad: 4 })), { status: 409 });
    assert.equal(f.state().movimientos.length, 1);
});
test('salidas concurrentes con claves distintas no sobrepasan el saldo', async () => {
    const f = fixture(), results = await Promise.allSettled([
        f.service.registrar(4, command({ tipo: 'SALIDA', cantidad: 4 })),
        f.service.registrar(4, command({ tipo: 'SALIDA', cantidad: 4, clave: '9dd84487-0616-4ca0-a630-204894e810cf' }))
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.codigo, 'SALDO_FUERA_RANGO');
    assert.equal(f.state().saldos[20].stock, 1); assert.equal(f.state().movimientos.length, 1);
});
test('fallo de auditoría o versión revierte el saldo junto al historial', async () => {
    for (const failure of ['failAudit', 'conflict']) {
        const f = fixture(), before = f.state(); f[failure]();
        await assert.rejects(f.service.registrar(4, command())); assert.deepEqual(f.state(), before);
    }
});
