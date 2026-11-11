// Local, programmed responses only. No network calls or administrative actions.
export const HISTORY_KEY = "saludclick_vitalix_conversation_v1";
export const MAX_TURNS = 40;

export function normalize(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function containsSensitiveData(text) {
  return /\b\d{6,}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\beyJ[\w-]+\.[\w-]+|\b(?:bearer|token|cedula|documento|password)\b|\b(?:mi )?(?:clave|contrasena)\s*(?:es\b|:|=)/i.test(normalize(text));
}

export function interpretMessage(text, previousIntent = null) {
  const value = normalize(text);
  if (containsSensitiveData(text)) return "privacidad";
  if (/medic|pastilla|dosis|dolor|duele|sintoma|enfermedad|diagnost|tratamiento|receta|formula|pedido|farmac|fiebre|embaraz|sangr|urgencia/.test(value)) return "fuera-alcance";
  if (/otro usuario|otras personas|cuentas ajenas|datos de|cuenta de (?:mi|otra|otro)/.test(value)) return "privacidad";
  if (/olvide|olvidado|recuperar|restablecer|cambiar.*(?:clave|contrasena)/.test(value)) return "problemas-login";
  if (/administr|soporte|contact|hablar con/.test(value)) return "contactar-admin";
  if (/aprob|estado|seguimiento|pendiente|esperando|habilitad/.test(value)) return "estado-solicitud";
  if (/no (?:puedo|logro|me deja|consigo).*(?:ingres|entr|acced|inici)|problema.*(?:sesion|acceso|ingres)|no funciona.*(?:acceso|login)|bloquead/.test(value)) return "aclarar-acceso";
  if (/no tengo.*cuenta|sin cuenta/.test(value)) return "solicitar-cuenta";
  if (previousIntent === "aclarar-acceso" && /(?:si|tengo|activa|ya tengo)/.test(value)) return "problemas-login";
  if (/cuenta|registr|solicitar acceso|solicitud de acceso|necesito acceso/.test(value)) return "solicitar-cuenta";
  if (/preguntas frecuentes|como funciona|ayuda|opciones/.test(value)) return "faq-acceso";
  if (/^(hola|buen[oa]s?(?: dias| tardes| noches)?|hey|saludos)[!¡.,\s]*$/.test(value)) return "saludo";
  if (/gracias|muchas gracias/.test(value)) return "gracias";
  return "no-entendido";
}

export function safeUserText(text) {
  return containsSensitiveData(text) ? "[Mensaje omitido por contener posibles datos sensibles]" : text.slice(0, 1000);
}

export function readHistory(storage, allowedIntents) {
  try {
    const data = JSON.parse(storage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.slice(-MAX_TURNS).filter(turn =>
      turn && typeof turn.text === "string" && allowedIntents.includes(turn.intent)
      && typeof turn.at === "string" && Number.isFinite(Date.parse(turn.at))
      && typeof turn.replyAt === "string" && Number.isFinite(Date.parse(turn.replyAt))
    ).map(turn => ({ text: safeUserText(turn.text), intent: turn.intent, at: turn.at, replyAt: turn.replyAt }));
  } catch {
    return [];
  }
}
