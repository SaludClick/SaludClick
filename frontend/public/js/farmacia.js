import { checkAuthGuard, getCurrentUser, logout } from "./auth.js";
import { apiFetch } from "./api.js";

const usuario = getCurrentUser();
const rol = Number(usuario?.rol_id ?? usuario?.rol);

if (checkAuthGuard()) {
    if (!usuario || rol !== 3) {
        const destinos = {
            1: "/pages/admin.html",
            2: "/pages/dashboard.html",
            4: "/pages/eps.html"
        };
        location.replace(destinos[rol] || "/index.html");
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            const stats = document.getElementById("farmaciaStats");
            const medicamentos = document.getElementById("farmaciaMedicamentos");
            const mensaje = document.getElementById("farmaciaMessage");
            const actualizar = document.getElementById("refreshFarmacia");
            const nombre = document.getElementById("farmaciaUserName");
            const cerrarSesion = document.getElementById("logout");
            let cargando = false;

            if (nombre) nombre.textContent = usuario.nombre || "Farmacia";
            cerrarSesion?.addEventListener("click", logout);

            const escapar = valor => String(valor ?? "").replace(/[&<>"']/g, caracter => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[caracter]));
            const numero = valor => new Intl.NumberFormat("es-CO").format(Number(valor) || 0);

            async function cargar() {
                if (cargando || !stats || !medicamentos) return;
                cargando = true;
                if (actualizar) actualizar.disabled = true;
                stats.setAttribute("aria-busy", "true");
                if (mensaje) {
                    mensaje.textContent = "";
                    mensaje.setAttribute("role", "status");
                }

                try {
                    const respuesta = await apiFetch("/api/farmacia/dashboard");
                    const resumen = respuesta.estadisticas;
                    stats.innerHTML = `
                        <article class="admin-stat">
                            <i class="fa-solid fa-pills" aria-hidden="true"></i>
                            <strong>${numero(resumen.totalMedicamentos)}</strong>
                            <span>Medicamentos en catálogo</span>
                            <small>Registros consultados al backend</small>
                        </article>
                        <article class="admin-stat">
                            <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                            <strong>${numero(resumen.medicamentosDisponibles)}</strong>
                            <span>Disponibles en catálogo</span>
                            <small>Estado reportado por el backend</small>
                        </article>
                    `;

                    medicamentos.innerHTML = respuesta.medicamentos.length
                        ? respuesta.medicamentos.map(medicamento => `
                            <tr>
                                <td>${escapar(medicamento.nombre)}</td>
                                <td>${escapar(medicamento.categoria)}</td>
                                <td>${escapar(medicamento.descripcion)}</td>
                                <td>${escapar(medicamento.estado)}</td>
                            </tr>
                        `).join("")
                        : '<tr><td colspan="4">No hay medicamentos en el catálogo.</td></tr>';
                    stats.setAttribute("aria-busy", "false");
                } catch (error) {
                    stats.setAttribute("aria-busy", "false");
                    stats.innerHTML = '<article class="admin-stat"><span>No hay datos disponibles.</span></article>';
                    medicamentos.innerHTML = '<tr><td colspan="4">No se pudo cargar el catálogo.</td></tr>';
                    if (mensaje) {
                        mensaje.textContent = error.message;
                        mensaje.setAttribute("role", "alert");
                    }
                } finally {
                    cargando = false;
                    if (actualizar) actualizar.disabled = false;
                }
            }

            actualizar?.addEventListener("click", cargar);
            cargar();
        });
    }
}
