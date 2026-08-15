import { logout, getCurrentUser } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {

    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    const menuToggle = document.getElementById("menuToggle");
    const closeSidebar = document.getElementById("closeSidebar");

    const userBtn = document.getElementById("userBtn");
    const userDropdown = document.getElementById("userDropdown");

    const logoutSidebar = document.getElementById("logoutSidebar");
    const logoutDropdown = document.getElementById("logoutDropdown");

    const nombreUsuarioTop = document.getElementById("nombreUsuarioTop");
    const dropdownNombre = document.getElementById("dropdownNombre");
    const nombreUsuario = document.getElementById("nombreUsuario");
    const bienvenida = document.getElementById("bienvenida");

    const usuario = getCurrentUser();

    if (usuario) {

        if (nombreUsuarioTop) nombreUsuarioTop.textContent = usuario.nombre;
        if (dropdownNombre) dropdownNombre.textContent = usuario.nombre;
        if (nombreUsuario) nombreUsuario.textContent = usuario.nombre;
        if (bienvenida) bienvenida.textContent = `¡Bienvenido, ${usuario.nombre}!`;

    }

    function abrirSidebar() {

        sidebar.classList.add("active");
        overlay.classList.add("active");

    }

    function cerrarSidebar() {

        sidebar.classList.remove("active");
        overlay.classList.remove("active");

    }

    menuToggle?.addEventListener("click", abrirSidebar);
    closeSidebar?.addEventListener("click", cerrarSidebar);
    overlay?.addEventListener("click", cerrarSidebar);

    userBtn?.addEventListener("click", (e) => {

        e.stopPropagation();

        userDropdown.classList.toggle("show");

    });

    document.addEventListener("click", () => {

        userDropdown?.classList.remove("show");

    });

    logoutSidebar?.addEventListener("click", (e) => {

        e.preventDefault();
        logout();

    });

    logoutDropdown?.addEventListener("click", (e) => {

        e.preventDefault();
        logout();

    });

});