import { useEffect, useRef, useState } from "react";
import AdministrativeSupport from './AdministrativeSupport.jsx';
import "../styles/chat.css";
import { HISTORY_KEY, MAX_TURNS, interpretMessage, readHistory, safeUserText } from "../lib/vitalix-engine.mjs";

const EMAIL_ADMIN = "contacto@saludclick.com";
const LINK_CORREO = `mailto:${EMAIL_ADMIN}?subject=Soporte%20de%20acceso%20SaludClick`;

const OPCIONES = [
  { id: "solicitar-cuenta", icon: "fa-user-plus", label: "Solicitar una cuenta" },
  { id: "estado-solicitud", icon: "fa-clipboard-check", label: "Consultar estado de solicitud" },
  { id: "problemas-login", icon: "fa-key", label: "Problemas para iniciar sesión" },
  { id: "contactar-admin", icon: "fa-envelope", label: "Contactar con Administración" },
  { id: "faq-acceso", icon: "fa-circle-question", label: "Preguntas frecuentes sobre acceso" }
];

const RESPUESTAS = {
  saludo: { parrafos: ["¡Hola! Soy VITALIX. ¿Cómo puedo ayudarte con el acceso a SaludClick?"] },
  gracias: { parrafos: ["¡Con gusto! Si necesitas más orientación sobre tu cuenta, escribe tu pregunta o elige un acceso rápido."] },
  "aclarar-acceso": { parrafos: ["¿Tienes una cuenta activa o todavía estás esperando su aprobación? No compartas tu contraseña."] },
  privacidad: { parrafos: ["No compartas contraseñas, tokens, cédulas ni información personal. No puedo consultar datos de otras personas. Reformula tu pregunta sin datos sensibles; puedo orientarte sobre acceso o contacto con Administración."] },
  "fuera-alcance": { parrafos: ["Solo puedo orientar sobre acceso y cuentas de SaludClick. No respondo consultas médicas ni gestiono solicitudes de medicamentos. Para temas de salud, contacta con un profesional de salud; para ayuda con tu cuenta, elige una opción de acceso."] },
  "no-entendido": {
    parrafos: ["No he comprendido tu pregunta. Soy un asistente de respuestas programadas. ¿Necesitas una cuenta, consultar cómo dar seguimiento a una solicitud o ayuda para ingresar? También puedes contactar con Administración."],
    enlace: { texto: "Contactar con Administración", href: LINK_CORREO }
  },
  "solicitar-cuenta": {
    titulo: "Solicitar una cuenta",
    parrafos: [
      "El registro público está deshabilitado. Este asistente todavía no puede enviar una solicitud de acceso al Administrador.",
      "Puedes preparar un correo para Administración. Se abrirá tu aplicación de correo y tendrás que enviarlo. Abrir el borrador no registra una solicitud ni confirma su recepción."
    ],
    enlace: { texto: `Escribir a ${EMAIL_ADMIN}`, href: LINK_CORREO },
    aviso: "No incluyas contraseñas ni información sensible en el correo."
  },
  "estado-solicitud": {
    titulo: "Consultar estado de solicitud",
    parrafos: [
      "La consulta automática del estado de solicitudes de acceso aún no está disponible.",
      "Para pedir una actualización, puedes escribir a Administración. No compartas tu contraseña."
    ],
    enlace: {
      texto: "Consultar con Administración",
      href: `mailto:${EMAIL_ADMIN}?subject=Consulta%20de%20solicitud%20de%20acceso`
    },
    aviso: "El correo no se envía automáticamente desde SaludClick."
  },
  "problemas-login": {
    titulo: "Problemas para iniciar sesión",
    parrafos: [
      "Confirma que estás usando el correo asociado a tu cuenta y revisa que no haya espacios adicionales.",
      "Si olvidaste tu contraseña, utiliza la recuperación de acceso. Si tu cuenta aún no ha sido habilitada, contacta con Administración."
    ],
    enlace: { texto: "Ir a recuperar contraseña", href: "/recuperar.html" },
    enlaceSecundario: { texto: "Contactar con Administración", href: LINK_CORREO },
    aviso: "Nunca envíes tu contraseña por correo."
  },
  "contactar-admin": {
    titulo: "Contactar con Administración",
    parrafos: [
      `Puedes escribir a ${EMAIL_ADMIN} para recibir ayuda con el acceso o tu cuenta.`,
      "El botón abrirá un borrador en tu aplicación de correo. Debes enviarlo tú; no se ha enviado ningún mensaje desde SaludClick."
    ],
    enlace: { texto: "Abrir correo para Administración", href: LINK_CORREO },
    aviso: "No incluyas contraseñas ni datos sensibles."
  },
  "faq-acceso": {
    titulo: "Preguntas frecuentes sobre acceso",
    preguntas: [
      {
        pregunta: "¿Puedo registrarme desde la página?",
        respuesta: "No. El registro público está deshabilitado; las cuentas se habilitan mediante Administración."
      },
      {
        pregunta: "¿Cómo solicito acceso?",
        respuesta: "Escribe a Administración usando la opción para solicitar una cuenta. El correo se abre como borrador y debes enviarlo."
      },
      {
        pregunta: "¿Puedo consultar aquí el estado de mi solicitud?",
        respuesta: "La consulta automática todavía no está disponible. Contacta con Administración para pedir una actualización."
      },
      {
        pregunta: "¿Qué hago si olvidé mi contraseña?",
        respuesta: "Usa la recuperación de contraseña en la página de acceso. Si el problema continúa, contacta con Administración."
      }
    ],
    enlace: { texto: "Contactar con Administración", href: LINK_CORREO }
  }
};

function Hora({ at }) {
  return <time className="vitalix-time" dateTime={at}>{new Date(at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</time>;
}

function Respuesta({ respuesta, at }) {
  return (
    <article className="vitalix-message vitalix-message-assistant">
      <span className="vitalix-message-avatar" aria-hidden="true">
        <i className="fa-solid fa-heart-pulse" />
      </span>
      <div className="vitalix-message-content">
        <strong className="vitalix-message-name">VITALIX</strong>
        {respuesta.titulo && <h3>{respuesta.titulo}</h3>}
        {respuesta.parrafos?.map((parrafo) => <p key={parrafo}>{parrafo}</p>)}
        {respuesta.preguntas && (
          <dl className="vitalix-faq">
            {respuesta.preguntas.map(({ pregunta, respuesta: texto }) => (
              <div key={pregunta}>
                <dt>{pregunta}</dt>
                <dd>{texto}</dd>
              </div>
            ))}
          </dl>
        )}
        {respuesta.enlace && (
          <a className="vitalix-action" href={respuesta.enlace.href}>
            {respuesta.enlace.texto}
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
          </a>
        )}
        {respuesta.enlaceSecundario && (
          <a className="vitalix-action vitalix-action-secondary" href={respuesta.enlaceSecundario.href}>
            {respuesta.enlaceSecundario.texto}
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
          </a>
        )}
        {respuesta.aviso && <p className="vitalix-note">{respuesta.aviso}</p>}
        <Hora at={at} />
      </div>
    </article>
  );
}

function Chat({ embedded = false }) {
  const Container = embedded ? "div" : "main";
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const timer = useRef(null);
  const busy = useRef(false);
  const log = useRef(null);
  const input = useRef(null);
  const opcionActiva = turns.at(-1)?.intent;

  useEffect(() => {
    try { setTurns(readHistory(window.sessionStorage, Object.keys(RESPUESTAS))); }
    catch { setStorageUnavailable(true); }
    setReady(true);
    return () => clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(turns)); }
    catch { setStorageUnavailable(true); }
  }, [turns, ready]);

  useEffect(() => {
    // Scroll only the transcript; never move keyboard focus or the surrounding page.
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [turns, typing]);

  function send(text, quickIntent) {
    const trimmed = text.trim();
    if (!trimmed || busy.current || !ready) return;
    const intent = quickIntent || interpretMessage(trimmed, opcionActiva);
    const at = new Date().toISOString();
    const turn = { text: safeUserText(trimmed), intent, at, replyAt: new Date(Date.now() + 450).toISOString() };
    busy.current = true;
    setTurns(previous => [...previous, turn].slice(-MAX_TURNS));
    setDraft("");
    setTyping(true);
    timer.current = setTimeout(() => { busy.current = false; setTyping(false); }, 450);
    input.current?.focus({ preventScroll: true });
  }

  function clearHistory() {
    clearTimeout(timer.current);
    busy.current = false;
    setTyping(false);
    setTurns([]);
    setDraft("");
    input.current?.focus({ preventScroll: true });
  }

  return (
    <Container className="vitalix-page">
      {!embedded && <section className="vitalix-heading" aria-labelledby="vitalixTitle">
        <span className="vitalix-brand-icon" aria-hidden="true">
          <i className="fa-solid fa-heart-pulse" />
        </span>
        <div>
          <span className="vitalix-eyebrow">ASISTENTE DE ACCESO Y CUENTAS</span>
          <h1 id="vitalixTitle">VITALIX</h1>
          <p>Orientación clara y segura para acceder a tu cuenta de SaludClick.</p>
        </div>
        <span className="vitalix-status">
          <i aria-hidden="true" />
          Asistente virtual
        </span>
      </section>}

      <div className="vitalix-shell">
        <details className="vitalix-shortcuts" open={embedded ? undefined : true}>
          <summary>Accesos rápidos · 5 opciones</summary>
        <nav className="vitalix-menu" aria-label="Opciones de ayuda de VITALIX">
          <div className="vitalix-menu-heading">
            <span className="vitalix-eyebrow">¿CÓMO PODEMOS AYUDARTE?</span>
            <h2>Elige una opción</h2>
          </div>
          <div className="vitalix-menu-options">
            {OPCIONES.map((opcion) => (
              <button
                className={`vitalix-option ${opcionActiva === opcion.id ? "is-active" : ""}`}
                type="button"
                key={opcion.id}
                data-vitalix-option={opcion.id}
                aria-pressed={opcionActiva === opcion.id}
                disabled={!ready || typing}
                onClick={() => send(opcion.label, opcion.id)}
              >
                <i className={`fa-solid ${opcion.icon}`} aria-hidden="true" />
                <span>{opcion.label}</span>
                <i className="fa-solid fa-chevron-right vitalix-option-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className="vitalix-menu-footnote">
            No compartas contraseñas, tokens, cédulas ni datos sensibles.
          </p>
        </nav>
        </details>

        <section
          className="vitalix-conversation"
          aria-label="Conversación de soporte con VITALIX"
        >
          <p className="vitalix-mode">Asistente de respuestas programadas · Acceso y cuentas</p>
          <div className="vitalix-transcript" ref={log} role="log" aria-label="Mensajes de VITALIX" aria-live="polite" aria-relevant="additions text" tabIndex={0}>
          <div className="vitalix-welcome">
            <span className="vitalix-welcome-icon" aria-hidden="true">
              <i className="fa-solid fa-comments" />
            </span>
            <div>
              <strong>Hola, soy VITALIX</strong>
              <p>Escribe tu pregunta o selecciona un acceso rápido. No puedo enviar solicitudes ni consultar aprobaciones.</p>
            </div>
          </div>
          {turns.map((turn, index) => (
            <div className="vitalix-turn" key={`${turn.at}-${index}`} role="group" aria-label="Intercambio de mensajes">
              <div className="vitalix-message vitalix-message-user">
                <span>{turn.text}</span>
                <Hora at={turn.at} />
              </div>
              {!(typing && index === turns.length - 1) && <Respuesta respuesta={RESPUESTAS[turn.intent]} at={turn.replyAt} />}
            </div>
          ))}
          {typing && <p className="vitalix-typing" role="status">VITALIX está escribiendo...</p>}
          </div>
          <form className="vitalix-composer" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
            <label className="vitalix-input-label" htmlFor={embedded ? "vitalix-widget-input" : "vitalix-page-input"}>Mensaje para VITALIX</label>
            <input ref={input} id={embedded ? "vitalix-widget-input" : "vitalix-page-input"}
              type="text" placeholder="Escribe tu mensaje..." value={draft} maxLength={1000}
              autoComplete="off" disabled={!ready} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!event.nativeEvent.isComposing) send(draft);
                }
              }} />
            <button type="submit" aria-label="Enviar mensaje" disabled={!ready || typing || !draft.trim()}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 18 9-18 9 4-9-4-9Z M7 12h14" /></svg>
            </button>
          </form>
          <p className="vitalix-disclaimer">
            {storageUnavailable ? "El historial solo estará disponible mientras esta página siga abierta." : "Historial temporal en esta pestaña (hasta 40 intercambios). No se envía a servicios de IA."}
          </p>
          <button type="button" className="vitalix-clear" onClick={clearHistory}>Borrar conversación</button>
          <AdministrativeSupport />
        </section>
      </div>
    </Container>
  );
}

export default Chat;
