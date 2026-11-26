import { checkAuthGuard, getCurrentUser } from "./auth.js";
import { apiFetch } from "./api.js";
import { paginaInicio, rolUsuario } from "./roles.js";

const actions = {
    AUTORIZAR: "Autorizar", CORREGIR: "Corregir autorización", RECHAZAR: "Rechazar",
    CANCELAR: "Cancelar", ASIGNAR: "Asignar farmacia", PREPARAR: "Preparar cantidades",
    ASIGNAR_VISITA: "Asignar domiciliario", REPROGRAMAR_VISITA: "Reprogramar visita",
    CONCILIAR_VISITA: "Conciliar entrega firmada", DISPENSAR: "Confirmar recogida en farmacia"
};
const states = {
    AUTORIZADA: "Autorizada", ASIGNADA: "Asignada", PREPARADA: "Preparada",
    EN_REPARTO: "En reparto", PARCIAL: "Entrega parcial", ENTREGADA: "Entregada",
    CANCELADA: "Cancelada", RECHAZADA: "Rechazada"
};

if (checkAuthGuard()) initialize();

function initializeHabilitacion(role) {
    const form = document.getElementById("habilitarDispensacion");
    const admin = role === 1;
    const perfil = admin ? "RESPONSABLE" : "DOMICILIARIO";
    const notice = document.getElementById("habilitarDispensacionAviso");
    document.getElementById("habilitarDispensacionTitulo").textContent =
        admin ? "Habilitar responsable de farmacia" : "Habilitar domiciliario";
    document.getElementById("habilitarDispensacionEtiqueta").textContent =
        admin ? "ID de la cuenta de farmacia" : "ID de la cuenta del domiciliario";
    form.hidden = false;
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const usuario = form.elements.usuario.valueAsNumber;
        const button = form.querySelector("button");
        button.disabled = true;
        notice.textContent = "Guardando habilitación…";
        try {
            await apiFetch(`/api/dispensacion/farmacia/personal/${usuario}`, {
                method: "PUT",
                body: JSON.stringify({ perfil, activo: true })
            });
            notice.textContent = `Cuenta #${usuario} habilitada.`;
            form.reset();
        } catch (error) {
            notice.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });
}

function initialize() {
    const user = getCurrentUser();
    const role = rolUsuario(user);
    const search = document.getElementById("buscarDispensacion");
    const form = document.getElementById("dispensacionAccion");
    const notice = document.getElementById("dispensacionAviso");
    const summary = document.getElementById("dispensacionResumen");
    const fields = document.getElementById("dispensacionCampos");
    const selector = form.elements.accion;
    document.getElementById("volverPanel").href = role === 4 ? "/pages/ips.html" : paginaInicio(user);
    if (role === 1 || role === 3) initializeHabilitacion(role);
    let orderId, order, pending;

    function selectActions() {
        const state = order?.estado;
        if (order?.vencida) return role === 4 && ["AUTORIZADA", "ASIGNADA", "PREPARADA", "PARCIAL"].includes(state) ? ["CANCELAR"] : [];
        if (role === 1) return state === "AUTORIZADA" ? ["ASIGNAR"] : [];
        if (role === 4) return !state ? ["AUTORIZAR", "RECHAZAR"] :
            state === "AUTORIZADA" ? ["CORREGIR", "CANCELAR"] :
            ["ASIGNADA", "PREPARADA", "PARCIAL"].includes(state) ? ["CANCELAR"] : [];
        if (state === "PREPARADA") return ["PREPARAR", "ASIGNAR_VISITA", "DISPENSAR"];
        if (state === "EN_REPARTO") return ["REPROGRAMAR_VISITA", "CONCILIAR_VISITA"];
        return ["ASIGNADA", "PARCIAL"].includes(state) ? ["PREPARAR"] : [];
    }

    function field(parent, label, name, type = "text") {
        const wrapper = document.createElement("label");
        const input = document.createElement("input");
        input.name = name;
        input.type = type;
        input.required = true;
        if (type === "number") {
            input.min = "1";
            input.max = "2147483647";
        } else if (type === "text") input.maxLength = name === "motivo" ? 500 : 160;
        wrapper.append(label, input);
        parent.append(wrapper);
    }

    function buildFields() {
        fields.replaceChildren();
        const action = selector.value;
        if (["AUTORIZAR", "CORREGIR", "PREPARAR"].includes(action)) {
            const rows = document.createElement("div");
            rows.className = "dispensacion-renglones";
            const includeStage = action !== "PREPARAR";
            const add = () => {
                const row = document.createElement("fieldset");
                row.className = "dispensacion-renglon";
                field(row, "Código del medicamento", "medicamento", "number");
                field(row, "Unidades", "cantidad", "number");
                if (includeStage) {
                    field(row, "Etapa", "etapa", "number");
                    row.querySelector("[name=etapa]").value = "1";
                    row.querySelector("[name=etapa]").max = "30";
                }
                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = "Quitar renglón";
                remove.addEventListener("click", () => { if (rows.children.length > 1) row.remove(); });
                row.append(remove);
                rows.append(row);
            };
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Agregar medicamento";
            button.addEventListener("click", add);
            fields.append(rows, button);
            add();
            if (includeStage) field(fields, "Vigente hasta", "vence_at", "datetime-local");
        }
        if (action === "ASIGNAR") field(fields, "Identificador de farmacia", "farmacia_id", "number");
        if (action === "ASIGNAR_VISITA") field(fields, "Identificador del domiciliario", "domiciliario_id", "number");
        if (["RECHAZAR", "CANCELAR", "REPROGRAMAR_VISITA"].includes(action)) field(fields, "Motivo", "motivo");
        if (action === "CONCILIAR_VISITA") field(fields, "Referencia de verificación", "referencia");
    }

    function body() {
        const action = selector.value;
        const values = new FormData(form);
        if (["AUTORIZAR", "CORREGIR", "PREPARAR"].includes(action)) {
            const cantidades = {}, stages = new Map();
            const medicines = values.getAll("medicamento"), amounts = values.getAll("cantidad"), stageNums = values.getAll("etapa");
            medicines.forEach((code, index) => {
                const units = Number(amounts[index]), stage = Number(stageNums[index] || 1);
                cantidades[code] = (cantidades[code] || 0) + units;
                const items = stages.get(stage) || {};
                items[code] = (items[code] || 0) + units;
                stages.set(stage, items);
            });
            if (action === "PREPARAR") return { cantidades };
            const etapas = Array.from({ length: stages.size }, (_, index) => stages.get(index + 1));
            if (etapas.some(stage => !stage)) throw new Error("Numera las etapas consecutivamente desde 1.");
            return { cantidades, etapas, vence_at: new Date(values.get("vence_at")).toISOString() };
        }
        if (action === "ASIGNAR") return { farmacia_id: Number(values.get("farmacia_id")) };
        if (action === "ASIGNAR_VISITA") return { domiciliario_id: Number(values.get("domiciliario_id")) };
        if (action === "CONCILIAR_VISITA") return { visita_id: order.visita_id, referencia: values.get("referencia") };
        if (action === "REPROGRAMAR_VISITA") return { visita_id: order.visita_id, motivo: values.get("motivo") };
        if (["RECHAZAR", "CANCELAR"].includes(action)) return { motivo: values.get("motivo") };
        return {};
    }

    function showOrder() {
        const fields = [
            ["Solicitud", orderId], ["Estado", order?.vencida ? "Autorización vencida" : states[order?.estado] || "Sin expediente"],
            ["Farmacia", order?.farmacia_id], ["Etapa", order?.etapa],
            ["Saldo por medicamento", Object.entries(order?.saldo || {}).map(([id, units]) => `${id}: ${units}`).join(" · ")]
        ];
        summary.replaceChildren();
        const list = document.createElement("dl");
        list.className = "dispensacion-resumen";
        for (const [label, value] of fields) if (value) {
            const term = document.createElement("dt"), detail = document.createElement("dd");
            term.textContent = label;
            detail.textContent = value;
            list.append(term, detail);
        }
        summary.append(list);
        summary.hidden = false;
        const available = selectActions();
        selector.replaceChildren(...available.map(action => new Option(actions[action], action)));
        form.hidden = !available.length;
        buildFields();
    }

    async function load(id) {
        const result = await apiFetch(`/api/dispensacion/solicitudes/${id}`);
        orderId = id;
        order = result.datos;
        showOrder();
    }

    function busy(active) {
        for (const container of [search, form]) container.querySelector("button[type=submit]").disabled = active;
    }
    search.addEventListener("submit", async event => {
        event.preventDefault();
        busy(true);
        notice.textContent = "Consultando solicitud…";
        const id = Number(search.elements.solicitud.value);
        try { await load(id); notice.textContent = ""; }
        catch (error) {
            order = undefined;
            orderId = id;
            summary.hidden = form.hidden = true;
            if (role === 4 && error.status === 404 && !error.message.includes("no habilitada")) showOrder();
            notice.textContent = error.message;
        } finally { busy(false); }
    });
    selector.addEventListener("change", buildFields);
    form.addEventListener("submit", async event => {
        event.preventDefault();
        busy(true);
        try {
            const action = selector.value;
            const payload = JSON.stringify(body());
            const identity = JSON.stringify([orderId, action, payload]);
            if (pending?.identity !== identity) pending = { identity, key: crypto.randomUUID() };
            notice.textContent = "Guardando…";
            const result = await apiFetch(`/api/dispensacion/solicitudes/${orderId}/etapas/${action}`, {
                method: "POST", headers: { "Idempotency-Key": pending.key }, body: payload
            });
            pending = undefined;
            order = result.datos;
            showOrder();
            notice.textContent = "Acción guardada. Estado actualizado.";
        } catch (error) { notice.textContent = error.message; }
        finally { busy(false); }
    });
}
