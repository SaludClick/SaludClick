import { apiFetch } from './api.js';
import { checkAuthGuard, getCurrentUser, getToken } from './auth.js';
import { rolUsuario, ROLES } from './roles.js';

let socketClient;
async function connectNotifications(invalidate, status) {
    const base = (window.SALUDCLICK_API_URL || '').replace(/\/+$/, '');
    if (!window.io) {
        if (!socketClient) socketClient = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${base}/socket.io/socket.io.js`;
            script.onload = () => window.io ? resolve() : reject(new Error('Socket.IO no disponible.'));
            script.onerror = () => { script.remove(); reject(new Error('No se pudo conectar.')); };
            document.head.append(script);
        }).catch(error => { socketClient = null; throw error; });
        await socketClient;
    }
    const socket = window.io(`${base}/farmacia-notificaciones`, { auth: callback => callback({ token: getToken() }) });
    socket.on('connect', () => { status(true); invalidate(); });
    socket.on('disconnect', () => status(false));
    socket.on('connect_error', () => status(false));
    socket.on('farmacia:notificaciones:actualizadas', invalidate);
    return () => socket.disconnect();
}

// Dependencies are injectable for isolated DOM tests; production always uses the API.
export function initFarmaciaNotifications({ root = document, request = apiFetch, connect = connectNotifications } = {}) {
    const byId = id => root.getElementById(id);
    const list = byId('farmaciaNotificationsList');
    if (!list) return null;
    const filter = byId('farmaciaNotificationsState');
    const status = byId('farmaciaNotificationsStatus');
    const previous = byId('farmaciaNotificationsPrevious');
    const next = byId('farmaciaNotificationsNext');
    const readAll = byId('farmaciaReadAll');
    const refreshButton = byId('farmaciaNotificationsRefresh');
    const bell = byId('farmaciaNotificationsBell');
    let page = 1, pages = 0, unread = null, sequence = 0, busy = false, writing = false;
    let disposed = false, stopSocket, connecting = false, live = false, timer;
    const subscriptions = [];
    const listen = (target, event, fn) => { target.addEventListener(event, fn); subscriptions.push(() => target.removeEventListener(event, fn)); };
    const node = (tag, text, className) => {
        const result = root.createElement(tag);
        result.textContent = text;
        if (className) result.className = className;
        return result;
    };
    const say = (text, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
    function badge(value) {
        unread = value;
        byId('farmaciaNotificationsBadge').textContent = value === null ? '—' : value > 99 ? '99+' : String(value);
        bell.setAttribute('aria-label', value === null ? 'Notificaciones de farmacia. Contador no disponible.' : `Notificaciones de farmacia: ${value} no leídas.`);
    }
    function controls() {
        previous.disabled = busy || writing || page <= 1;
        next.disabled = busy || writing || page >= pages;
        readAll.disabled = busy || writing || !unread;
        refreshButton.disabled = busy || writing;
        filter.disabled = writing;
        for (const button of list.querySelectorAll('button')) button.disabled = busy || writing;
    }
    async function startLive() {
        if (connecting || stopSocket || disposed) return;
        connecting = true;
        try {
            const stop = await connect(schedule, value => { live = value; });
            if (disposed) stop(); else stopSocket = stop;
        } catch { live = false; }
        finally { connecting = false; }
    }
    async function load() {
        if (disposed) return;
        const current = ++sequence;
        busy = true; controls(); list.setAttribute('aria-busy', 'true');
        say('Cargando notificaciones…');
        try {
            const query = new URLSearchParams({ pagina: String(page), tamano: '20', estado: filter.value });
            const result = await request(`/api/farmacia/notificaciones?${query}`);
            if (disposed || current !== sequence) return;
            pages = result.paginacion.paginas;
            if (page > Math.max(1, pages)) { page = Math.max(1, pages); return await load(); }
            list.replaceChildren();
            for (const notification of result.notificaciones) {
                const item = node('li', '', 'farmacia-notification');
                item.dataset.unread = String(!notification.leida_at);
                item.append(node('h3', notification.titulo), node('p', notification.mensaje));
                const meta = node('div', '', 'farmacia-notification-meta');
                const type = ['NUEVA_SOLICITUD', 'SOLICITUD_ESTADO'].includes(notification.tipo) ? 'Solicitud' : 'Medicamento';
                const time = node('time', new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(notification.created_at)));
                time.dateTime = notification.created_at;
                meta.append(node('span', type), time, node('span', notification.leida_at ? 'Leída' : 'No leída'));
                item.append(meta);
                if(notification.solicitud){
                    item.append(node('p',`Paciente: ${notification.solicitud.paciente}`),node('p',`Solicitud #${notification.solicitud.id} · ${new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(notification.solicitud.fecha))}`));
                }
                if (notification.solicitud) {
                    const link = node('a', 'Ver solicitud autorizada');
                    link.href = '/pages/farmacia-solicitudes.html?id=' + encodeURIComponent(notification.solicitud.id);
                    item.append(link);
                }
                if (notification.medicamento) {
                    const link = node('a', 'Ver medicamento');
                    const page = notification.medicamento.origen === 'inventario' ? 'inventario' : 'medicamentos';
                    link.href = '/pages/farmacia-' + page + '.html?id=' + encodeURIComponent(notification.medicamento.id);
                    item.append(link);
                }
                if (!notification.leida_at) {
                    const button = node('button', 'Marcar como leída'); button.type = 'button';
                    button.setAttribute('aria-label', `Marcar como leída: ${notification.titulo}`);
                    button.addEventListener('click', () => mark(`/api/farmacia/notificaciones/${notification.id}/leida`));
                    item.append(button);
                }
                list.append(item);
            }
            badge(result.noLeidas);
            byId('farmaciaNotificationsPage').textContent = `${result.paginacion.total} notificaciones · Página ${page} de ${Math.max(1, pages)}`;
            say(result.notificaciones.length ? (live ? 'Notificaciones actualizadas en tiempo real.' : 'Notificaciones actualizadas. Se revisarán periódicamente.') : filter.value === 'todas' ? 'No tienes notificaciones.' : filter.value === 'leidas' ? 'No tienes notificaciones leídas.' : 'No tienes notificaciones sin leer.');
            void startLive();
        } catch (error) {
            if (disposed || current !== sequence) return;
            list.replaceChildren(); pages = 0; badge(null);
            byId('farmaciaNotificationsPage').textContent = '';
            say(error.status === 503 ? 'Las notificaciones aún no están disponibles. Puedes seguir usando el panel de farmacia.' : error.message || 'No se pudieron cargar las notificaciones.', true);
        } finally {
            if (!disposed && current === sequence) { busy = false; list.setAttribute('aria-busy', 'false'); controls(); }
        }
    }
    async function mark(path) {
        if (writing || disposed) return;
        writing = true; controls();
        try {
            await request(path, { method: 'PATCH', body: '{}' });
            await load();
        } catch (error) { if (!disposed) say(error.message || 'No se pudo marcar la notificación.', true); }
        finally { writing = false; if (!disposed) controls(); }
    }
    function schedule() {
        if (disposed) return;
        clearTimeout(timer);
        timer = setTimeout(() => { if (!writing) void load(); }, 150);
    }
    listen(byId('farmaciaNotificationsFilter'), 'submit', event => { event.preventDefault(); page = 1; void load(); });
    listen(filter, 'change', () => { page = 1; void load(); });
    listen(previous, 'click', () => { if (page > 1) { page--; void load(); } });
    listen(next, 'click', () => { if (page < pages) { page++; void load(); } });
    listen(readAll, 'click', () => mark('/api/farmacia/notificaciones/leer-todas'));
    listen(bell, 'click', event => { event.preventDefault(); byId('farmaciaNotificationsTitle').focus(); schedule(); });
    const onFocus = () => { if (!root.hidden) schedule(); };
    listen(window, 'focus', onFocus);
    listen(root, 'visibilitychange', onFocus);
    const poll = setInterval(() => { if (!root.hidden && !writing && !busy) void load(); }, 60000);
    function dispose() {
        disposed = true; sequence++; clearTimeout(timer); clearInterval(poll);
        stopSocket?.(); subscriptions.forEach(remove => remove());
    }
    listen(window, 'pagehide', dispose);
    void load();
    return { refresh: load, dispose };
}

export async function initFarmaciaBell() {
    const badge=document.getElementById('farmaciaNotificationsBadge'),bell=document.getElementById('farmaciaNotificationsBell');
    let busy=false,disposed=false,stop;
    async function refresh(){if(busy||disposed)return;busy=true;try{const {noLeidas}=await apiFetch('/api/farmacia/notificaciones/no-leidas/count');if(!Number.isInteger(noLeidas)||noLeidas<0)throw new Error();badge.textContent=noLeidas>99?'99+':String(noLeidas);bell.setAttribute('aria-label',`Notificaciones de farmacia: ${noLeidas} no leídas.`);}catch{badge.textContent='—';bell.setAttribute('aria-label','Notificaciones de farmacia. Contador no disponible.');}finally{busy=false;}}
    await refresh();
    try{stop=await connectNotifications(()=>{void refresh();document.dispatchEvent(new Event('farmacia:solicitudes-actualizadas'));},()=>{});}catch{}
    const poll=setInterval(()=>{if(!document.hidden)void refresh();},60000);
    window.addEventListener('pagehide',()=>{disposed=true;clearInterval(poll);stop?.();},{once:true});
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('farmaciaApp') && checkAuthGuard() && rolUsuario(getCurrentUser()) === ROLES.FARMACIA) initFarmaciaNotifications();
});
