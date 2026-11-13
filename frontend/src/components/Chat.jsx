import { useEffect, useRef, useState } from "react";
import "../styles/chat.css";
import { HISTORY_KEY, MAX_TURNS, interpretMessage, readHistory, safeUserText } from "../lib/vitalix-engine.mjs";
import {useAdministrativeConversation} from '../hooks/useAdministrativeConversation.js';

const OPCIONES = [
  { id: "solicitar-cuenta", icon: "fa-user-plus", label: "Solicitar una cuenta" },
  { id: "estado-solicitud", icon: "fa-clipboard-check", label: "Consultar estado de solicitud" },
  { id: "problemas-login", icon: "fa-key", label: "Problemas para iniciar sesión" },
  { id: "contactar-admin", icon: "fa-comments", label: "Contactar con Administración" },
  { id: "faq-acceso", icon: "fa-circle-question", label: "Preguntas frecuentes sobre acceso" }
];

const HUMAN_REPLY = "¡Claro! Puedo comunicarte directamente con Administración de SaludClick. No necesitas iniciar sesión. Escribe aquí tu solicitud y podrás recibir la respuesta en este mismo chat.";
const RESPUESTAS = {
  saludo:{parrafos:["¡Hola! Soy VITALIX. Puedo orientarte sobre acceso y cuentas."]},
  gracias:{parrafos:["Con gusto. Puedes continuar escribiendo aquí."]},
  "aclarar-acceso":{parrafos:["¿Tienes una cuenta activa o esperas aprobación? No compartas tu clave."]},
  privacidad:{parrafos:["No compartas claves, tokens, documentos ni información sensible. Reformula tu pregunta sin esos datos."]},
  "fuera-alcance":{parrafos:["Para consultas médicas o farmacéuticas, contacta al profesional competente. Puedo orientarte sobre acceso y cuentas."]},
  "no-entendido":{parrafos:["¿Necesitas solicitar una cuenta, ayuda con el acceso o hablar con Administración? Escribe tu consulta aquí."]},
  "solicitar-cuenta":{titulo:"Solicitar una cuenta",parrafos:[HUMAN_REPLY,"El registro público sigue deshabilitado. Administración revisará tu solicitud desde este chat."]},
  "estado-solicitud":{titulo:"Consultar tu solicitud",parrafos:["Para consultar tu solicitud, elige Contactar con Administración y escribe aquí. La respuesta llegará a este chat."]},
  "problemas-login":{titulo:"Recuperar acceso",parrafos:["Revisa el correo de tu cuenta. Si olvidaste tu clave, utiliza la recuperación de acceso. Si necesitas ayuda de una persona, elige Contactar con Administración."],enlace:{texto:"Recuperar acceso",href:"/recuperar.html"}},
  "contactar-admin":{titulo:"Atención directa",parrafos:[HUMAN_REPLY]},
  "faq-acceso":{titulo:"Acceso y cuentas",parrafos:["El registro público está deshabilitado. Puedes solicitar una cuenta o atención humana escribiendo en este chat, sin iniciar sesión."]}
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

function Chat({ embedded = false, visible = true }) {
  const human=useAdministrativeConversation(visible);
  const Container = embedded ? "div" : "main";
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [ready, setReady] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const timer = useRef(null);
  const busy = useRef(false);
  const log = useRef(null);
  const input = useRef(null);
  const opcionActiva = turns.at(-1)?.intent;
  const canSend=ready&&!human.checking&&(!human.eligible||human.operational);
  const nearBottom=useRef(true);
  useEffect(()=>{if(human.enabled&&human.pendingContent)setDraft(old=>old||human.pendingContent);},[human.enabled,human.pendingContent]);

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
    if(!human.enabled||nearBottom.current)log.current?.scrollTo({ top: log.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [turns, typing,human.messages,human.enabled]);

  async function send(text, quickIntent) {
    const trimmed = text.trim();
    if (!trimmed || busy.current || !canSend) return;
    const intent = quickIntent || interpretMessage(trimmed, opcionActiva);
    if(human.enabled||(human.eligible&&['contactar-admin','solicitar-cuenta'].includes(intent))){
      busy.current=true;nearBottom.current=true;
      // Include only the latest relevant user context when handing over, never the full bot history.
      const previous=turns.at(-1);
      const context=!human.enabled&&previous&&!['saludo','gracias','privacidad','fuera-alcance'].includes(previous.intent)?`\n\nContexto del usuario: ${previous.text}`:'';
      const payload=(trimmed+context).slice(0,2000);
      setConfirmed(false);
      try{const sent=await human.send(payload);setConfirmed(sent);setDraft(old=>old.trim()===trimmed?(sent?'':payload):old);}finally{busy.current=false;input.current?.focus({preventScroll:true});}
      return;
    }
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
          {human.enabled?'Atención administrativa':'Asistente virtual'}
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
                disabled={!canSend||typing||human.sending}
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
          <p className="vitalix-mode">{human.enabled?`Chat con Administración · ${human.connected?'En tiempo real':'Sincronización automática'}`:'Asistente de respuestas programadas · Acceso y cuentas'}</p>
          <div className="vitalix-transcript" ref={log} role="log" aria-label="Mensajes de VITALIX" aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={()=>{const node=log.current;nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<80;}}>
          <div className="vitalix-welcome">
            <span className="vitalix-welcome-icon" aria-hidden="true">
              <i className="fa-solid fa-comments" />
            </span>
            <div>
              <strong>Hola, soy VITALIX</strong>
              <p>{human.enabled?HUMAN_REPLY:human.eligible?"Escribe tu pregunta o solicita una cuenta o atencion humana desde este chat.":"Escribe tu pregunta sobre acceso y cuentas."}</p>
            </div>
          </div>
          {human.enabled&&human.hasOlder&&<button type="button" className="vitalix-action" onClick={async()=>{const height=log.current.scrollHeight,top=log.current.scrollTop;nearBottom.current=false;await human.loadOlder();requestAnimationFrame(()=>{if(log.current)log.current.scrollTop=top+log.current.scrollHeight-height;});}}>Ver mensajes anteriores</button>}

          {turns.map((turn, index) => (
            <div className="vitalix-turn" key={`${turn.at}-${index}`} role="group" aria-label="Intercambio de mensajes">
              <div className="vitalix-message vitalix-message-user">
                <span>{turn.text}</span>
                <Hora at={turn.at} />
              </div>
              {!(typing && index === turns.length - 1) && <Respuesta respuesta={RESPUESTAS[turn.intent]} at={turn.replyAt} />}
            </div>
          ))}
          {human.enabled&&human.messages.map(message=><article key={message.id} data-vitalix-message={message.id} className={`vitalix-message ${(human.visitor?message.remitente_id===null:Number(message.remitente_id)===human.userId)?'vitalix-message-user':'vitalix-message-assistant'}`}><div className="vitalix-message-content"><strong className="vitalix-message-name">{Number(message.rol_id)===1?'Administración':message.nombre||'Tú'}</strong><p>{message.contenido}</p><time className="vitalix-time" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'})}</time></div></article>)}
          {human.enabled?human.sending&&<p className="vitalix-typing" role="status">Enviando a Administración…</p>:typing&&<p className="vitalix-typing" role="status">VITALIX está escribiendo...</p>}
          </div>
          <form className="vitalix-composer" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
            <label className="vitalix-input-label" htmlFor={embedded ? "vitalix-widget-input" : "vitalix-page-input"}>{human.enabled?'Mensaje para Administración':'Mensaje para VITALIX'}</label>
            <input ref={input} id={embedded ? "vitalix-widget-input" : "vitalix-page-input"}
              type="text" placeholder="Escribe tu mensaje..." value={draft} maxLength={human.enabled?2000:1000}
              autoComplete="off" disabled={!canSend} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!event.nativeEvent.isComposing) send(draft);
                }
              }} />
            <button type="submit" aria-label="Enviar mensaje" disabled={!canSend||typing||human.sending || !draft.trim()}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 18 9-18 9 4-9-4-9Z M7 12h14" /></svg>
            </button>
          </form>
          {confirmed&&<p role="status" className="vitalix-note">Mensaje guardado y enviado a Administración.</p>}
          <p className="vitalix-disclaimer">
            {human.enabled?'Los mensajes confirmados se guardan en tu conversación con Administración.':storageUnavailable ? "El historial solo estará disponible mientras esta página siga abierta." : "Historial temporal en esta pestaña (hasta 40 intercambios). No se envía a servicios de IA."}
          </p>
          {human.enabled?<><p className="vitalix-note" role="alert">{human.error}</p><button type="button" className="vitalix-clear" onClick={()=>human.sync()}>Actualizar conversación</button></>:<><button type="button" className="vitalix-clear" onClick={clearHistory}>Borrar conversación</button></>}
        </section>
      </div>
    </Container>
  );
}

export default Chat;
