import { PAGINAS_PRIVADAS, paginaInicio, puedeAcceder } from './roles.js';

const TOKEN_KEY = "saludclick_token";
const USER_KEY = "saludclick_user";
const DESTINO_KEY = "saludclick_destino_pendiente_v1";

// Lista cerrada: nunca navegar a una URL externa ni regresar al login.
export function validarDestino(destino) {
    if (typeof destino !== "string" || !destino.startsWith("/") || destino.startsWith("//") || /[\\\u0000-\u0020]/.test(destino)) return null;
    try {
        const url = new URL(destino, window.location.origin);
        if (url.origin !== window.location.origin) return null;
        if (PAGINAS_PRIVADAS.has(url.pathname)) {
            const buscar = url.pathname === "/pages/medicamentos.html" ? url.searchParams.get("buscar") : null;
            return url.pathname + (buscar !== null ? `?buscar=${encodeURIComponent(buscar)}` : "");
        }
        const accion = url.searchParams.get("accion");
        if (url.pathname === "/index.html" && ["domicilio", "formula"].includes(accion)) {
            return `/index.html?accion=${accion}#servicios`;
        }
    } catch { /* Destino inválido: usar el dashboard tras el login. */ }
    return null;
}

export function consumirDestinoPendiente() {
    const destino = validarDestino(sessionStorage.getItem(DESTINO_KEY));
    sessionStorage.removeItem(DESTINO_KEY);
    const usuario = getCurrentUser();
    return destino && puedeAcceder(destino, usuario) ? destino : paginaInicio(usuario);
}

export function requerirSesion(destino) {
    if (isAuthenticated()) {
        if (destino && !puedeAcceder(destino, getCurrentUser())) {
            window.location.replace(paginaInicio(getCurrentUser()));
            return false;
        }
        return true;
    }
    const seguro = validarDestino(destino);
    if (seguro) sessionStorage.setItem(DESTINO_KEY, seguro);
    else sessionStorage.removeItem(DESTINO_KEY);
    window.location.href = "/login.html";
    return false;
}

export function navegarPrivado(destino) {
    const seguro = validarDestino(destino);
    if (seguro && requerirSesion(seguro)) window.location.href = seguro;
}

export const setSession = (token, usuario, recordar = true) => {
    const storage = recordar ? localStorage : sessionStorage;
    const anterior = recordar ? sessionStorage : localStorage;
    anterior.removeItem(TOKEN_KEY);
    anterior.removeItem(USER_KEY);
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(usuario));
};

export const getToken = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);

export const getCurrentUser = () => {
    const user = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    try {
        const parsed = user ? JSON.parse(user) : null;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
};

export const isAuthenticated = () => !!getToken();

export const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(DESTINO_KEY);
    window.location.href = "/login.html";
};

export const checkAuthGuard = () => {
    return requerirSesion(window.location.pathname + window.location.search);
};

// Revalidar también al volver con Atrás o después de cerrar sesión en otra pestaña.
// Esto protege la interfaz; el backend debe verificar JWT y permisos por separado.
if (PAGINAS_PRIVADAS.has(window.location.pathname)) {
    for (const evento of ["pageshow", "focus", "storage"]) window.addEventListener(evento, checkAuthGuard);
    for (const evento of ["click", "submit", "change", "input", "keydown"]) {
        document.addEventListener(evento, event => {
            if (!checkAuthGuard()) { event.preventDefault(); event.stopImmediatePropagation(); }
        }, true);
    }
}

export const initAuth = () => {
    const usuario = getCurrentUser();

    const nombreUsuario = document.getElementById("nombreUsuario");

    if (nombreUsuario && usuario) {
        nombreUsuario.textContent = usuario.nombre;
    }

    const btnLogout = document.getElementById("btnLogout");

    if (btnLogout) {
        btnLogout.addEventListener("click", logout);
    }
};

// La autorización definitiva está en Express. Aquí se evita ofrecer enlaces
// que el rol actual no puede usar y se conserva su propio acceso a Inicio.
document.addEventListener('DOMContentLoaded', () => {
    if (!isAuthenticated()) return;
    const usuario = getCurrentUser();
    for (const link of document.querySelectorAll('nav a[href], #sidebar a[href], .logo[href]')) {
        const url = new URL(link.href, window.location.origin);
        if (url.origin !== window.location.origin) continue;
        if (url.pathname === '/pages/dashboard.html') {
            link.href = paginaInicio(usuario);
        } else if (PAGINAS_PRIVADAS.has(url.pathname)) {
            link.hidden = !puedeAcceder(url.pathname, usuario);
        }
    }
});
