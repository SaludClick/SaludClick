import { checkAuthGuard, logout } from "./auth.js";
import { apiFetch } from "./api.js";

const resultados = [
    ["ENTREGADA", "Entregada"], ["AUSENCIA", "Ausencia"], ["RECHAZO", "Rechazo"],
    ["DIRECCION_INCORRECTA", "Dirección incorrecta"], ["DEVOLUCION", "Devolución"]
];

if (checkAuthGuard()) {
    const estado = document.getElementById("visitasEstado");
    const lista = document.getElementById("visitas");
    const refresh = document.getElementById("actualizarVisitas");
    document.getElementById("btnLogout").addEventListener("click", logout);
    refresh.addEventListener("click", () => cargar());
    async function operar(visita, accion, extra, button) {
        const intent = `saludclick:visita:${visita.visita_id}:${accion}:${extra.resultado || ""}`;
        const key = sessionStorage.getItem(intent) || crypto.randomUUID();
        sessionStorage.setItem(intent, key);
        button.disabled = true;
        try {
            await apiFetch(`/api/dispensacion/solicitudes/${visita.solicitud_id}/etapas/${accion}`, {
                method: "POST", headers: { "Idempotency-Key": key },
                body: JSON.stringify({ visita_id: visita.visita_id, ...extra })
            });
            sessionStorage.removeItem(intent);
            await cargar(accion === "INICIAR_VISITA" ? "Visita iniciada." : "Resultado registrado.");
        } catch (error) {
            if (error.status && error.status < 500) sessionStorage.removeItem(intent);
            estado.textContent = error.message;
        } finally { button.disabled = false; }
    }

    function tarjeta(visita) {
        const card = document.createElement("article");
        card.className = "ad-card";
        const heading = document.createElement("h2");
        heading.textContent = `Solicitud ${visita.solicitud_id}`;
        const address = document.createElement("p");
        address.textContent = visita.direccion;
        const expires = document.createElement("p");
        expires.textContent = `Vigencia: ${new Date(visita.vence_at).toLocaleString("es-CO")}`;
        card.append(heading, address, expires);
        if (!visita.iniciada) {
            const start = document.createElement("button");
            start.type = "button";
            start.textContent = "Iniciar visita";
            start.addEventListener("click", () => operar(visita, "INICIAR_VISITA", {}, start));
            card.append(start);
        } else {
            const form = document.createElement("form");
            const label = document.createElement("label");
            label.textContent = "Resultado de visita";
            const select = document.createElement("select");
            select.required = true;
            select.dataset.visita = visita.visita_id;
            select.add(new Option("Selecciona el resultado", ""));
            for (const [value, name] of resultados) select.add(new Option(name, value));
            label.append(select);
            const submit = document.createElement("button");
            submit.type = "submit";
            submit.textContent = "Registrar resultado";
            form.addEventListener("submit", event => {
                event.preventDefault();
                void operar(visita, "RESULTADO_VISITA", { resultado: select.value }, submit);
            });
            form.append(label, submit);
            const hint = document.createElement("p");
            hint.textContent = "La entrega exitosa requiere que el paciente confirme la recepción en su cuenta.";
            card.append(hint, form);
        }
        return card;
    }

    async function cargar(message = "") {
        refresh.disabled = true;
        lista.setAttribute("aria-busy", "true");
        estado.textContent = "Consultando tus visitas…";
        const previous = new Map([...lista.querySelectorAll("select")].map(select => [select.dataset.visita, select.value]));
        try {
            const { datos } = await apiFetch("/api/dispensacion/mis-visitas");
            lista.replaceChildren(...datos.map(tarjeta));
            for (const select of lista.querySelectorAll("select")) select.value = previous.get(select.dataset.visita) || "";
            estado.textContent = [message, datos.length ? "" : "No tienes entregas asignadas."].filter(Boolean).join(" ");
        } catch (error) { estado.textContent = message ? `${message} No se pudo actualizar la lista: ${error.message}` : error.message; }
        finally {
            lista.setAttribute("aria-busy", "false");
            refresh.disabled = false;
        }
    }
    void cargar();
}
