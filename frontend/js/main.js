import { logout, getCurrentUser, navegarPrivado } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {

    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    const menuToggle = document.getElementById("menuToggle");
    const closeSidebar = document.getElementById("closeSidebar");

    const userBtn = document.getElementById("userBtn");
    const userDropdown = document.getElementById("userDropdown");

    // Botones de cerrar sesión
    const logoutBtn = document.getElementById("logout");
    const logoutSidebar = document.getElementById("logoutSidebar");
    const logoutDropdown = document.getElementById("logoutDropdown");

    const nombreUsuarioTop = document.getElementById("nombreUsuarioTop");
    const dropdownNombre = document.getElementById("dropdownNombre");
    const nombreUsuario = document.getElementById("nombreUsuario");
    const bienvenida = document.getElementById("bienvenida");

    const usuario = getCurrentUser();

    // Enlace administrativo visible únicamente para roles 1 y 3.
    const rolUsuario = Number(usuario?.rol || usuario?.rol_id);

    if (usuario && [1, 3].includes(rolUsuario)) {
        const menu = document.getElementById("menu");

        if (menu) {
            const existeAdmin = document.getElementById("adminNavLink") || menu.querySelector('a[href="admin.html"]');

            if (!existeAdmin) {
                const a = document.createElement("a");
                a.id = "adminNavLink";
                a.href = "admin.html";
                a.className = "nav-link";
                a.innerHTML = '<i class="fa-solid fa-chart-line"></i><span>Administración</span>';

                const targetBtn = menu.querySelector(".logout-link") || document.getElementById("logout");
                if (targetBtn) {
                    menu.insertBefore(a, targetBtn);
                } else {
                    menu.appendChild(a);
                }
            }
        }
    }

    if (usuario) {
        if (nombreUsuarioTop) nombreUsuarioTop.textContent = usuario.nombre;
        if (dropdownNombre) dropdownNombre.textContent = usuario.nombre;
        if (nombreUsuario) nombreUsuario.textContent = usuario.nombre;
        if (bienvenida) bienvenida.textContent = `¡Bienvenido, ${usuario.nombre}!`;
    }

    function abrirSidebar() {
        sidebar?.classList.add("active");
        overlay?.classList.add("active");
    }

    function cerrarSidebar() {
        sidebar?.classList.remove("active");
        overlay?.classList.remove("active");
    }

    menuToggle?.addEventListener("click", abrirSidebar);
    closeSidebar?.addEventListener("click", cerrarSidebar);
    overlay?.addEventListener("click", cerrarSidebar);

    userBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        userDropdown?.classList.toggle("show");
    });

    document.addEventListener("click", () => {
        userDropdown?.classList.remove("show");
    });

    // Controladores de evento para cerrar sesión
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            logout();
        });
    }

    logoutSidebar?.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
    });

    logoutDropdown?.addEventListener("click", (e) => { 
        e.preventDefault(); 
        logout(); 
    });

    // Delegación general para cualquier elemento con la clase .logout-link
    document.querySelectorAll(".logout-link").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            logout();
        });
    });

    // Acciones de la portada
    const acciones = {
        medicamentos: "/pages/medicamentos.html",
        pedido: "/pages/pedidos.html",
        historial: "/pages/historial.html",
        formula: "/pages/formulas.html"
    };

    document.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "contacto") { 
            window.location.href = "mailto:contacto@saludclick.com?subject=Soporte%20SaludClick"; 
            return; 
        }
        navegarPrivado(acciones[action] || "/pages/dashboard.html");
    }));

    const searchBtn = document.getElementById("buscarInicio");
    const searchInput = document.getElementById("busquedaInicio");

    if (searchBtn && searchInput) {
        searchBtn.addEventListener("click", () => {
            const q = searchInput.value.trim();
            navegarPrivado(`/pages/medicamentos.html${q ? `?buscar=${encodeURIComponent(q)}` : ""}`);
        });
    }

    searchInput?.addEventListener("keydown", e => {
        if (e.key === "Enter") searchBtn?.click();
    });
});