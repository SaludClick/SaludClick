const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const inventory = [
    { id: 5, nombre: 'Mock medicamento', precio: '12.34', stock: 8, estado: 'DISPONIBLE' }
];
const writes = [];
const repository = {
    listarMedicamentos: async ids => inventory.filter(m => ids.includes(m.id)),
    crearPedidoConPago: async data => { writes.push(data); return { pedidoId: 99 }; },
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

before(() => { inventory[0].stock = 8; writes.length = 0; });
after(() => { inventory[0].stock = 8; writes.length = 0; });

test('crea pedido con precio tomado del catálogo y pago de prueba aprobado', async () => {
    const result = await orderService.crearPedido(12, order());
    assert.equal(result.pedidoId, 99);
    assert.equal(result.total, 24.68);
    assert.equal(result.pago.estado, 'APROBADO');
    assert.equal(result.pago.ultimos_digitos, '4242');
    assert.equal(writes.at(-1).usuarioId, 12);
    assert.equal(writes.at(-1).items[0].precio, 12.34);
    assert.equal(writes.at(-1).items[0].subtotal, 24.68);
});

test('rechaza medicamentos inexistentes, no disponibles o sin stock antes de persistir', async t => {
    const writesBefore = writes.length;
    await t.test('inexistente', async () => {
        await assert.rejects(orderService.crearPedido(12, order({ items: [{ id: 404, cantidad: 1 }] })), /no existe/);
    });
    await t.test('no disponible', async () => {
        const old = inventory[0].estado; inventory[0].estado = 'AGOTADO';
        try { await assert.rejects(orderService.crearPedido(12, order()), /no está disponible/); }
        finally { inventory[0].estado = old; }
    });
    await t.test('stock insuficiente', async () => {
        await assert.rejects(orderService.crearPedido(12, order({ items: [{ id: 5, cantidad: 9 }] })), /Stock insuficiente/);
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
        await assert.rejects(orderService.crearPedido(12, payload), message);
    });
});
