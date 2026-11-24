import { checkAuthGuard, logout } from "./auth.js";
import { apiFetch } from "./api.js";

if (checkAuthGuard()) {
    const estado = document.getElementById("ipsEstado");
    document.getElementById("btnLogout").addEventListener("click", logout);
    try {
        const { ips } = await apiFetch("/api/ips/verificar-acceso");
        document.getElementById("ipsNombre").textContent = ips.nombre;
        document.getElementById("ipsEntidad").hidden = false;
        estado.hidden = true;
    } catch (error) {
        estado.textContent = error.message;
    }
}
