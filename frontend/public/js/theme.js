(() => {
    const key = "saludclick_theme";
    const themes = new Map([["system", "Sistema"], ["light", "Claro"], ["dark", "Oscuro"]]);
    const root = document.documentElement;
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    let preference = "system";

    try {
        const saved = localStorage.getItem(key);
        if (themes.has(saved)) preference = saved;
    } catch {}

    const apply = () => {
        const theme = preference === "system" ? (system.matches ? "dark" : "light") : preference;
        root.dataset.theme = theme;
        root.dataset.bsTheme = theme;
    };

    apply();
    system.addEventListener("change", apply);
    document.addEventListener("DOMContentLoaded", () => {
        const control = document.createElement("label");
        control.className = "saludclick-theme";
        control.textContent = "Tema";
        const select = document.createElement("select");
        for (const [value, name] of themes) select.add(new Option(name, value));
        select.value = preference;
        select.addEventListener("change", () => {
            preference = select.value;
            try { localStorage.setItem(key, preference); } catch {}
            apply();
        });
        window.addEventListener("storage", event => {
            if (event.key !== key && event.key !== null) return;
            preference = themes.has(event.newValue) ? event.newValue : "system";
            select.value = preference;
            apply();
        });
        control.append(select);
        document.body.append(control);
    });
})();
