import { getToken, logout } from './auth.js';

export async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch { data = {}; }
    if (response.status === 401) { logout(); throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
    if (!response.ok || data.ok === false) throw new Error(data.mensaje || 'No se pudo completar la operación.');
    return data;
}
