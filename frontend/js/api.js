import { getToken, logout } from './auth.js';
import './config.js';
export const API_BASE_URL = (window.SALUDCLICK_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const apiUrl = /^https?:\/\//i.test(url) ? url : `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    const response = await fetch(apiUrl, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch { data = {}; }
    if (response.status === 401) { logout(); throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
    if (!response.ok || data.ok === false) throw new Error(data.mensaje || 'No se pudo completar la operación.');
    return data;
}
