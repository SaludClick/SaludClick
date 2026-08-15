const TOKEN_KEY = "saludclick_token";
const USER_KEY = "saludclick_user";

export const setSession = (token, usuario) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getCurrentUser = () => {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
};

export const isAuthenticated = () => !!getToken();

export const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = "/login.html";
};

export const checkAuthGuard = () => {
    if (!isAuthenticated()) {
        window.location.href = "/login.html";
    }
};

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