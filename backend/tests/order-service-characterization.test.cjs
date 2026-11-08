const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const inventory = [
    { id: 5, nombre: 'Mock medicamento', precio: '12.34', stock: 8, estado: 'DISPONIBLE' }
];
const writes = [];
const IDEMPOTENCY_KEY = 'de305d54-75b4-431b-adb2-eb6b9e546014';
let existingOrder = null;
let lookupCalls = 0;
let inventoryCalls = 0;
const repository = {
    buscarPedidoIdempotente: async (_userId, _key, hash) => {
        lookupCalls += 1;
        if (!existingOrder) return null;
        if (existingOrder.hash !== hash) {
            throw Object.assign(new Error('La clave Idempotency-Key ya fue utilizada con otros datos.'), { status: 409 });
        }
        return existingOrder.result;
    },
    listarMedicamentos: async ids => {
        inventoryCalls += 1;
        return inventory.filter(m => ids.includes(m.id));
    },
    crearPedidoConPago: async data => { writes.push(data); return { solicitudId: 99, pagoId: 123, replayed: false }; },
    listarPedidosUsuario: async () => [],
    detallePedidoUsuario: async () => [],
    eliminarPedidoUsuario: async () => {}
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === '../repositories/order.repository' && /order\.service\.js$/.test(parent?.filename || '')) return repository;
    return originalLoad.call(this, request, parent, isMain);
};
const orderService = require('../src/services/order.service');
Module._load = originalLoad;

function order(overrides = {}) {
    return {
        items: [{ id: 5, cantidad: 2 }],
        tipoEntrega: 'RECOGER',
        direccion: '',
        observaciones: '',
        pago: { numero: '4242 4242 4242 4242', vencimiento: '12/30', cvv: '123', titular: 'Mock' },
        ...overrides
    };
}

before(() => { inventory[0].stock = 8; writes.length = 0; existingOrder = null; lookupCalls = 0; inventoryCalls = 0; });
after(() => { inventory[0].stock = 8; writes.length = 0; existingOrder = null; });

test('crea pedido con precio tomado del catálogo y pago de prueba aprobado', async () => {
    const result = await orderService.crearPedido(12, order(), IDEMPOTENCY_KEY);
    assert.equal(result.solicitudId, 99);
    assert.equal(result.total, 24.68);
    assert.equal(result.pago.estado, 'APROBADO');
    assert.equal(result.pago.ultimos_digitos, '4242');
    assert.equal(writes.at(-1).usuarioId, 12);
    assert.equal(writes.at(-1).items[0].precio, 12.34);
    assert.equal(writes.at(-1).items[0].subtotal, 24.68);
    assert.equal(writes.at(-1).idempotencyKey, IDEMPOTENCY_KEY);
    assert.match(writes.at(-1).idempotencyHash, /^[a-f0-9]{64}$/);
});

test('la huella idempotente no incorpora datos de tarjeta', async () => {
    await orderService.crearPedido(12, order(), IDEMPOTENCY_KEY);
    const first = writes.at(-1).idempotencyHash;
    await orderService.crearPedido(
        12,
        order({
            pago: {
                numero: '5555 5555 5555 4444',
                vencimiento: '12/30',
                cvv: '999',
                titular: 'Otra persona'
            }
        }),
        'de305d54-75b4-431b-adb2-eb6b9e546015'
    );
    assert.equal(writes.at(-1).idempotencyHash, first);
});

test('rechaza medicamentos inexistentes, no disponibles o sin stock antes de persistir', async t => {
    const writesBefore = writes.length;
    await t.test('inexistente', async () => {
        await assert.rejects(orderService.crearPedido(12, order({ items: [{ id: 404, cantidad: 1 }] }), IDEMPOTENCY_KEY), /no existe/);
    });
    await t.test('no disponible', async () => {
        const old = inventory[0].estado; inventory[0].estado = 'AGOTADO';
        try { await assert.rejects(orderService.crearPedido(12, order(), IDEMPOTENCY_KEY), /no está disponible/); }
        finally { inventory[0].estado = old; }
    });
    await t.test('stock insuficiente', async () => {
        await assert.rejects(orderService.crearPedido(12, order({ items: [{ id: 5, cantidad: 9 }] }), IDEMPOTENCY_KEY), /Stock insuficiente/);
    });
    assert.equal(writes.length, writesBefore);
});

test('valida líneas, domicilio y tarjeta de prueba con mensajes actuales', async t => {
    const cases = [
        [order({ items: [] }), /al menos un medicamento/],
        [order({ items: [{ id: 5, cantidad: 1 }, { id: 5, cantidad: 1 }] }), /duplicados/],
        [order({ tipoEntrega: 'DOMICILIO', direccion: 'corta' }), /dirección es obligatoria/],
        [order({ pago: { numero: '1111222233334444', vencimiento: '12/30', cvv: '123', titular: 'Mock' } }), /Pago rechazado/]
    ];
    for (const [payload, message] of cases) await t.test(String(message), async () => {
        await assert.rejects(orderService.crearPedido(12, payload, IDEMPOTENCY_KEY), message);
    });
});

test('requiere clave UUID y retorna un pedido repetido antes de validar stock o pago', async t => {
    await t.test('rechaza una clave ausente o inválida', async () => {
        await assert.rejects(
            orderService.crearPedido(12, order(), undefined),
            { status: 400, message: /UUID válido/ }
        );
    });

    await t.test('reutiliza el resultado persistido sin consultar inventario ni pago', async () => {
        const result = {
            solicitudId: 99,
            pagoId: 123,
            total: 24.68,
            pago: { estado: 'APROBADO', referencia: 'SIM-ORIGINAL' },
            replayed: true
        };
        existingOrder = {
            hash: writes.at(-1).idempotencyHash,
            result
        };
        const inventoryCallsBefore = inventoryCalls;
        const resultBefore = await orderService.crearPedido(
            12,
            order({ pago: {} }),
            IDEMPOTENCY_KEY
        );
        assert.deepEqual(resultBefore, result);
        assert.equal(inventoryCalls, inventoryCallsBefore);
    });

    await t.test('rechaza reutilizar la clave para otro pedido', async () => {
        await assert.rejects(
            orderService.crearPedido(
                12,
                order({ items: [{ id: 5, cantidad: 3 }] }),
                IDEMPOTENCY_KEY
            ),
            { status: 409, message: /otros datos/ }
        );
    });
});
