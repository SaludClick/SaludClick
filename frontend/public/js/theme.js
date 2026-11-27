(() => {
    const key = "saludclick_theme";
    const root = document.documentElement;
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    let preference = "system";

    const normalize = value => value === "light" || value === "dark" ? value : "system";
    try { preference = normalize(localStorage.getItem(key)); } catch {}

    function apply() {
        const theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
        root.dataset.theme = theme;
        root.dataset.bsTheme = theme;
        const label = theme === "dark" ? "Activar tema claro" : "Activar tema oscuro";
        for (const button of document.querySelectorAll("saludclick-theme-control > button")) {
            button.firstElementChild.textContent = theme === "dark" ? "☀️" : "🌙";
            button.setAttribute("aria-label", label);
            button.title = label;
        }
    }

    apply();
    system.addEventListener("change", apply);
    window.addEventListener("storage", event => {
        if (event.storageArea !== localStorage || (event.key !== key && event.key !== null)) return;
        preference = normalize(event.newValue);
        apply();
    });

    customElements.define("saludclick-theme-control", class extends HTMLElement {
        connectedCallback() {
            if (!this.firstElementChild) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "saludclick-theme";
                const icon = document.createElement("span");
                icon.setAttribute("aria-hidden", "true");
                button.append(icon);
                button.addEventListener("click", () => {
                    preference = root.dataset.theme === "dark" ? "light" : "dark";
                    try { localStorage.setItem(key, preference); } catch {}
                    apply();
                });
                this.append(button);
            }
            apply();
        }
    });
})();
