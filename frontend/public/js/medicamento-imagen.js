import { apiUrl } from './api.js';

export const imagenPredeterminada = '/images/medicamentos/default.svg';

export function enlaceImagen(raw) {
    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/\.$/, '');
        if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
            host.includes('.') && !/^\d+\./.test(host) && !host.includes(':') &&
            !/\.(local|localhost|internal|test|invalid)$/.test(host) && url.href.length <= 255) {
            return url.href;
        }
    } catch {}
    return null;
}

export function imagenSegura(raw) {
    if (typeof raw !== 'string') return imagenPredeterminada;
    if (/^\/api\/medicamentos\/fotos\/[1-9]\d{0,9}-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.webp$/.test(raw)) return apiUrl(raw);
    return enlaceImagen(raw) ||
        (/^\/images\/[a-z0-9/_%.()-]+\.[a-z0-9]+$/i.test(raw) && !/\.\.|%2e|%2f|%5c/i.test(raw)
            ? raw : imagenPredeterminada);
}
