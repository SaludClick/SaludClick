import { checkAuthGuard, initAuth } from "./auth.js";

checkAuthGuard();

document.addEventListener("DOMContentLoaded", () => {
    initAuth();

    const tabla = document.getElementById("tablaHistorial");
    if (!tabla) return;

    const pedidos = JSON.parse(localStorage.getItem("pedidosSaludClick")) || [];
    tabla.innerHTML = "";

    if (pedidos.length === 0) {
        tabla.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay historial de solicitudes.</td></tr>`;
        return;
    }

    pedidos.forEach((pedido) => {
        tabla.innerHTML += `
            <tr>
                <td>#${pedido.id}</td>
                <td>${pedido.medicamento}</td>
                <td>${pedido.fecha}</td>
                <td class="estado-entregado">
                    ${pedido.estado === "En Preparación" ? "Entregado" : pedido.estado}
                </td>
            </tr>
        `;
    });
});