require('./support/isolate-database.cjs');
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { attachChatSocket } = require("../src/sockets/chat.socket");
const service = require("../src/services/chat.service");
const repository = require("../src/repositories/chat.repository");

process.env.JWT_SECRET = "socket-test-secret";
const serviceOriginals = { ...service };
const repositoryOriginals = { ...repository };
function setup(token) {
  const emitted = [];
  const io = { middleware: null, connection: null, use(fn) { this.middleware = fn; }, on(name, fn) { if (name === "connection") this.connection = fn; }, to(room) { return { emit: (event, data) => emitted.push({ room, event, data }) }; } };
  const socket = { handshake: { auth: { token } }, data: {}, handlers: {}, rooms: [], on(name, fn) { this.handlers[name] = fn; }, join(room) { this.rooms.push(room); }, leave() {} };
  attachChatSocket(io);
  return { io, socket, emitted };
}

test("socket: valida JWT y restringe roles del handshake", async () => {
  const invalid = setup("not-a-token");
  await new Promise((resolve) => invalid.io.middleware(invalid.socket, (error) => { assert.ok(error); resolve(); }));
  const wrongRole = setup(jwt.sign({ id: 4, rol: 1 }, process.env.JWT_SECRET));
  await new Promise((resolve) => wrongRole.io.middleware(wrongRole.socket, (error) => { assert.ok(error); resolve(); }));
  const authorized = setup(jwt.sign({ id: 10, rol: 2 }, process.env.JWT_SECRET));
  await new Promise((resolve, reject) => authorized.io.middleware(authorized.socket, (error) => error ? reject(error) : resolve()));
  assert.equal(authorized.socket.data.usuario.id, 10);
});

test("socket: entrega eventos de mensaje y notifica la conversación", async () => {
  service.autorizada = async () => ({ id: 7 });
  service.enviar = async (_user, id, content) => ({ id: 90, conversacion_id: id, remitente_id: 10, contenido: content });
  service.staffRole = () => false;
  repository.obtenerParticipantes = async () => ({ cliente_id: 10, agente_id: null });
  const { io, socket, emitted } = setup(jwt.sign({ id: 10, rol: 2 }, process.env.JWT_SECRET));
  await new Promise((resolve, reject) => io.middleware(socket, (error) => error ? reject(error) : resolve()));
  io.connection(socket);
  let response;
  await socket.handlers["chat:send"]({ conversationId: 7, contenido: "Hola" }, (value) => { response = value; });
  assert.equal(response.ok, true);
  assert.ok(emitted.some((entry) => entry.room === "chat:7" && entry.event === "chat:message" && entry.data.id === 90));
  assert.ok(emitted.some((entry) => entry.room === "chat:staff" && entry.event === "chat:notification"));
});

test("socket: rechaza unirse a conversaciones sin permiso y devuelve historial autorizado", async () => {
  service.autorizada = async (_user, id) => Number(id) === 7 ? { id: 7 } : null;
  service.staffRole = () => false;
  repository.mensajes = async () => [{ id: 1, contenido: "Anterior" }];
  repository.actualizarEstado = async () => ({ count: 0 });
  const { io, socket } = setup(jwt.sign({ id: 10, rol: 2 }, process.env.JWT_SECRET));
  await new Promise((resolve, reject) => io.middleware(socket, (error) => error ? reject(error) : resolve()));
  io.connection(socket);
  let forbidden;
  await socket.handlers["chat:join"](8, (result) => { forbidden = result; });
  assert.equal(forbidden.ok, false);
  let allowed;
  await socket.handlers["chat:join"](7, (result) => { allowed = result; });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.mensajes, [{ id: 1, contenido: "Anterior" }]);
  assert.ok(socket.rooms.includes("chat:7"));
});

test("socket: une agentes, marca mensajes entregados y notifica al participante", async () => {
  service.autorizada = async () => ({ id: 7 });
  service.staffRole = () => true;
  repository.mensajes = async () => [{ id: 1 }];
  repository.actualizarEstado = async (_id, state, userId) => {
    assert.deepEqual([state, userId], ["ENTREGADO", 20]);
    return { count: 1 };
  };
  repository.obtenerParticipantes = async () => ({ cliente_id: 10, agente_id: 20 });
  service.enviar = async () => ({ id: 91, conversacion_id: 7 });
  const { io, socket, emitted } = setup(jwt.sign({ id: 20, rol: 3 }, process.env.JWT_SECRET));
  await new Promise((resolve, reject) => io.middleware(socket, (error) => error ? reject(error) : resolve()));
  io.connection(socket);

  let joined;
  await socket.handlers["chat:join"](7, (result) => { joined = result; });
  assert.equal(joined.ok, true);
  assert.ok(emitted.some((entry) => entry.event === "chat:status" && entry.data.estado === "ENTREGADO"));
  assert.ok(socket.rooms.includes("chat:staff"));

  let sent;
  await socket.handlers["chat:send"]({ conversationId: 7, contenido: "Hola" }, (result) => { sent = result; });
  assert.equal(sent.ok, true);
  assert.ok(emitted.some((entry) => entry.room === "user:10" && entry.event === "chat:notification"));
});

test("socket: conserva respuestas de error para join, send y read", async () => {
  const { io, socket } = setup(jwt.sign({ id: 10, rol: 2 }, process.env.JWT_SECRET));
  await new Promise((resolve, reject) => io.middleware(socket, (error) => error ? reject(error) : resolve()));
  io.connection(socket);

  service.autorizada = async () => { throw new Error("storage"); };
  let joinFailure;
  await socket.handlers["chat:join"](7, (result) => { joinFailure = result; });
  assert.deepEqual(joinFailure, { ok: false, mensaje: "No se pudo abrir la conversación." });
  let readFailure;
  await socket.handlers["chat:read"](7, (result) => { readFailure = result; });
  assert.deepEqual(readFailure, { ok: false });

  service.enviar = async () => { throw new Error("mensaje inválido"); };
  let sendFailure;
  await socket.handlers["chat:send"]({ conversationId: 7 }, (result) => { sendFailure = result; });
  assert.deepEqual(sendFailure, { ok: false, mensaje: "mensaje inválido" });
});

test("socket: confirma lectura, tolera ausencia de cambio y permite salir", async () => {
  let authorized = { id: 7 };
  service.autorizada = async () => authorized;
  repository.actualizarEstado = async () => ({ count: authorized ? 1 : 0 });
  const { io, socket, emitted } = setup(jwt.sign({ id: 10, rol: 2 }, process.env.JWT_SECRET));
  await new Promise((resolve, reject) => io.middleware(socket, (error) => error ? reject(error) : resolve()));
  io.connection(socket);

  let read;
  await socket.handlers["chat:read"](7, (result) => { read = result; });
  assert.deepEqual(read, { ok: true });
  assert.ok(emitted.some((entry) => entry.event === "chat:status" && entry.data.estado === "LEIDO"));

  authorized = null;
  let deniedRead;
  await socket.handlers["chat:read"](8, (result) => { deniedRead = result; });
  assert.deepEqual(deniedRead, { ok: false });

  let left;
  socket.leave = (room) => { left = room; };
  authorized = { id: 8 };
  await socket.handlers["chat:leave"](8);
  assert.equal(left, "chat:8");
  authorized = null;
  await socket.handlers["chat:leave"](8);
  assert.equal(left, "chat:8");
});

test.after(() => {
  Object.assign(service, serviceOriginals);
  Object.assign(repository, repositoryOriginals);
});
