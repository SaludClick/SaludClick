const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const calls = [];
let mode;
let storedOrder;
let medication;
let secondMedication;
let failQuery;
let queryRows;
let medications;
let pedidoExists;

const pool = {
    query: async (sql, params) => query(sql, params),
    connect: async () => ({
        query,
        release: () => calls.push({ sql: 'RELEASE' })
    })
};

async function query(sql, params = []) {
    calls.push({ sql, params });
    if (failQuery && sql.includes(failQuery)) throw new Error('test database failure');
    if (sql.includes('COALESCE(SUM(ds.subtotal)')) return { rows: queryRows };
    if (sql.includes('s.observaciones, ds.medicamento_id')) return { rows: queryRows };
    if (sql.startsWith('SELECT id, nombre, descripcion, categoria_id, precio, stock, imagen, estado')) {
        return { rows: medications };
    }
    if (sql.startsWith('SELECT id FROM solicitudes') && sql.includes('LIMIT 1')) {
        return { rows: pedidoExists ? [{ id: 81 }] : [] };
    }
    if (sql.includes('FROM solicitudes s') && sql.includes('LEFT JOIN pagos')) {
        return { rows: storedOrder ? [storedOrder] : [] };
    }
    if (sql.startsWith('INSERT INTO solicitudes')) {
        return { rows: mode === 'duplicate' ? [] : [{ id: 81 }] };
    }
    if (sql.includes('FROM medicamentos WHERE id = $1 FOR UPDATE')) {
        const found = Number(params[0]) === 5
            ? medication
            : Number(params[0]) === 6
                ? secondMedication
                : null;
        return { rows: found ? [found] : [] };
    }
    if (sql.startsWith('INSERT INTO pagos')) {
        return { rows: [{ id: 91 }] };
    }
    return { rows: [] };
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === '../config/database' && /order\.repository\.js$/.test(parent?.filename || '')) {
        return pool;
    }
    return originalLoad.call(this, request, parent, isMain);
};
const repository = require('../src/repositories/order.repository');
Module._load = originalLoad;

const payload = {
    usuarioId: 12,
    tipoEntrega: 'RECOGER',
    direccion: '',
    observaciones: '',
    items: [{ medicamento_id: 5, cantidad: 2, precio: 12.34, subtotal: 24.68 }],
    total: 24.68,
    pago: {
        estado: 'APROBADO',
        metodo: 'TARJETA',
        marca: 'VISA',
        ultimos_digitos: '4242',
        referencia: 'SIM-TEST'
    },
    idempotencyKey: 'de305d54-75b4-431b-adb2-eb6b9e546014',
    idempotencyHash: 'a'.repeat(64)
};

beforeEach(() => {
    calls.length = 0;
    mode = 'new';
    storedOrder = null;
    secondMedication = null;
    failQuery = null;
    queryRows = [{ id: 81 }];
    medications = [{ id: 5, nombre: 'Medicamento de prueba' }];
    pedidoExists = true;
    medication = {
        id: 5, nombre: 'Medicamento de prueba',
        precio: '12.34', stock: 5, estado: 'DISPONIBLE'
    };
});

test('la clave duplicada devuelve el pedido guardado sin descontar stock de nuevo', async () => {
    mode = 'duplicate';
    storedOrder = {
        solicitudId: 81,
        idempotency_hash: payload.idempotencyHash,
        pagoId: 91,
        total: '24.68',
        estado: 'APROBADO',
        metodo: 'TARJETA',
        marca: 'VISA',
        ultimos_digitos: '4242',
        referencia: 'SIM-ORIGINAL'
    };

    const result = await repository.crearPedidoConPago(payload);
    assert.deepEqual(result, {
        solicitudId: 81,
        pagoId: 91,
        total: 24.68,
        pago: {
            estado: 'APROBADO',
            metodo: 'TARJETA',
            marca: 'VISA',
            ultimos_digitos: '4242',
            referencia: 'SIM-ORIGINAL'
        },
        replayed: true
    });
    assert.ok(calls.some(({ sql }) => sql.includes('ON CONFLICT (usuario_id, idempotency_key) DO NOTHING')));
    assert.ok(calls.some(({ sql }) => sql === 'COMMIT'));
    assert.equal(calls.some(({ sql }) => sql.includes('FOR UPDATE')), false);
    assert.equal(calls.some(({ sql }) => sql.startsWith('UPDATE medicamentos')), false);
});

test('pedido nuevo reclama la clave y persiste detalles, pago y stock en una transacción', async () => {
    const result = await repository.crearPedidoConPago(payload);
    assert.deepEqual(result, { solicitudId: 81, pagoId: 91, replayed: false });
    assert.equal(calls[0].sql, 'BEGIN');
    assert.ok(calls.findIndex(({ sql }) => sql.startsWith('INSERT INTO solicitudes'))
        < calls.findIndex(({ sql }) => sql.includes('FOR UPDATE')));
    assert.ok(calls.some(({ sql }) => sql.startsWith('INSERT INTO detalle_solicitud')));
    assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE medicamentos')));
    assert.ok(calls.some(({ sql }) => sql.startsWith('INSERT INTO pagos')));
    assert.ok(calls.some(({ sql }) => sql === 'COMMIT'));
    const paymentWrite = calls.find(({ sql }) => sql.startsWith('INSERT INTO pagos'));
    assert.deepEqual(paymentWrite.params.slice(2, 6), ['SIM-TEST', 'TARJETA', 'VISA', '4242']);
});

test('una clave con otra huella revierte sin acceder a inventario', async () => {
    mode = 'duplicate';
    storedOrder = {
        solicitudId: 81,
        idempotency_hash: 'b'.repeat(64),
        pagoId: 91,
        total: '24.68',
        estado: 'APROBADO',
        metodo: 'TARJETA',
        marca: 'VISA',
        ultimos_digitos: '4242',
        referencia: 'SIM-ORIGINAL'
    };

    await assert.rejects(
        repository.crearPedidoConPago(payload),
        { status: 409, message: /otros datos/ }
    );
    assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
    assert.equal(calls.some(({ sql }) => sql.includes('FOR UPDATE')), false);
});

test('un cambio de stock concurrente revierte el pedido y no guarda el pago', async () => {
    medication.stock = 1;
    await assert.rejects(
        repository.crearPedidoConPago(payload),
        { status: 409, message: /Stock insuficiente/ }
    );
    assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
    assert.equal(calls.some(({ sql }) => sql.startsWith('INSERT INTO detalle_solicitud')), false);
    assert.equal(calls.some(({ sql }) => sql.startsWith('INSERT INTO pagos')), false);
});

test('bloquea inventario en orden estable para evitar interbloqueos entre carritos', async () => {
    secondMedication = {
        id: 6, nombre: 'Otro medicamento',
        precio: '2.00', stock: 5, estado: 'DISPONIBLE'
    };
    const reverseOrder = {
        ...payload,
        items: [
            { medicamento_id: 6, cantidad: 1, precio: 2, subtotal: 2 },
            { medicamento_id: 5, cantidad: 1, precio: 12.34, subtotal: 12.34 }
        ]
    };

    await repository.crearPedidoConPago(reverseOrder);
    const lockedIds = calls
        .filter(({ sql }) => sql.includes('FOR UPDATE'))
        .map(({ params }) => params[0]);
    assert.deepEqual(lockedIds, [5, 6]);
});

test('consultas de idempotencia distinguen ausencia, replay y registros incompletos', async t => {
    await t.test('sin coincidencia devuelve null', async () => {
        assert.equal(await repository.buscarPedidoIdempotente(12, payload.idempotencyKey, payload.idempotencyHash), null);
    });

    await t.test('una coincidencia válida devuelve el pago persistido', async () => {
        storedOrder = {
            solicitudId: 81,
            idempotency_hash: payload.idempotencyHash,
            pagoId: 91,
            total: '24.68',
            estado: 'APROBADO',
            metodo: 'TARJETA',
            marca: 'VISA',
            ultimos_digitos: '4242',
            referencia: 'SIM-ORIGINAL'
        };
        assert.equal((await repository.buscarPedidoIdempotente(12, payload.idempotencyKey, payload.idempotencyHash)).replayed, true);
        assert.deepEqual(calls.at(-1).params, [12, payload.idempotencyKey]);
    });

    await t.test('sin pago previo informa inconsistencia', async () => {
        storedOrder = { solicitudId: 81, idempotency_hash: payload.idempotencyHash, pagoId: null };
        await assert.rejects(
            repository.buscarPedidoIdempotente(12, payload.idempotencyKey, payload.idempotencyHash),
            /No se pudo recuperar el resultado/
        );
    });

    await t.test('un conflicto sin pedido recuperable falla y revierte', async () => {
        mode = 'duplicate';
        await assert.rejects(
            repository.crearPedidoConPago(payload),
            /No se pudo recuperar el resultado/
        );
        assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
        assert.ok(calls.some(({ sql }) => sql === 'RELEASE'));
    });
});

test('consulta inventario valida lista vacía y pasa parámetros para IDs', async () => {
    assert.deepEqual(await repository.listarMedicamentos([]), []);
    assert.deepEqual(await repository.listarMedicamentos([5, 6]), medications);
    const inventoryQuery = calls.find(({ sql }) => sql.includes('FROM medicamentos WHERE id IN'));
    assert.match(inventoryQuery.sql, /id IN \(\$1,\$2\)/);
    assert.deepEqual(inventoryQuery.params, [5, 6]);
});

test('checkout revierte medicamentos inexistentes, no disponibles y con precio cambiado', async t => {
    const cases = [
        ['inexistente', null, /no está disponible/],
        ['no disponible', { ...medication, estado: 'AGOTADO' }, /no está disponible/],
        ['precio cambiado', { ...medication, precio: '12.35' }, /cambió/]
    ];

    for (const [label, current, message] of cases) {
        await t.test(label, async () => {
            medication = current;
            await assert.rejects(repository.crearPedidoConPago(payload), message);
            assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
            assert.ok(calls.some(({ sql }) => sql === 'RELEASE'));
            assert.equal(calls.some(({ sql }) => sql.startsWith('INSERT INTO pagos')), false);
        });
    }
});

test('errores de persistencia del pago revierten detalles y liberan la conexión', async () => {
    failQuery = 'INSERT INTO pagos';
    await assert.rejects(repository.crearPedidoConPago(payload), /test database failure/);
    assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
    assert.ok(calls.some(({ sql }) => sql === 'RELEASE'));
    assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE medicamentos')));
});

test('consulta historial y detalle de pedido con aislamiento por usuario', async () => {
    assert.deepEqual(await repository.listarPedidosUsuario(12), queryRows);
    assert.deepEqual(await repository.detallePedidoUsuario(12, 81), queryRows);
    assert.deepEqual(calls.filter(({ sql }) => sql.includes('WHERE s.usuario_id = $1')).map(call => call.params), [
        [12],
        [12, 81]
    ]);
});

test('eliminación de pedido confirma o revierte la transacción según el propietario', async t => {
    await t.test('pedido propio se elimina en orden y confirma', async () => {
        assert.equal(await repository.eliminarPedidoUsuario(12, 81), true);
        const writes = calls.filter(({ sql }) => sql.startsWith('DELETE FROM'));
        assert.deepEqual(writes.map(({ sql }) => sql.split(' ')[2]), [
            'pagos', 'detalle_solicitud', 'solicitudes'
        ]);
        assert.ok(calls.some(({ sql }) => sql === 'COMMIT'));
        assert.ok(calls.some(({ sql }) => sql === 'RELEASE'));
    });

    await t.test('pedido ajeno o inexistente no se borra', async () => {
        pedidoExists = false;
        await assert.rejects(repository.eliminarPedidoUsuario(12, 81), /Pedido no encontrado/);
        assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
        assert.equal(calls.some(({ sql }) => sql.startsWith('DELETE FROM')), false);
        assert.ok(calls.some(({ sql }) => sql === 'RELEASE'));
    });

    await t.test('fallo de base revierte y libera', async () => {
        failQuery = 'DELETE FROM detalle_solicitud';
        await assert.rejects(repository.eliminarPedidoUsuario(12, 81), /test database failure/);
        assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
        assert.ok(calls.some(({ sql }) => sql === 'RELEASE'));
    });
});
