import { getToken, logout } from './auth.js';

const API_BASE = (window.SALUDCLICK_API_URL || '').replace(/\/+$/, '');

export function apiUrl(path) {
    const route = String(path || '');
    return `${API_BASE}${route.startsWith('/api/') ? route : `/api/${route.replace(/^\/+/, '')}`}`;
}

export async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response;
    try {
        response = await fetch(/^https?:\/\//i.test(url) ? url : apiUrl(url), { ...options, headers });
    } catch {
        throw new Error('No fue posible conectar con el servidor. Verifica que la API esté disponible.');
    }
    let data = null;
    try { data = await response.json(); } catch { data = {}; }
    if (response.status === 401) { logout(); throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
    if (!response.ok || data.ok === false) throw new Error(data.mensaje || 'No se pudo completar la operación.');
    return data;
}
