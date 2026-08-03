import { checkAuthGuard, initAuth, getCurrentUser } from "./auth.js";

checkAuthGuard();

document.addEventListener("DOMContentLoaded", () => {
    initAuth();

    const usuario = getCurrentUser();
    const bienvenida = document.getElementById("bienvenida");

    if (usuario && bienvenida) {
        bienvenida.textContent = `Bienvenido, ${usuario.nombre || 'Usuario'}`;
    }

    const pedidos = JSON.parse(localStorage.getItem("pedidosSaludClick")) || [];
    const totalPedidos = document.getElementById("totalPedidos");

    if (totalPedidos) {
        totalPedidos.textContent = pedidos.length;
    }
});