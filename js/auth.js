// Gestión de autenticación SaludClick
const TOKEN_KEY = "saludclick_token";
const USER_KEY = "usuarioSaludClick";

export function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
}

export function isAuthenticated() {
    return localStorage.getItem(TOKEN_KEY) !== null;
}

export function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    const isSubfolder = window.location.pathname.includes("/pages/");
    window.location.href = isSubfolder ? "../login.html" : "login.html";
}

export function checkAuthGuard() {
    const path = window.location.pathname.toLowerCase();
    const isPublicPage = path.endsWith("login.html") || 
                         path.endsWith("registro.html") || 
                         path.endsWith("index.html") || 
                         path === "/" ||
                         path === "";

    if (!isAuthenticated() && !isPublicPage) {
        const isSubfolder = window.location.pathname.includes("/pages/");
        window.location.href = isSubfolder ? "../login.html" : "login.html";
    }
}

export function initAuth() {
    const logoutBtn = document.getElementById("logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (confirm("¿Deseas cerrar la sesión activa de SaludClick?")) {
                logout();
            }
        });
    }

    const usuario = getCurrentUser();
    if (usuario) {
        const nombreElementos = document.querySelectorAll(".nombre-usuario-label, #nombreUsuario");
        nombreElementos.forEach(el => {
            el.textContent = usuario.nombre || usuario.email || "Usuario";
        });
    }
}