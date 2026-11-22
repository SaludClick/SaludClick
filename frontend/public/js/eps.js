import { checkAuthGuard, getCurrentUser, logout } from "./auth.js";
import { iniciarAfiliados } from "./eps-afiliados.js";
import { iniciarSolicitudes } from "./eps-solicitudes.js";
import { iniciarFarmacias } from "./eps-farmacias.js";
import { iniciarNotificaciones } from "./eps-notificaciones.js";
import { iniciarDashboard } from "./eps-dashboard.js";
import { iniciarReportes } from "./eps-reportes.js";
import { iniciarPerfil } from "./eps-perfil.js";

function actualizarNavegacion() {
    const secciones = { '#afiliados': 'epsNavAfiliados', '#solicitudes': 'epsNavSolicitudes', '#farmacias': 'epsNavFarmacias',
        '#notificaciones': 'epsNavNotificaciones', '#reportes': 'epsNavReportes', '#perfil': 'epsNavPerfil' };
    const actual = secciones[location.hash.split('/')[0]] || 'epsNavDashboard';
    for (const id of ['epsNavDashboard', ...Object.values(secciones)]) {
        const enlace = document.getElementById(id);
        enlace.classList.toggle('active', id === actual);
        enlace.removeAttribute('aria-current');
        if (id === actual) enlace.setAttribute('aria-current', id === 'epsNavDashboard' ? 'page' : 'location');
    }
}

const usuario = getCurrentUser();
const rol = Number(usuario?.rol_id ?? usuario?.rol);

if (checkAuthGuard()) {
    if (!usuario || rol !== 4) {
        const destinos = {
            1: "/pages/admin.html",
            2: "/pages/dashboard.html",
            3: "/pages/farmacia.html"
        };
        location.replace(destinos[rol] || "/index.html");
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            actualizarNavegacion();
            window.addEventListener("hashchange", actualizarNavegacion);
            iniciarAfiliados();
            iniciarSolicitudes();
            iniciarFarmacias();
            iniciarDashboard();
            iniciarNotificaciones();
            iniciarReportes();
            iniciarPerfil();
            const nombre = document.getElementById("epsUserName");
            const cerrarSesion = document.getElementById("logout");

            if (nombre) nombre.textContent = usuario.nombre || "EPS";
            cerrarSesion?.addEventListener("click", logout);
        });
    }
}
