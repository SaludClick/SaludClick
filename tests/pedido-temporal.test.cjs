const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../public/js/pedido-temporal.js"), "utf8");
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
function storage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("agrega sin duplicar, actualiza cantidades, elimina y vacía", async () => {
    const m = await modulePromise, s = storage();
    m.actualizarPedido(s, "agregar", 1);
    let state = m.actualizarPedido(s, "agregar", 1);
    assert.deepEqual(state.borrador, [{ id: 1, cantidad: 2 }]);
    m.actualizarPedido(s, "agregar", 2);
    state = m.actualizarPedido(s, "cantidad", 1, 5);
    assert.equal(m.totalUnidades(state.borrador), 6);
    state = m.actualizarPedido(s, "cantidad", 1, 1);
    assert.equal(m.totalUnidades(state.borrador), 2);
    state = m.actualizarPedido(s, "eliminar", 1);
    assert.deepEqual(state.borrador, [{ id: 2, cantidad: 1 }]);
    assert.deepEqual(m.actualizarPedido(s, "vaciar").borrador, []);
});

test("rechaza cantidades inválidas y medicamentos inexistentes sin guardar", async () => {
    const m = await modulePromise, s = storage();
    m.actualizarPedido(s, "agregar", 1);
    const before = s.getItem(m.STORAGE_KEY);
    for (const value of [0, -1, 1.5, NaN, Infinity, "2", null, 1000]) {
        assert.throws(() => m.actualizarPedido(s, "cantidad", 1, value));
    }
    for (const id of [99, "1", null]) assert.throws(() => m.actualizarPedido(s, "agregar", id));
    assert.equal(s.getItem(m.STORAGE_KEY), before);
});

test("confirma con identificador, fecha y cantidades; persiste y no confirma vacío", async () => {
    const m = await modulePromise, s = storage();
    assert.throws(() => m.actualizarPedido(s, "confirmar"));
    m.actualizarPedido(s, "agregar", 4);
    const state = m.actualizarPedido(s, "confirmar");
    assert.match(state.confirmados[0].id, /^LOCAL-/);
    assert.ok(Number.isFinite(Date.parse(state.confirmados[0].fecha)));
    assert.equal(state.confirmados[0].medicamentos[0].cantidad, 1);
    assert.equal(state.confirmados[0].medicamentos[0].nombre, "Loratadina");
    assert.deepEqual(state.borrador, []);
    assert.deepEqual(m.leerEstado(s), state);
    assert.throws(() => m.actualizarPedido(s, "confirmar"));
    assert.equal(m.leerEstado(s).confirmados.length, 1);
});

test("fallo de almacenamiento conserva el borrador y no confirma", async () => {
    const m = await modulePromise, s = storage();
    m.actualizarPedido(s, "agregar", 1);
    const before = s.getItem(m.STORAGE_KEY);
    const blocked = { getItem: s.getItem, setItem() { throw new Error("quota"); } };
    assert.throws(() => m.actualizarPedido(blocked, "confirmar"), /No se pudo guardar/);
    assert.equal(s.getItem(m.STORAGE_KEY), before);
});

test("datos corruptos o manipulados no se sobrescriben", async () => {
    const m = await modulePromise, s = storage();
    for (const raw of ["{", "null", JSON.stringify({version:1,borrador:[{id:99,cantidad:1}],confirmados:[]}),
        JSON.stringify({version:1,borrador:[{id:1,cantidad:1},{id:1,cantidad:1}],confirmados:[]})]) {
        s.setItem(m.STORAGE_KEY, raw);
        assert.throws(() => m.actualizarPedido(s, "agregar", 1));
        assert.equal(s.getItem(m.STORAGE_KEY), raw);
    }
});
