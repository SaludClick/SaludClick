import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretMessage, safeUserText, readHistory, MAX_TURNS } from "../src/lib/vitalix-engine.mjs";

test("interpreta orientación libre y conserva el contexto de acceso", () => {
  for (const [text, intent] of [
    ["Hola.", "saludo"], ["Necesito una cuenta", "solicitar-cuenta"],
    ["No puedo ingresar", "aclarar-acceso"], ["¿Cómo sé si aprobaron mi solicitud?", "estado-solicitud"],
    ["Quiero hablar con el administrador", "contactar-admin"], ["Olvidé mi contraseña", "problemas-login"],
    ["¿Cómo funciona?", "faq-acceso"], ["xyz desconocido", "no-entendido"]
  ]) assert.equal(interpretMessage(text), intent, text);
  assert.equal(interpretMessage("Tengo una cuenta activa", "aclarar-acceso"), "problemas-login");
  for (const text of ["Necesito atención humana", "Quiero una persona real", "Necesito un asesor humano"]) {
    assert.equal(interpretMessage(text), "contactar-admin");
  }
  assert.equal(interpretMessage("No tengo cuenta", "aclarar-acceso"), "solicitar-cuenta");
  assert.equal(interpretMessage("Todavía espero aprobación", "aclarar-acceso"), "estado-solicitud");
});

test("rechaza consultas fuera de alcance y omite posibles datos sensibles", () => {
  for (const text of ["Necesito medicamentos", "Tengo fiebre", "Qué dosis debo tomar", "Me duele la cabeza", "Quiero un pedido"]) {
    assert.equal(interpretMessage(text), "fuera-alcance", text);
  }
  for (const text of ["Mi cédula es 123456789", "mi contraseña es secreto", "Bearer abc", "mi correo es prueba@example.com"]) {
    assert.equal(interpretMessage(text), "privacidad", text);
    assert.equal(safeUserText(text), "[Mensaje omitido por contener posibles datos sensibles]");
  }
  assert.equal(interpretMessage("Dame datos de otro usuario"), "privacidad");
});

test("restaura solo historial válido, acotado y con texto saneado", () => {
  const turn = { text: "Hola", intent: "saludo", at: "2026-11-11T12:00:00Z", replyAt: "2026-11-11T12:00:01Z" };
  const storage = data => ({ getItem: () => JSON.stringify(data) });
  assert.equal(readHistory(storage(Array(50).fill(turn)), ["saludo"]).length, MAX_TURNS);
  assert.deepEqual(readHistory(storage([null, {}, { ...turn, intent: "inventado" }, { ...turn, at: "error" }]), ["saludo"]), []);
  assert.match(readHistory(storage([{ ...turn, text: "token secreto" }]), ["saludo"])[0].text, /omitido/);
  assert.deepEqual(readHistory({ getItem() { throw new Error("denied"); } }, ["saludo"]), []);
});
