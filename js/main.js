// 1. Los imports SIEMPRE deben ser top-level
import { checkAuthGuard, initAuth } from "./auth.js";

// Ejecutar validaciones de autenticación inmediatamente
checkAuthGuard();
initAuth();

document.addEventListener("DOMContentLoaded", () => {
    // --- LÓGICA DEL MENÚ HAMBURGUESA / DESPLEGABLE ---
    const menuToggle = document.getElementById("menuToggle");
    const menu = document.getElementById("menu");

    if (menuToggle && menu) {
        menuToggle.addEventListener("click", () => {
            menu.classList.toggle("active");
        });
    }

    // --- MANEJO DE BOTONES DE CONSULTA DE SERVICIOS ---
    const botonesConsultar = document.querySelectorAll(".card button");

    botonesConsultar.forEach((boton) => {
        boton.addEventListener("click", () => {
            alert("Esta funcionalidad estará disponible en próximas versiones.");
        });
    });

    // --- LÓGICA DE CIERRE DE SESIÓN ---
    const logout = document.getElementById("logout");

    if (logout) {
        logout.addEventListener("click", (e) => {
            e.preventDefault();
            localStorage.removeItem("sesionActiva");
            alert("Sesión cerrada correctamente.");
            window.location.href = "../login.html";
        });
    }
});