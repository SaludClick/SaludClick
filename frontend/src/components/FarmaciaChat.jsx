import React, { useCallback, useEffect, useRef, useState } from "react";
import "../styles/chat.css";

const apiBase = () => (window.SALUDCLICK_API_URL || "").replace(/\/+$/, "");
const getToken = () => typeof window === "undefined" ? null : sessionStorage.getItem("saludclick_token") || localStorage.getItem("saludclick_token");
const getCurrentUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    const value = sessionStorage.getItem('saludclick_user') || localStorage.getItem('saludclick_user');
    return value ? JSON.parse(value) : null;
  } catch { return null; }
};
async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${getToken()}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBase()}/api/${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { window.location.href = "/login.html"; throw new Error("Tu sesión expiró. Inicia sesión nuevamente."); }
  if (!response.ok || data.ok === false) throw new Error(data.mensaje || "No se pudo completar la operación.");
  return data;
}
let socketScript;
function loadSocketClient() {
  if (window.io) return Promise.resolve(window.io);
  if (!socketScript) socketScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${apiBase()}/socket.io/socket.io.js`;
    script.onload = () => resolve(window.io);
    script.onerror = () => reject(new Error("No fue posible conectar el chat en tiempo real."));
    document.head.appendChild(script);
  });
  return socketScript;
}
const displayDate = (date) => new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(date));

function FarmaciaChat() {
  const user = getCurrentUser();
  const role = Number(user?.rol_id ?? user?.rol);
  const allowed = !!getToken() && [2, 3].includes(role);
  const isStaff = Number(user?.rol ?? user?.rol_id) === 3;
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const endRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!allowed) return;
    try {
      let result = await apiFetch("chat/conversaciones");
      if (!isStaff && !result.conversaciones.length) {
        const created = await apiFetch("chat/conversaciones", { method: "POST", body: JSON.stringify({}) });
        result = { conversaciones: [created.conversacion] };
      }
      setConversations(result.conversaciones);
      if (result.conversaciones[0]) setActive((current) => current || result.conversaciones[0]);
    } catch (e) { setError(e.message); }
  }, [isStaff, allowed]);

  useEffect(() => { loadConversations(); }, []);

  useEffect(() => {
    if (!allowed) window.location.replace(getToken() && role === 1 ? '/pages/admin.html' : getToken() && role === 4 ? '/pages/eps.html' : '/login.html');
  }, [allowed, role]);

  useEffect(() => {
    if (!allowed) return;
    let disposed = false;
    loadSocketClient().then((io) => {
      if (disposed) return;
      const socket = io(apiBase() || window.location.origin, { auth: { token: getToken() }, transports: ["websocket", "polling"] });
      socketRef.current = socket;
      socket.on("connect", () => { setConnected(true); setError(""); });
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", (e) => setError(e.message || "No fue posible conectar el chat."));
      socket.on("chat:notification", () => { setNotice("Tienes un mensaje nuevo."); window.setTimeout(() => setNotice(""), 4500); loadConversations(); });
      socket.on("chat:message", (message) => setMessages((previous) => previous.some((m) => m.id === message.id) ? previous : [...previous, message]));
      socket.on("chat:status", ({ estado }) => setMessages((previous) => previous.map((message) => message.remitente_id !== Number(user?.id) ? { ...message, estado } : message)));
    }).catch((e) => setError(e.message));
    return () => { disposed = true; socketRef.current?.disconnect(); };
  }, [loadConversations, allowed]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    apiFetch(`chat/conversaciones/${active.id}/mensajes`).then(({ messages: history, conversation }) => { if (!cancelled) { setMessages(history); if (isStaff && conversation) setActive((current) => current?.id === conversation.id && current?.agente?.id === conversation.agente?.id ? current : conversation); } }).catch((e) => setError(e.message));
    const socket = socketRef.current;
    if (socket?.connected) socket.emit("chat:join", active.id, (result) => {
      if (result?.ok && !cancelled) setMessages((previous) => result.mensajes.length >= previous.length ? result.mensajes : previous);
    });
    return () => { cancelled = true; if (socket) socket.emit("chat:leave", active.id); };
  }, [active, connected]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function sendMessage(event) {
    event.preventDefault();
    const contenido = text.trim();
    if (!contenido || !active || !socketRef.current?.connected) return;
    socketRef.current.emit("chat:send", { conversationId: active.id, contenido }, (result) => {
      if (!result?.ok) setError(result?.mensaje || "No se pudo enviar el mensaje.");
      else { setText(""); setError(""); loadConversations(); }
    });
  }

  const participantName = (conversation) => {
    const person = isStaff ? conversation.cliente : conversation.agente;
    return person ? `${person.nombre} ${person.apellido}` : (isStaff ? "Nueva conversación" : "Equipo de farmacia");
  };

  return <main className="chat-page"><header className="chat-heading"><div><span className="chat-eyebrow">ATENCIÓN SALUDCLICK</span><h1>Chat con farmacia</h1><p>Resuelve tus dudas directamente con nuestro equipo.</p></div><span className={`chat-connection ${connected ? "online" : ""}`}><i />{connected ? "En línea" : "Conectando"}</span></header>
    {notice && <div className="chat-notice" role="status"><i className="fa-solid fa-bell" />{notice}</div>}
    {error && <div className="chat-error" role="alert">{error}</div>}
    <section className="chat-shell">
      {isStaff && <aside className="chat-list"><h2>Conversaciones asignadas</h2>{conversations.length ? conversations.map((conversation) => <button key={conversation.id} className={`chat-list-item ${active?.id === conversation.id ? "selected" : ""}`} onClick={() => { setActive(conversation); setMessages([]); }}><span className="chat-avatar"><i className="fa-solid fa-user" /></span><span className="chat-list-copy"><strong>{participantName(conversation)}</strong><small>{conversation.mensajes[0]?.contenido || "Iniciar conversación"}</small></span><i className="fa-solid fa-chevron-right" /></button>) : <p className="chat-empty-list">No hay conversaciones pendientes.</p>}</aside>}
      <div className="chat-window"><div className="chat-window-header"><span className="chat-avatar"><i className="fa-solid fa-headset" /></span><div><strong>{active ? participantName(active) : "Equipo de farmacia"}</strong><small>{active?.agente ? "Personal de farmacia" : "Te atenderemos pronto"}</small></div></div>
        <div className="chat-messages" aria-live="polite">{messages.length ? messages.map((message) => <article key={message.id} className={`chat-bubble ${message.remitente_id === Number(user?.id) ? "mine" : "theirs"}`}><p>{message.contenido}</p><footer><time dateTime={message.created_at}>{displayDate(message.created_at)}</time>{message.remitente_id === Number(user?.id) && <span title={message.estado}>{message.estado === "LEIDO" ? "✓✓" : message.estado === "ENTREGADO" ? "✓✓" : "✓"}</span>}</footer></article>) : <div className="chat-welcome"><span><i className="fa-solid fa-comments" /></span><h2>{active ? "Esta conversación está lista" : "Estamos aquí para ayudarte"}</h2><p>Escribe tu consulta y el equipo de farmacia te responderá.</p></div>}<div ref={endRef} /></div>
        <form className="chat-composer" onSubmit={sendMessage}><label className="sr-only" htmlFor="chatMessage">Escribe tu mensaje</label><textarea id="chatMessage" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Escribe tu mensaje..." rows={1} disabled={!active} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} /><span className="chat-char-count">{text.length}/2000</span><button type="submit" disabled={!text.trim() || !connected || !active} aria-label="Enviar mensaje"><i className="fa-solid fa-paper-plane" /></button></form>
      </div>
    </section><p className="chat-privacy"><i className="fa-solid fa-lock" /> No compartas información sensible de salud en el chat.</p>
  </main>;
}

export default FarmaciaChat;
