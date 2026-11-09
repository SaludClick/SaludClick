const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const service = {
    listar: async () => [{ id: 7 }],
    crear: async () => ({ id: 7 }),
    historial: async () => ({ conversation: { id: 7 }, messages: [] })
};
let failure;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === "../services/chat.service" && /chat\.controller\.js$/.test(parent?.filename || "")) {
        return new Proxy(service, {
            get(target, property) {
                if (failure) return async () => { throw failure; };
                return target[property];
            }
        });
    }
    return originalLoad.call(this, request, parent, isMain);
};
const controller = require("../src/controllers/chat.controller");
Module._load = originalLoad;

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

beforeEach(() => { failure = null; });

test("chat controller lista conversaciones y mapea errores a 403", async () => {
    const res = response();
    await controller.listar({ usuario: { id: 10 } }, res);
    assert.deepEqual(res.body, { ok: true, conversaciones: [{ id: 7 }] });

    failure = new Error("No autorizado");
    const failed = response();
    await controller.listar({ usuario: { id: 10 } }, failed);
    assert.equal(failed.statusCode, 403);
    assert.deepEqual(failed.body, { ok: false, mensaje: "No autorizado" });
});

test("chat controller crea conversación con 201 y mapea errores a 403", async () => {
    const res = response();
    await controller.crear({ usuario: { id: 10 } }, res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { ok: true, conversacion: { id: 7 } });

    failure = new Error("Solo clientes");
    const failed = response();
    await controller.crear({ usuario: { id: 10 } }, failed);
    assert.equal(failed.statusCode, 403);
});

test("chat controller diferencia conversación no autorizada y error de historial", async () => {
    const res = response();
    await controller.historial({ usuario: { id: 10 }, params: { id: "7" } }, res);
    assert.deepEqual(res.body, { ok: true, conversation: { id: 7 }, messages: [] });

    failure = new Error("Conversación sin permisos");
    const forbidden = response();
    await controller.historial({ usuario: { id: 10 }, params: { id: "7" } }, forbidden);
    assert.equal(forbidden.statusCode, 404);

    failure = new Error("Error de base");
    const invalid = response();
    await controller.historial({ usuario: { id: 10 }, params: { id: "7" } }, invalid);
    assert.equal(invalid.statusCode, 400);
});
