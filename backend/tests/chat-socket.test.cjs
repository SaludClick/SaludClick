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

test.after(() => {
  Object.assign(service, serviceOriginals);
  Object.assign(repository, repositoryOriginals);
});
