const TOKEN_KEY = "saludclick_token";
const USER_KEY = "saludclick_user";
const DESTINO_KEY = "saludclick_destino_pendiente_v1";
const PAGINAS_PRIVADAS = new Set([
    "/pages/dashboard.html", "/pages/medicamentos.html", "/pages/pedidos.html",
    "/pages/historial.html", "/pages/perfil.html"
]);

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
    return destino || "/pages/dashboard.html";
}

export function requerirSesion(destino) {
    if (isAuthenticated()) return true;
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
    return user ? JSON.parse(user) : null;
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
