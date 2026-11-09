const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const calls = [];
let userResult;
let conversationResult;
let conversationSequence;
let conversationsResult;
let claimResult;
let messageResult;
let messagesResult;
let participantsResult;

const prisma = {
    usuario: {
        findUnique: async args => {
            calls.push(["usuario.findUnique", args]);
            return userResult;
        }
    },
    conversacion: {
        findMany: async args => {
            calls.push(["conversacion.findMany", args]);
            return conversationsResult;
        },
        create: async args => {
            calls.push(["conversacion.create", args]);
            return conversationResult;
        },
        findUnique: async args => {
            calls.push(["conversacion.findUnique", args]);
            return conversationSequence.length
                ? conversationSequence.shift()
                : conversationResult;
        },
        updateMany: async args => {
            calls.push(["conversacion.updateMany", args]);
            return claimResult;
        },
        update: async args => {
            calls.push(["conversacion.update", args]);
            return conversationResult;
        }
    },
    mensajeChat: {
        findMany: async args => {
            calls.push(["mensajeChat.findMany", args]);
            return messagesResult;
        },
        create: async args => {
            calls.push(["mensajeChat.create", args]);
            return messageResult;
        },
        updateMany: async args => {
            calls.push(["mensajeChat.updateMany", args]);
            return { count: 2 };
        }
    }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === "../config/prisma" && /chat\.repository\.js$/.test(parent?.filename || "")) {
        return prisma;
    }
    return originalLoad.call(this, request, parent, isMain);
};
const repository = require("../src/repositories/chat.repository");
Module._load = originalLoad;

beforeEach(() => {
    calls.length = 0;
    userResult = { rol_id: 3, estado: "ACTIVO" };
    conversationResult = { id: 7, cliente_id: 10, agente_id: 20, estado: "ABIERTA" };
    conversationSequence = [];
    conversationsResult = [{ id: 7 }];
    claimResult = { count: 1 };
    messageResult = { id: 91, conversacion_id: 7, contenido: "Hola" };
    messagesResult = [{ id: 91, contenido: "Hola" }];
    participantsResult = { cliente_id: 10, agente_id: 20 };
});

test("esStaff exige rol de agente activo y maneja usuario ausente", async () => {
    assert.equal(await repository.esStaff(20), true);
    userResult = { rol_id: 3, estado: "INACTIVO" };
    assert.equal(await repository.esStaff(20), false);
    userResult = { rol_id: 2, estado: "ACTIVO" };
    assert.equal(await repository.esStaff(20), false);
    userResult = null;
    assert.equal(await repository.esStaff(20), false);
});

test("listar restringe clientes a sus conversaciones y agentes a asignadas o abiertas", async () => {
    assert.deepEqual(await repository.listar(10, false), conversationsResult);
    assert.deepEqual(calls.at(-1)[1].where, { cliente_id: 10 });
    await repository.listar(20, true);
    assert.deepEqual(calls.at(-1)[1].where, {
        OR: [{ agente_id: 20 }, { agente_id: null, estado: "ABIERTA" }]
    });
});

test("crear inicializa una conversación del cliente", async () => {
    assert.equal((await repository.crear(10)).id, 7);
    assert.equal(calls[0][0], "conversacion.create");
    assert.deepEqual(calls[0][1].data, { cliente_id: 10 });
    assert.ok(calls[0][1].select);
});

test("obtenerAutorizada rechaza ausencia y usuarios ajenos", async () => {
    conversationResult = null;
    assert.equal(await repository.obtenerAutorizada(7, 10, false), null);

    conversationResult = { id: 7, cliente_id: 10, agente_id: 30, estado: "ABIERTA" };
    assert.equal(await repository.obtenerAutorizada(7, 20, true), null);

    conversationResult = { id: 7, cliente_id: 10, agente_id: 20, estado: "ABIERTA" };
    assert.equal(await repository.obtenerAutorizada(7, 11, false), null);
});

test("obtenerAutorizada devuelve conversación propia y reclama una conversación libre", async () => {
    const details = { id: 7, cliente_id: 10, agente_id: 20, estado: "ABIERTA", mensajes: [] };
    conversationResult = details;
    assert.equal(await repository.obtenerAutorizada(7, 10, false), details);

    conversationSequence = [
        { id: 7, cliente_id: 10, agente_id: null, estado: "ABIERTA" },
        details
    ];
    assert.equal(await repository.obtenerAutorizada(7, 20, true), details);
    assert.equal(calls.filter(([name]) => name === "conversacion.updateMany").length, 1);
});

test("obtenerAutorizada reconsulta si otro agente reclama primero", async () => {
    conversationSequence = [
        { id: 7, cliente_id: 10, agente_id: null, estado: "ABIERTA" },
        { id: 7, cliente_id: 10, agente_id: 30, estado: "ABIERTA" }
    ];
    claimResult = { count: 0 };
    assert.equal(await repository.obtenerAutorizada(7, 20, true), null);
    assert.equal(calls.filter(([name]) => name === "conversacion.findUnique").length, 2);
});

test("mensajes lista por antigüedad y limita la consulta a 300", async () => {
    assert.deepEqual(await repository.mensajes(7), messagesResult);
    assert.deepEqual(calls[0][1], {
        where: { conversacion_id: 7 },
        orderBy: { created_at: "asc" },
        take: 300,
        select: {
            id: true, conversacion_id: true, remitente_id: true, contenido: true,
            estado: true, created_at: true, entregado_at: true, leido_at: true
        }
    });
});

test("guardarMensaje crea el registro y actualiza la conversación", async () => {
    assert.equal((await repository.guardarMensaje(7, 10, "Hola")).id, 91);
    assert.equal(calls[0][0], "mensajeChat.create");
    assert.deepEqual(calls[0][1].data, {
        conversacion_id: 7, remitente_id: 10, contenido: "Hola"
    });
    assert.equal(calls[1][0], "conversacion.update");
    assert.deepEqual(calls[1][1].where, { id: 7 });
    assert.ok(calls[1][1].data.updated_at instanceof Date);
});

test("actualizarEstado distingue entrega y lectura y excluye al remitente", async () => {
    assert.deepEqual(await repository.actualizarEstado(7, "ENTREGADO", 10), { count: 2 });
    assert.deepEqual(calls[0][1].where, {
        conversacion_id: 7, remitente_id: { not: 10 }, estado: "ENVIADO"
    });
    assert.ok(calls[0][1].data.entregado_at instanceof Date);
    assert.equal(calls[0][1].data.leido_at, undefined);

    await repository.actualizarEstado(7, "LEIDO", 10);
    assert.deepEqual(calls[1][1].where.estado, { in: ["ENVIADO", "ENTREGADO"] });
    assert.ok(calls[1][1].data.leido_at instanceof Date);
    assert.ok(calls[1][1].data.entregado_at instanceof Date);
});

test("obtenerParticipantes devuelve solo los identificadores de la conversación", async () => {
    assert.deepEqual(await repository.obtenerParticipantes(7), conversationResult);
    assert.deepEqual(calls[0], [
        "conversacion.findUnique",
        { where: { id: 7 }, select: { cliente_id: true, agente_id: true } }
    ]);
});
