import { checkAuthGuard, initAuth } from "./auth.js";

checkAuthGuard();

document.addEventListener("DOMContentLoaded", () => {
    initAuth();

    const tabla = document.getElementById("tablaPedidos");
    if (!tabla) return;

    const pedidos = JSON.parse(localStorage.getItem("pedidosSaludClick")) || [];
    tabla.innerHTML = "";

    if (pedidos.length === 0) {
        tabla.innerHTML = `<tr><td colspan="4" style="text-align:center;">No tienes solicitudes de pedidos activas.</td></tr>`;
        return;
    }

    pedidos.forEach((pedido) => {
        tabla.innerHTML += `
            <tr>
                <td>#${pedido.id}</td>
                <td>${pedido.medicamento}</td>
                <td>${pedido.fecha}</td>
                <td class="estado-proceso">
                    ${pedido.estado}
                </td>
            </tr>
        `;
    });
});