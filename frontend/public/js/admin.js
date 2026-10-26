
import { checkAuthGuard, initAuth, getCurrentUser } from "./auth.js";
import { apiFetch } from "./api.js";

if (checkAuthGuard()) {
    document.addEventListener("DOMContentLoaded", async () => {
        const u = getCurrentUser();

        if (!u || ![1, 3].includes(Number(u.rol))) {
            location.href = "dashboard.html";
            return;
        }

        initAuth();

        const stats = document.getElementById("adminStats");
        const states = document.getElementById("orderStates");
        const formulas = document.getElementById("adminFormulas");
        const orders = document.getElementById("adminOrders");
        const msg = document.getElementById("adminMessage");

        const money = n =>
            new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0
            }).format(Number(n) || 0);

        const esc = v =>
            String(v ?? "").replace(/[&<>"']/g, c => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            }[c]));

        async function load() {
            try {
                const [
                    { estadisticas: s },
                    { formulas: f },
                    { pedidos: peds }
                ] = await Promise.all([
                    apiFetch("/api/dashboard/admin"),
                    apiFetch("/api/formulas/admin/all"),
                    apiFetch("/api/admin/pedidos")
                ]);

                stats.innerHTML = `
                    <article class="admin-stat">
                        <i class="fa-solid fa-users"></i>
                        <strong>${s.usuarios.total}</strong>
                        <span>Usuarios</span>
                        <small>${s.usuarios.activos} activos</small>
                    </article>

                    <article class="admin-stat">
                        <i class="fa-solid fa-cart-shopping"></i>
                        <strong>${s.pedidos.total}</strong>
                        <span>Pedidos</span>
                        <small>${s.pedidos.activos} activos</small>
                    </article>

                    <article class="admin-stat">
                        <i class="fa-solid fa-chart-column"></i>
                        <strong>${money(s.ventas)}</strong>
                        <span>Ventas simuladas</span>
                        <small>Pagos aprobados</small>
                    </article>

                    <article class="admin-stat">
                        <i class="fa-solid fa-pills"></i>
                        <strong>${s.inventario.unidades}</strong>
                        <span>Unidades en stock</span>
                        <small>${s.inventario.disponibles} productos disponibles</small>
                    </article>

                    <article class="admin-stat">
                        <i class="fa-solid fa-file-medical"></i>
                        <strong>${s.formulas.pendientes}</strong>
                        <span>Fórmulas pendientes</span>
                        <small>${s.formulas.total} documentos</small>
                    </article>
                `;

                states.innerHTML = s.estados.length
                    ? s.estados.map(x => `
                        <div class="state-row">
                            <span>${esc(x.estado)}</span>
                            <strong>${x.cantidad}</strong>
                        </div>
                    `).join("")
                    : "<p>No hay pedidos.</p>";

                orders.innerHTML = peds.length
                    ? peds.map(x => `
                        <tr>
                            <td>#${x.id}</td>
                            <td>
                                ${esc(x.usuario)}
                                <small>${esc(x.correo)}</small>
                            </td>
                            <td>${new Date(x.fecha).toLocaleString("es-CO")}</td>
                            <td>${money(x.total)}</td>
                            <td>${esc(x.pago)}</td>
                            <td>
                                <select
                                    data-order-id="${x.id}"
                                    class="admin-order-status"
                                    aria-label="Estado del pedido ${x.id}"
                                >
                                    ${[
                                        "PENDIENTE",
                                        "APROBADA",
                                        "PREPARANDO",
                                        "LISTA",
                                        "ENTREGADA",
                                        "CANCELADA"
                                    ].map(v => `
                                        <option ${v === x.estado ? "selected" : ""}>
                                            ${v}
                                        </option>
                                    `).join("")}
                                </select>
                            </td>
                        </tr>
                    `).join("")
                    : "<tr><td colspan='6'>No hay pedidos.</td></tr>";

                orders.querySelectorAll("select").forEach(sel => {
                    sel.addEventListener("change", async () => {
                        try {
                            await apiFetch(
                                `/api/admin/pedidos/${sel.dataset.orderId}`,
                                {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                        estado: sel.value
                                    })
                                }
                            );

                            load();
                        } catch (e) {
                            msg.textContent = e.message;
                        }
                    });
                });

                formulas.innerHTML = f.length
                    ? f.slice(0, 10).map(x => `
                        <div class="formula-admin-row">
                            <div>
                                <strong>${esc(x.nombre)}</strong>
                                <small>
                                    ${esc(x.usuario)} ·
                                    ${esc(x.correo)} ·
                                    ${new Date(x.created_at).toLocaleDateString("es-CO")}
                                </small>
                            </div>

                            <div>
                                <span class="status-badge">${esc(x.estado)}</span>

                                <button
                                    class="btn-outline btn-small"
                                    data-id="${x.id}"
                                    data-status="VALIDADA"
                                    type="button"
                                >
                                    Validar
                                </button>

                                <button
                                    class="btn-danger btn-small"
                                    data-id="${x.id}"
                                    data-status="RECHAZADA"
                                    type="button"
                                >
                                    Rechazar
                                </button>
                            </div>
                        </div>
                    `).join("")
                    : "<p>No hay fórmulas cargadas.</p>";

                formulas.querySelectorAll("button").forEach(b => {
                    b.addEventListener("click", async () => {
                        try {
                            await apiFetch(
                                `/api/formulas/admin/${b.dataset.id}`,
                                {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                        estado: b.dataset.status
                                    })
                                }
                            );

                            load();
                        } catch (e) {
                            msg.textContent = e.message;
                        }
                    });
                });

            } catch (e) {
                msg.textContent = e.message;
            }
        }

        document.getElementById("refreshAdmin").addEventListener("click", load);

        load();
    });
}
