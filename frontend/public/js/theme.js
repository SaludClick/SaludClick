(() => {
    const key = "saludclick_theme";
    const root = document.documentElement;
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    let preference = "system";
    let button;

    const normalize = value => value === "light" || value === "dark" ? value : "system";
    try { preference = normalize(localStorage.getItem(key)); } catch {}

    function apply() {
        const theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
        root.dataset.theme = theme;
        root.dataset.bsTheme = theme;
        if (button) {
            const label = theme === "dark" ? "Activar tema claro" : "Activar tema oscuro";
            button.textContent = theme === "dark" ? "☀️" : "🌙";
            button.setAttribute("aria-label", label);
            button.title = label;
        }
    }

    apply();
    system.addEventListener("change", apply);
    window.addEventListener("storage", event => {
        if (event.key !== key && event.key !== null) return;
        preference = normalize(event.newValue);
        apply();
    });

    document.addEventListener("DOMContentLoaded", () => {
        button = document.createElement("button");
        button.type = "button";
        button.className = "saludclick-theme";
        button.addEventListener("click", () => {
            preference = root.dataset.theme === "dark" ? "light" : "dark";
            try { localStorage.setItem(key, preference); } catch {}
            apply();
        });
        apply();

        const panel = document.querySelector("[data-panel-menu] > :is(.admin-main, .ad-main)");
        const header = panel
            ? panel.querySelector(".ad-topbar .ad-actions, .admin-topbar")
            : document.querySelector("header.navbar .nav-container, main.ad-main > .ad-heading");
        const back = document.querySelector(".auth-back-link");
        if (header) header.append(button);
        else if (back) back.after(button);
        else {
            button.classList.add("saludclick-theme-floating");
            (panel || document.body).prepend(button);
        }
    });
})();
