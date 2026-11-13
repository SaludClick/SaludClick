document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.getElementById("menuToggle");
    const menu = document.getElementById("menu");
    const isHomePage = document.body.classList.contains("home-page");

    if (!menuToggle || !menu) return;

    const setMenuOpen = (isOpen, restoreFocus = false) => {
        menu.classList.toggle("active", isOpen);
        menuToggle.setAttribute("aria-expanded", String(isOpen));

        if (isHomePage) {
            menuToggle.setAttribute(
                "aria-label",
                `${isOpen ? "Cerrar" : "Abrir"} menú de navegación`
            );
        }

        if (restoreFocus) menuToggle.focus();
    };

    menuToggle.addEventListener("click", () => {
        setMenuOpen(!menu.classList.contains("active"));
    });

    if (!isHomePage) return;

    menu.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("a")) {
            setMenuOpen(false);
        }
    });

    document.addEventListener("click", (event) => {
        if (
            menu.classList.contains("active") &&
            !menu.contains(event.target) &&
            !menuToggle.contains(event.target)
        ) {
            setMenuOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menu.classList.contains("active")) {
            setMenuOpen(false, true);
        }
    });

    window.matchMedia("(min-width: 761px)").addEventListener("change", () => {
        setMenuOpen(false);
    });
});
