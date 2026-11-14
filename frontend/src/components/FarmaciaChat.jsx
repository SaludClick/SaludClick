import React, { useCallback, useEffect, useRef, useState } from 'react';
import { farmaciaReturnUrl } from '../../public/js/farmacia-context.js';
import { logout } from '../../public/js/auth.js';
import '../styles/farmacia-chat.css';

const apiBase = () => (window.SALUDCLICK_API_URL || '').replace(/\/+$/, '');
const getToken = () => sessionStorage.getItem('saludclick_token') || localStorage.getItem('saludclick_token');
function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('saludclick_user') || localStorage.getItem('saludclick_user') || 'null'); }
  catch { return null; }
}
async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiBase()}/api/${path}`, {
    ...options, headers: { Authorization: `Bearer ${getToken()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { window.location.href = '/login.html'; throw new Error('Tu sesión expiró.'); }
  if (!response.ok || data.ok === false) throw new Error(data.mensaje || 'No se pudo completar la operación.');
  return data;
}
let socketScript;
function loadSocketClient() {
  if (typeof window.io === 'function') return Promise.resolve(window.io);
  if (!socketScript) socketScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${apiBase()}/socket.io/socket.io.js`;
    script.onload = () => {
      if (typeof window.io === 'function') resolve(window.io);
      else { script.remove(); reject(new Error('El chat en tiempo real no está disponible.')); }
    };
    script.onerror = () => { script.remove(); reject(new Error('No se pudo conectar el chat.')); };
    document.head.appendChild(script);
  }).catch(error => { socketScript = null; throw error; });
  return socketScript;
}
const displayDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

export default function FarmaciaChat() {
  const user = getCurrentUser();
  const role = Number(user?.rol_id ?? user?.rol);
  const allowed = !!getToken() && [2, 3].includes(role);
  const isStaff = role === 3;
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [sendError, setSendError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [notice, setNotice] = useState('');
  const [socketAttempt, setSocketAttempt] = useState(0);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const socketRef = useRef(null);
  const activeId = useRef(null);
  const sendingRef = useRef(false);
  const hasConnected = useRef(false);
  const drafts = useRef(new Map());
  const listSequence = useRef(0);
  const noticeTimer = useRef(null);
  const sendTimer = useRef(null);
  const endRef = useRef(null);
  activeId.current = active?.id;
  const params = new URLSearchParams(window.location.search);
  const returnTo = farmaciaReturnUrl(params.get('volver'));

  const loadConversations = useCallback(async () => {
    if (!allowed) return;
    const sequence = ++listSequence.current;
    setListLoading(true); setListError('');
    try {
      let result = await apiFetch('chat/conversaciones');
      if (!isStaff && !result.conversaciones.length) {
        const created = await apiFetch('chat/conversaciones', { method: 'POST', body: '{}' });
        result = { conversaciones: [created.conversacion] };
      }
      if (sequence !== listSequence.current) return;
      setConversations(result.conversaciones);
      const requested = Number(new URLSearchParams(window.location.search).get('conversacion'));
      setActive(current => result.conversaciones.find(c => c.id === current?.id) || result.conversaciones.find(c => c.id === requested) || result.conversaciones[0] || null);
    } catch (error) { if (sequence === listSequence.current) setListError(error.message); }
    finally { if (sequence === listSequence.current) setListLoading(false); }
  }, [allowed, isStaff]);

  useEffect(() => { loadConversations(); return () => { listSequence.current++; }; }, [loadConversations]);
  useEffect(() => {
    if (!allowed) window.location.replace(getToken() && role === 1 ? '/pages/admin.html' : getToken() && role === 4 ? '/pages/eps.html' : '/login.html');
  }, [allowed, role]);
  useEffect(() => {
    if (!allowed) return;
    let disposed = false;
    setConnection('connecting'); setConnectionError('');
    loadSocketClient().then(io => {
      if (disposed) return;
      const socket = io(apiBase() || window.location.origin, { auth: { token: getToken() }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;
      socket.on('connect', () => {
        if (!disposed) {
          setConnection('online'); setConnectionError('');
          if (hasConnected.current) loadConversations();
          hasConnected.current = true;
        }
      });
      socket.on('disconnect', () => { if (!disposed) setConnection('offline'); });
      socket.on('connect_error', () => { if (!disposed) { setConnection('offline'); setConnectionError('No se pudo conectar el chat. Puedes conservar tu borrador y reintentar.'); } });
      socket.on('chat:notification', () => {
        if (disposed) return;
        setNotice('Tienes un mensaje nuevo.'); clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(''), 4500); loadConversations();
      });
      socket.on('chat:message', message => {
        if (!disposed && Number(message.conversacion_id) === Number(activeId.current)) {
          setMessages(previous => previous.some(m => m.id === message.id) ? previous : [...previous, message]);
        }
      });
      socket.on('chat:status', ({ estado }) => {
        if (!disposed) setMessages(previous => previous.map(m => m.remitente_id !== Number(user?.id) ? { ...m, estado } : m));
      });
    }).catch(error => { if (!disposed) { setConnection('offline'); setConnectionError(error.message); } });
    return () => { disposed = true; socketRef.current?.disconnect(); clearTimeout(noticeTimer.current); };
  }, [allowed, loadConversations, socketAttempt, user?.id]);

  useEffect(() => {
    setMessages([]); setHistoryError(''); setSendError('');
    setText(drafts.current.get(active?.id) || '');
    if (active) {
      const url = new URL(window.location.href); url.searchParams.set('conversacion', String(active.id));
      history.replaceState(null, '', url);
    }
  }, [active?.id]);
  useEffect(() => {
    if (!active?.id || !allowed) return;
    let cancelled = false;
    setHistoryLoading(true); setHistoryError('');
    apiFetch(`chat/conversaciones/${active.id}/mensajes`).then(({ messages: history }) => {
      if (!cancelled) setMessages(previous => {
        const merged = new Map(history.map(m => [m.id, m]));
        previous.forEach(m => { if (!merged.has(m.id)) merged.set(m.id, m); });
        return [...merged.values()];
      });
    }).catch(error => { if (!cancelled) setHistoryError(error.message); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    const socket = socketRef.current;
    if (connection === 'online' && socket?.connected) socket.emit('chat:join', active.id, result => {
      if (!cancelled && !result?.ok) setHistoryError(result?.mensaje || 'No se pudo abrir la conversación.');
    });
    return () => { cancelled = true; if (socket?.connected) socket.emit('chat:leave', active.id); };
  }, [active?.id, allowed, connection, historyAttempt]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);
  useEffect(() => () => clearTimeout(sendTimer.current), []);

  function sendMessage(event) {
    event.preventDefault();
    const contenido = text.trim();
    if (!contenido || !active || !socketRef.current?.connected || historyLoading || historyError || sendingRef.current) return;
    sendingRef.current = true; setSending(true); setSendError('');
    const conversationId = active.id;
    let finished = false;
    const finish = result => {
      if (finished) return; finished = true; clearTimeout(sendTimer.current);
      sendingRef.current = false; setSending(false);
      if (!result?.ok) setSendError(result?.mensaje || 'No se pudo confirmar el envío. Revisa el historial antes de reenviar.');
      else { drafts.current.delete(conversationId); setText(''); loadConversations(); }
    };
    sendTimer.current = setTimeout(() => finish({ ok: false }), 10000);
    socketRef.current.emit('chat:send', { conversationId, contenido }, finish);
  }
  const participantName = conversation => {
    const person = isStaff ? conversation.cliente : conversation.agente;
    return person ? `${person.nombre} ${person.apellido}` : 'Equipo de farmacia';
  };
  if (!allowed) return <p role="status">Verificando acceso al chat…</p>;
  return <div className="farmacia-chat-module">
    <nav className="farmacia-chat-nav" aria-label={isStaff ? 'Secciones de farmacia' : 'Navegación del chat'}>
      <a className="farmacia-chat-brand" href={isStaff ? returnTo : '/pages/dashboard.html'}>SaludClick · {isStaff ? 'Farmacia' : 'Mi cuenta'}</a>
      {isStaff ? <><a href={farmaciaReturnUrl(returnTo, '#panelFarmacia')}>Panel</a><a href={farmaciaReturnUrl(returnTo, '#pedidosFarmacia')}>Pedidos</a><a href={farmaciaReturnUrl(returnTo, '#inventarioFarmacia')}>Inventario</a></> : <a href="/pages/dashboard.html">Mi panel</a>}
      <a href={window.location.pathname + window.location.search} aria-current="page">Chat</a>
      <a href="/pages/perfil.html">Perfil</a>
      <button type="button" onClick={logout}>Cerrar sesión</button>
    </nav>
    <main className="chat-page">
      <header className="chat-heading"><div><p className="chat-eyebrow">ATENCIÓN SALUDCLICK</p><h1>{isStaff ? 'Chat con pacientes' : 'Chat con farmacia'}</h1><p>{isStaff ? 'Atiende conversaciones autorizadas y conserva el contexto de tu operación.' : 'Consulta al equipo de farmacia.'}</p></div>
        <span role="status" className={`chat-connection ${connection}`}>{connection === 'online' ? 'En línea' : connection === 'offline' ? 'Sin conexión' : 'Conectando…'}</span>
      </header>
      {connection !== 'online' && <div className="chat-notice" role="status">{connectionError || 'Los mensajes se enviarán cuando haya conexión.'} <button type="button" onClick={() => setSocketAttempt(n => n + 1)}>Reconectar</button></div>}
      {notice && <p className="chat-notice" role="status">{notice}</p>}
      <section className="chat-shell" aria-label="Mensajería de farmacia">
        {isStaff && <aside className="chat-list" aria-label="Conversaciones" aria-busy={listLoading}>
          <h2>Conversaciones</h2><button type="button" onClick={loadConversations} disabled={listLoading}>Actualizar conversaciones</button>
          {listLoading && <p role="status">Cargando conversaciones…</p>}
          {listError && <p className="chat-error" role="alert">{listError}</p>}
          {!listLoading && !listError && !conversations.length && <p className="chat-empty-list">No hay conversaciones disponibles.</p>}
          {conversations.map(conversation => <button type="button" key={conversation.id} className={`chat-list-item ${active?.id === conversation.id ? 'selected' : ''}`} aria-pressed={active?.id === conversation.id} disabled={sending} onClick={() => setActive(conversation)}><strong>{participantName(conversation)}</strong><small>{conversation.agente ? 'Asignada' : 'Pendiente de atención'} · {conversation.mensajes[0]?.contenido || 'Sin mensajes'}</small></button>)}
        </aside>}
        <div className="chat-window">
          <div className="chat-window-header"><strong>{active ? participantName(active) : 'Selecciona una conversación'}</strong></div>
          {!isStaff && listLoading && <p role="status">Cargando conversación…</p>}
          {!isStaff && listError && <p className="chat-error" role="alert">{listError} <button type="button" onClick={loadConversations}>Reintentar</button></p>}
          <div className="chat-messages" aria-live="polite" aria-busy={historyLoading}>
            {historyLoading && <p role="status">Cargando mensajes…</p>}
            {historyError && <p className="chat-error" role="alert">{historyError} <button type="button" onClick={() => setHistoryAttempt(n => n + 1)}>Reintentar mensajes</button></p>}
            {!historyLoading && !historyError && !messages.length && <p className="chat-welcome">{active ? 'Esta conversación todavía no tiene mensajes.' : 'Selecciona una conversación disponible para comenzar.'}</p>}
            {messages.map(message => <article key={message.id} className={`chat-bubble ${message.remitente_id === Number(user?.id) ? 'mine' : 'theirs'}`}><p>{message.contenido}</p><footer><time>{displayDate(message.created_at)}</time>{message.remitente_id === Number(user?.id) && <span>{message.estado}</span>}</footer></article>)}
            <div ref={endRef} />
          </div>
          {sendError && <p className="chat-error" role="alert">{sendError}</p>}
          <form className="chat-composer" onSubmit={sendMessage}>
            <label htmlFor="chatMessage">Mensaje</label>
            <textarea id="chatMessage" value={text} onChange={event => { setText(event.target.value); drafts.current.set(active?.id, event.target.value); }} maxLength={2000} placeholder="Escribe tu mensaje…" rows={3} disabled={!active || sending} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
            <small>{text.length}/2000 · Mayús + Enter para otra línea</small>
            <button type="submit" disabled={!text.trim() || connection !== 'online' || !active || historyLoading || !!historyError || sending} aria-label="Enviar mensaje">{sending ? 'Enviando…' : 'Enviar'}</button>
          </form>
        </div>
      </section>
      <p className="chat-privacy">No compartas información sensible de salud en el chat.</p>
    </main>
  </div>;
}
