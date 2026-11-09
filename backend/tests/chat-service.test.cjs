const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/repositories/chat.repository");
const service = require("../src/services/chat.service");

const original = { ...repository };
const customer = { id: 10, rol: 2 };
const agent = { id: 20, rol: 3 };
const conversation = { id: 7, cliente_id: 10, agente_id: 20, estado: "ABIERTA" };

test("chat service: restringe historial a cliente y agente asignado", async () => {
  repository.esStaff = async (id) => id === 20;
  repository.obtenerAutorizada = async (id, userId, staff) => id === 7 && (staff ? userId === 20 : userId === 10) ? conversation : null;
  repository.mensajes = async () => [{ id: 1, contenido: "Hola" }];
  assert.equal((await service.historial(customer, 7)).messages.length, 1);
  assert.equal((await service.historial(agent, 7)).messages.length, 1);
  await assert.rejects(service.historial({ id: 11, rol: 2 }, 7), /permisos/);
  await assert.rejects(service.historial({ id: 21, rol: 3 }, 7), /permisos/);
});

test("chat service: valida mensajes y persiste los mensajes autorizados", async () => {
  repository.esStaff = async () => true;
  repository.obtenerAutorizada = async (id, userId) => id === 7 && [10, 20].includes(userId) ? conversation : null;
  repository.guardarMensaje = async (id, userId, contenido) => ({ id: 42, conversacion_id: id, remitente_id: userId, contenido });
  await assert.rejects(service.enviar(customer, 7, "  "), /2000 caracteres/);
  await assert.rejects(service.enviar(customer, 7, "x".repeat(2001)), /2000 caracteres/);
  await assert.rejects(service.enviar({ id: 11, rol: 2 }, 7, "Privado"), /permisos/);
  assert.deepEqual(await service.enviar(customer, 7, " Buenos días "), { id: 42, conversacion_id: 7, remitente_id: 10, contenido: "Buenos días" });
});

test("chat service: solo usuarios autenticados pueden abrir conversaciones", async () => {
  repository.listar = async () => [];
  repository.crear = async (id) => ({ id: 8, cliente_id: id });
  assert.deepEqual(await service.crear(customer), { id: 8, cliente_id: 10 });
  await assert.rejects(service.crear(agent), /Solo los usuarios/);
});

test("chat service: determina roles y lista solo cuentas autorizadas", async () => {
  assert.equal(service.staffRole(agent), true);
  assert.equal(service.staffRole({ id: 10, rol_id: 2 }), false);
  assert.equal(service.staffRole(undefined), false);

  const listed = [];
  repository.listar = async (id, staff) => {
    listed.push({ id, staff });
    return [];
  };
  await service.listar(customer);
  await service.listar(agent);
  assert.deepEqual(listed, [{ id: 10, staff: false }, { id: 20, staff: true }]);
  await assert.rejects(service.listar({ id: 30, rol: 1 }), /No autorizado/);
});

test("chat service: reutiliza conversaciones existentes y valida autorización", async () => {
  repository.listar = async () => [conversation];
  repository.crear = async () => assert.fail("no debe duplicar conversación");
  assert.equal(await service.crear(customer), conversation);

  assert.equal(await service.autorizada(customer, "invalid"), null);
  assert.equal(await service.autorizada({ id: 1, rol: 1 }, 7), null);
  repository.esStaff = async () => false;
  assert.equal(await service.autorizada(agent, 7), null);
  repository.esStaff = async () => true;
  repository.obtenerAutorizada = async (...args) => {
    assert.deepEqual(args, [7, 20, true]);
    return conversation;
  };
  assert.equal(await service.autorizada(agent, "7"), conversation);
});

test("chat service rechaza controles y conversaciones cerradas al enviar", async () => {
  repository.esStaff = async () => true;
  repository.obtenerAutorizada = async () => ({ ...conversation, estado: "CERRADA" });
  await assert.rejects(service.enviar(customer, 7, "hola\u0001"), /caracteres válidos/);
  await assert.rejects(service.enviar(customer, 7, "hola"), /cerrada/);
});

test.after(() => { Object.assign(repository, original); });
