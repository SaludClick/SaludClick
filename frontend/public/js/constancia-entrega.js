import { checkAuthGuard } from "./auth.js";
import { apiFetch } from "./api.js";

if (checkAuthGuard()) {
    const estado = document.getElementById("constanciaEstado");
    const form = document.getElementById("confirmarEntrega");
    const id = new URLSearchParams(location.search).get("solicitud");
    if (/^[1-9]\d{0,9}$/.test(id || "")) void cargar(id);
    else estado.textContent = "Selecciona un pedido válido.";

    async function cargar(id) {
        const base = `/api/dispensacion/solicitudes/${id}`;
        try {
            const { datos: copias } = await apiFetch(`${base}/constancias`);
            const lista = document.getElementById("copiasEntregaLista");
            for (const [index, item] of copias.entries()) {
                const li = document.createElement("li");
                const link = document.createElement("a");
                const filename = `constancia-${id}-${index + 1}.json`;
                link.href = URL.createObjectURL(new Blob([JSON.stringify(item, null, 2)], { type: "application/json" }));
                link.download = filename;
                link.textContent = `${item.tipo === "RECEPCION" ? "Recepción" : "Tratamiento"} · ${item.version}`;
                li.append(link);
                lista.append(li);
            }
            document.getElementById("copiasEntrega").hidden = !copias.length;
            const { datos } = await apiFetch(`${base}/documentos`);
            if (copias.some(copia => JSON.parse(copia.documento).visita_id === datos.visita_id)) {
                estado.textContent = "Ya confirmaste los documentos de esta visita.";
                return;
            }
            document.getElementById("constanciaVersion").textContent = datos.version;
            document.getElementById("textoTratamiento").textContent = datos.textos.TRATAMIENTO;
            document.getElementById("textoRecepcion").textContent = datos.textos.RECEPCION;
            document.getElementById("cantidadesRecibidas").textContent = Object.entries(datos.cantidades)
                .map(([medicamento, cantidad]) => `Medicamento ${medicamento}: ${cantidad}`).join(" · ");
            if (datos.titular) {
                const receptor = document.getElementById("autorizarReceptor");
                receptor.hidden = false;
                receptor.addEventListener("submit", async event => {
                    event.preventDefault();
                    const button = receptor.querySelector("button");
                    const receptorId = Number(receptor.elements.receptor.value);
                    const intent = `saludclick:receptor:${datos.visita_id}:${receptorId}`;
                    const key = sessionStorage.getItem(intent) || crypto.randomUUID();
                    sessionStorage.setItem(intent, key);
                    button.disabled = true;
                    try {
                        await apiFetch(`${base}/etapas/AUTORIZAR_RECEPTOR`, {
                            method: "POST", headers: { "Idempotency-Key": key },
                            body: JSON.stringify({ visita_id: datos.visita_id, receptor_id: receptorId })
                        });
                        sessionStorage.removeItem(intent);
                        estado.textContent = "Receptor autorizado. Comparte el enlace de esta constancia con esa persona.";
                    } catch (error) {
                        if (error.status && error.status < 500) sessionStorage.removeItem(intent);
                        estado.textContent = error.message;
                    } finally { button.disabled = false; }
                });
            }
            form.hidden = false;
            form.addEventListener("submit", async event => {
                event.preventDefault();
                const intent = `saludclick:firma:${datos.visita_id}`;
                const key = sessionStorage.getItem(intent) || crypto.randomUUID();
                sessionStorage.setItem(intent, key);
                const button = form.querySelector("button");
                button.disabled = true;
                try {
                    await apiFetch(`${base}/etapas/FIRMAR`, {
                        method: "POST", headers: { "Idempotency-Key": key },
                        body: JSON.stringify({ visita_id: datos.visita_id, version: datos.version,
                            tratamiento: form.elements.tratamiento.checked, recepcion: form.elements.recepcion.checked })
                    });
                    sessionStorage.removeItem(intent);
                    location.reload();
                } catch (error) {
                    if (error.status && error.status < 500) sessionStorage.removeItem(intent);
                    estado.textContent = error.message;
                } finally { button.disabled = false; }
            });
        } catch (error) { estado.textContent = error.message; }
    }
}
