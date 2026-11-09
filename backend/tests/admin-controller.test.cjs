const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const service = {
    listarPedidos: async () => [],
    actualizarEstadoPedido: async () => true,
    listarCuentas: async () => [],
    eliminarCuenta: async () => ({ id: 12 })
};
let failure;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === "../services/admin.service" && /admin\.controller\.js$/.test(parent?.filename || "")) {
        return new Proxy(service, {
            get(target, property) {
                if (failure) return async () => { throw failure; };
                return target[property];
            }
        });
    }
    return originalLoad.call(this, request, parent, isMain);
};
const controller = require("../src/controllers/admin.controller");
Module._load = originalLoad;

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

async function withoutConsoleError(callback) {
    const original = console.error;
    console.error = () => {};
    try { await callback(); }
    finally { console.error = original; }
}

beforeEach(() => { failure = null; });

test("admin controller mapea pedidos, estados y cuentas", async () => {
    let res = response();
    await controller.pedidos({}, res);
    assert.deepEqual(res.body, { ok: true, pedidos: [] });
    failure = new Error("database");
    res = response();
    await withoutConsoleError(() => controller.pedidos({}, res));
    assert.equal(res.statusCode, 500);

    failure = null;
    res = response();
    await controller.estadoPedido({ params: { id: "12" }, body: { estado: "LISTA" } }, res);
    assert.equal(res.body.ok, true);
    service.actualizarEstadoPedido = async () => false;
    res = response();
    await controller.estadoPedido({ params: { id: "12" }, body: { estado: "LISTA" } }, res);
    assert.equal(res.statusCode, 404);
    service.actualizarEstadoPedido = async () => { throw new Error("Estado inválido"); };
    res = response();
    await controller.estadoPedido({ params: { id: "12" }, body: { estado: "X" } }, res);
    assert.equal(res.statusCode, 400);
});

test("admin controller lista cuentas y devuelve error de servicio como 500", async () => {
    let res = response();
    await controller.cuentas({}, res);
    assert.deepEqual(res.body, { ok: true, cuentas: [] });
    failure = new Error("database");
    res = response();
    await withoutConsoleError(() => controller.cuentas({}, res));
    assert.equal(res.statusCode, 500);
});

test("admin controller elimina cuenta y conserva códigos de error de negocio", async () => {
    const req = { params: { id: "12" }, usuario: { id: 3 } };
    let res = response();
    await controller.eliminarCuenta(req, res);
    assert.deepEqual(res.body, {
        ok: true, mensaje: "La cuenta se eliminó correctamente.", cuentaId: 12
    });

    for (const [code, status] of [
        ["CUENTA_PROPIA", 403],
        ["CUENTA_NO_ENCONTRADA", 404],
        ["CUENTA_NO_PERMITIDA", 403],
        ["CUENTA_CON_HISTORIAL", 409],
        ["P2034", 409],
        ["UNEXPECTED", 500]
    ]) {
        failure = Object.assign(new Error("Error de prueba"), { code });
        res = response();
        await withoutConsoleError(() => controller.eliminarCuenta(req, res));
        assert.equal(res.statusCode, status, code);
    }
});
