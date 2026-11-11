import { checkAuthGuard, getCurrentUser, logout } from "./auth.js";
import { apiFetch } from "./api.js";

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
            const estado = document.getElementById("epsAccess");
            const mensaje = document.getElementById("epsMessage");
            const actualizar = document.getElementById("refreshEps");
            const nombre = document.getElementById("epsUserName");
            const cerrarSesion = document.getElementById("logout");
            let verificando = false;

            if (nombre) nombre.textContent = usuario.nombre || "EPS";
            cerrarSesion?.addEventListener("click", logout);

            async function verificarAcceso() {
                if (verificando || !estado) return;
                verificando = true;
                if (actualizar) actualizar.disabled = true;
                estado.setAttribute("aria-busy", "true");
                estado.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Verificando permisos...</span>';
                if (mensaje) {
                    mensaje.textContent = "";
                    mensaje.setAttribute("role", "status");
                }

                try {
                    await apiFetch("/api/eps/verificar-acceso");
                    estado.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Acceso EPS verificado</span>';
                    estado.setAttribute("aria-busy", "false");
                } catch (error) {
                    estado.innerHTML = '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span>No se pudo verificar el acceso</span>';
                    estado.setAttribute("aria-busy", "false");
                    if (mensaje) {
                        mensaje.textContent = error.message;
                        mensaje.setAttribute("role", "alert");
                    }
                } finally {
                    verificando = false;
                    if (actualizar) actualizar.disabled = false;
                }
            }

            actualizar?.addEventListener("click", verificarAcceso);
            verificarAcceso();
        });
    }
}
