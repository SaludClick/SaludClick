import { getCurrentUser, getToken } from './auth.js';
import { STORAGE_KEY } from './pedido-temporal.js';

function claveCarrito() {
    const id = Number(getCurrentUser()?.id);
    return getToken() && Number.isSafeInteger(id) && id > 0 ? STORAGE_KEY + ':' + id : null;
}

export const carritoSesion = {
    getItem() {
        const key = claveCarrito();
        return key ? localStorage.getItem(key) : null;
    },
    setItem(_key, value) {
        const key = claveCarrito();
        if (!key) throw new Error('No se pudo identificar la cuenta del carrito.');
        localStorage.setItem(key, value);
    }
};

export function cambioDeCarrito(event) {
    return event.key === null || event.key === claveCarrito() ||
        event.key === 'saludclick_token' || event.key === 'saludclick_user';
}
