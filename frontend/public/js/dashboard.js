import { checkAuthGuard, getCurrentUser, getToken, actualizarUsuarioSesion } from "./auth.js";
import { apiFetch } from "./api.js";

if (checkAuthGuard()) document.addEventListener("DOMContentLoaded", () => {
    const summary = document.querySelector(".dashboard-stats");
    const status = document.getElementById("dashboardEstado");
    const identity = document.querySelector(".dashboard-user");
    const identityStatus = document.getElementById("dashboardIdentidadEstado");
    const fields = ["totalPedidos", "totalFormulas", "pedidosActivos", "totalGastado"];
    const names = ["nombreUsuarioTop", "nombreUsuario", "nombreUsuarioPanel"];
    const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
    let generation = 0;
    let controller;

    function text(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
    function state(value, message) {
        if (status) {
            status.dataset.state = value;
            status.textContent = message;
            status.setAttribute("role", value === "error" || value === "expired" ? "alert" : "status");
        }
        summary?.setAttribute("aria-busy", String(value === "loading"));
    }
    function clear() {
        for (const id of fields) text(id, "—");
        for (const id of names) text(id, "Usuario");
        text("bienvenida", "Bienvenido");
        identity?.setAttribute("aria-busy", "true");
        if (identityStatus) identityStatus.textContent = "Verificando tu identidad...";
    }
    function expired() {
        clear();
        identity?.setAttribute("aria-busy", "false");
        if (identityStatus) identityStatus.textContent = "Sesión expirada";
        state("expired", "Tu sesión expiró. Inicia sesión nuevamente.");
    }
    async function load() {
        const request = ++generation;
        controller?.abort();
        controller = new AbortController();
        clear();
        const token = getToken();
        const user = getCurrentUser();
        if (!token) {
            expired();
            checkAuthGuard();
            return;
        }
        if (!checkAuthGuard()) return;
        state("loading", "Cargando información...");
        const sessionId = user?.id;
        const current = () => request === generation && token === getToken() && sessionId === getCurrentUser()?.id;
        const [profile, statistics] = await Promise.allSettled([
            apiFetch("/api/auth/profile", { signal: controller.signal }),
            apiFetch("/api/dashboard/me", { signal: controller.signal })
        ]);
        if (request !== generation) return;
        if (!getToken()) {
            expired();
            return;
        }
        if (!current()) {
            clear();
            identity?.setAttribute("aria-busy", "false");
            state("error", "La sesión cambió. Vuelve a cargar tu información.");
            return;
        }
        let invalidIdentity = false;
        if (profile.status === "fulfilled") {
            const verified = profile.value.usuario;
            const id = Number(verified?.id);
            invalidIdentity = !Number.isSafeInteger(id) || id < 1 ||
                Number(verified?.rol_id ?? verified?.rol) !== 2 ||
                (sessionId != null && Number(sessionId) !== id) ||
                typeof verified?.nombre !== "string" || !verified.nombre.trim();
            if (!invalidIdentity) {
                actualizarUsuarioSesion({ ...user, ...verified });
                for (const field of names) text(field, verified.nombre);
                text("bienvenida", "¡Bienvenido, " + verified.nombre + "!");
                if (identityStatus) identityStatus.textContent = "Sesión iniciada como";
            }
        }
        if (profile.status === "rejected" || invalidIdentity) {
            if (identityStatus) identityStatus.textContent = "No se pudo verificar tu identidad. Vuelve a cargar la página.";
        }
        identity?.setAttribute("aria-busy", "false");
        if (invalidIdentity) {
            state("error", "No se pudo verificar que la información corresponda a tu sesión.");
            return;
        }
        if (statistics.status === "rejected") {
            state("error", "No se pudo cargar tu resumen. " + statistics.reason.message);
            return;
        }
        const data = statistics.value.estadisticas;
        const counts = [data?.pedidos, data?.formulas, data?.pedidosActivos];
        if (!counts.every(value => Number.isSafeInteger(value) && value >= 0) ||
            typeof data?.totalPagado !== "number" || !Number.isFinite(data.totalPagado) || data.totalPagado < 0) {
            state("error", "El servidor no devolvió un resumen válido. Vuelve a cargar la página.");
            return;
        }
        fields.slice(0, 3).forEach((id, index) => text(id, String(counts[index])));
        text("totalGastado", money.format(data.totalPagado));
        const empty = counts.every(value => value === 0) && data.totalPagado === 0;
        if (profile.status === "rejected") {
            state("error", "Resumen cargado, pero no se pudo verificar tu identidad. Vuelve a cargar la página.");
            return;
        }
        state(empty ? "empty" : "loaded", empty ? "Sin registros: todavía no tienes pedidos, fórmulas ni pagos registrados." : "Información cargada.");
    }
    load();
    window.addEventListener("pageshow", event => { if (event.persisted) load(); });
    window.addEventListener("storage", event => {
        if (event.key === null || ["saludclick_token", "saludclick_user"].includes(event.key)) load();
    });
    window.addEventListener("pagehide", () => {
        generation++;
        controller?.abort();
        clear();
    });
});
