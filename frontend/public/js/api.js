import { getToken, logout } from './auth.js';

const API_BASE = (window.SALUDCLICK_API_URL || '').replace(/\/+$/, '');

export function apiUrl(path) {
    const route = String(path || '');
    return `${API_BASE}${route.startsWith('/api/') ? route : `/api/${route.replace(/^\/+/, '')}`}`;
}

export async function apiFetch(url, options = {}) {
    const expected = new URL(apiUrl('/api/health'), window.location.href);
    const target = new URL(/^https?:\/\//i.test(url) ? url : apiUrl(url), window.location.href);
    if (target.origin !== expected.origin || target.username || target.password) {
        throw new Error('La URL no pertenece a la API configurada.');
    }
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response;
    try {
        response = await fetch(target, { ...options, headers });
    } catch {
        throw new Error('No fue posible conectar con el servidor. Verifica que la API esté disponible.');
    }
    let data = null;
    try { data = await response.json(); } catch { data = {}; }
    if (response.status === 401) {
        if (!options.signal?.aborted && getToken() === token) logout();
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    }
    if (!response.ok || data.ok === false) {
        const error = new Error(data.mensaje || 'No se pudo completar la operación.');
        error.status = response.status;
        throw error;
    }
    return data;
}
