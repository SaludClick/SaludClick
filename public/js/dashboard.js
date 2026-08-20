document.addEventListener("DOMContentLoaded", () => {
    /* =====================================================
       ELEMENTOS DEL DOM
    ===================================================== */

    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menuToggle");
    const closeSidebar = document.getElementById("closeSidebar");
    const overlay = document.getElementById("overlay");

    const userBtn = document.getElementById("userBtn");
    const userDropdown = document.getElementById("userDropdown");

    const nombreUsuario = document.getElementById("nombreUsuario");
    const nombreUsuarioTop = document.getElementById("nombreUsuarioTop");
    const dropdownNombre = document.getElementById("dropdownNombre");

    const bienvenida = document.getElementById("bienvenida");
    const totalPedidos = document.getElementById("totalPedidos");

    const logoutSidebar = document.getElementById("logoutSidebar");
    const logoutDropdown = document.getElementById("logoutDropdown");


    /* =====================================================
       SIDEBAR
    ===================================================== */

    function abrirSidebar() {
        if (!sidebar) return;

        sidebar.classList.remove("sidebar-closed");

        if (overlay) {
            overlay.classList.add("overlay-active");
        }
    }


    function cerrarSidebar() {
        if (!sidebar) return;

        sidebar.classList.add("sidebar-closed");

        if (overlay) {
            overlay.classList.remove("overlay-active");
        }
    }


    function alternarSidebar() {
        if (!sidebar) return;

        if (sidebar.classList.contains("sidebar-closed")) {
            abrirSidebar();
        } else {
            cerrarSidebar();
        }
    }


    /* =====================================================
       BOTÓN HAMBURGUESA
    ===================================================== */

    if (menuToggle) {
        menuToggle.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            alternarSidebar();
        });
    }


    /* =====================================================
       BOTÓN X DEL SIDEBAR
    ===================================================== */

    if (closeSidebar) {
        closeSidebar.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            cerrarSidebar();
        });
    }


    /* =====================================================
       OVERLAY
    ===================================================== */

    if (overlay) {
        overlay.addEventListener("click", () => {
            cerrarSidebar();
        });
    }


    /* =====================================================
       CERRAR CON ESCAPE
    ===================================================== */

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            cerrarSidebar();
            cerrarDropdown();
        }
    });


    /* =====================================================
       MENÚ DE USUARIO
    ===================================================== */

    function abrirDropdown() {
        if (!userDropdown) return;

        userDropdown.classList.add("active");
    }


    function cerrarDropdown() {
        if (!userDropdown) return;

        userDropdown.classList.remove("active");
    }


    function alternarDropdown() {
        if (!userDropdown) return;

        userDropdown.classList.toggle("active");
    }


    if (userBtn) {
        userBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            alternarDropdown();
        });
    }


    /* =====================================================
       CERRAR MENÚ DE USUARIO AL HACER CLICK AFUERA
    ===================================================== */

    document.addEventListener("click", (event) => {
        if (!userDropdown || !userBtn) return;

        const clickDentroDropdown =
            userDropdown.contains(event.target);

        const clickBotonUsuario =
            userBtn.contains(event.target);

        if (!clickDentroDropdown && !clickBotonUsuario) {
            cerrarDropdown();
        }
    });


    /* =====================================================
       ENLACES DEL SIDEBAR
       En móvil cerramos el menú antes de navegar.
    ===================================================== */

    if (sidebar) {
        const enlacesSidebar =
            sidebar.querySelectorAll("nav a");

        enlacesSidebar.forEach((enlace) => {
            enlace.addEventListener("click", () => {
                if (window.innerWidth <= 768) {
                    cerrarSidebar();
                }
            });
        });
    }


    /* =====================================================
       NOMBRE DEL USUARIO
       
       Intenta obtener el nombre desde localStorage.
       Si no existe, mantiene "Usuario".
    ===================================================== */

    function obtenerNombreUsuario() {
        const posiblesClaves = [
            "nombreUsuario",
            "nombre",
            "usuario",
            "userName",
            "username"
        ];

        for (const clave of posiblesClaves) {
            const valor = localStorage.getItem(clave);

            if (valor && valor.trim() !== "") {
                return valor.trim();
            }
        }

        return "Usuario";
    }


    function actualizarNombreUsuario() {
        const nombre = obtenerNombreUsuario();

        if (nombreUsuario) {
            nombreUsuario.textContent = nombre;
        }

        if (nombreUsuarioTop) {
            nombreUsuarioTop.textContent = nombre;
        }

        if (dropdownNombre) {
            dropdownNombre.textContent = nombre;
        }

        if (bienvenida) {
            bienvenida.textContent = `Bienvenido, ${nombre}!`;
        }
    }


    actualizarNombreUsuario();


    /* =====================================================
       TOTAL DE PEDIDOS
       
       Si existe en localStorage, lo muestra.
       Si no, mantiene 0.
    ===================================================== */

    function actualizarTotalPedidos() {
        if (!totalPedidos) return;

        const pedidosGuardados =
            localStorage.getItem("totalPedidos");

        if (pedidosGuardados !== null) {
            totalPedidos.textContent = pedidosGuardados;
        } else {
            totalPedidos.textContent = "0";
        }
    }


    actualizarTotalPedidos();


    /* =====================================================
       LOGOUT
    ===================================================== */

    function cerrarSesion(event) {
        event.preventDefault();

        /*
         * Eliminamos datos de sesión conocidos.
         * No borramos absolutamente todo el localStorage
         * para no afectar otras funcionalidades del proyecto.
         */

        const clavesSesion = [
            "usuario",
            "nombreUsuario",
            "nombre",
            "userName",
            "username",
            "usuarioActual",
            "usuarioLogueado"
        ];

        clavesSesion.forEach((clave) => {
            localStorage.removeItem(clave);
        });

        sessionStorage.clear();

        /*
         * Ajusta esta ruta si tu login tiene otro nombre.
         */
        window.location.href = "login.html";
    }


    if (logoutSidebar) {
        logoutSidebar.addEventListener(
            "click",
            cerrarSesion
        );
    }


    if (logoutDropdown) {
        logoutDropdown.addEventListener(
            "click",
            cerrarSesion
        );
    }


    /* =====================================================
       ESTADO INICIAL
       
       Desktop:
       Sidebar abierto.

       Móvil:
       Sidebar cerrado.
    ===================================================== */

    function establecerEstadoInicial() {
        if (window.innerWidth <= 768) {
            cerrarSidebar();
        } else {
            abrirSidebar();
        }
    }


    establecerEstadoInicial();


    /* =====================================================
       RESPONSIVE
    ===================================================== */

    let ultimoEstadoMovil =
        window.innerWidth <= 768;

    window.addEventListener("resize", () => {
        const esMovil =
            window.innerWidth <= 768;

        /*
         * Solo cambiamos automáticamente cuando
         * realmente pasamos de desktop a móvil
         * o viceversa.
         */

        if (esMovil !== ultimoEstadoMovil) {
            establecerEstadoInicial();
            ultimoEstadoMovil = esMovil;
        }
    });


    /* =====================================================
       CERRAR SIDEBAR CON CLICK EN EL CONTENIDO
       SOLO EN MÓVIL
    ===================================================== */

    const contenido =
        document.querySelector(".hero");

    if (contenido) {
        contenido.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                cerrarSidebar();
            }
        });
    }


    /* =====================================================
       MARCAR ENLACE ACTIVO
    ===================================================== */

    if (sidebar) {
        const enlaces =
            sidebar.querySelectorAll("nav a");

        const paginaActual =
            window.location.pathname
                .split("/")
                .pop();

        enlaces.forEach((enlace) => {
            const href =
                enlace.getAttribute("href");

            if (!href || href === "#") return;

            const paginaEnlace =
                href.split("/").pop();

            enlace.classList.remove("active");

            if (paginaEnlace === paginaActual) {
                enlace.classList.add("active");
            }
        });
    }

});