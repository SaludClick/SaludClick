import { checkAuthGuard, getCurrentUser, initAuth, logout } from './auth.js';
import { apiFetch } from './api.js';
import { paginaInicio, rolUsuario, ROLES } from './roles.js';

const nextStatus = { APROBADA: ['PREPARANDO', 'Iniciar preparación'], PREPARANDO: ['LISTA', 'Marcar listo'], LISTA: ['ENTREGADA', 'Confirmar entrega'] };
const element = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };

if (checkAuthGuard()) document.addEventListener('DOMContentLoaded', () => {
    const user = getCurrentUser();
    if (rolUsuario(user) !== ROLES.FARMACIA) {
        window.location.replace(paginaInicio(user));
        return;
    }
    initAuth();
    document.getElementById('farmaciaUserName').textContent = user.nombre || 'Farmacia';
    document.getElementById('logout').addEventListener('click', logout);
    const closeMenu = () => {
        document.getElementById('menu').classList.remove('active');
        document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
    };
    document.querySelectorAll('#menu a').forEach(link => link.addEventListener('click', () => {
        closeMenu();
        document.querySelectorAll('#menu a').forEach(item => item.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'page');
        if (link.hash) document.querySelector(link.hash)?.focus();
    }));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById('menu').classList.contains('active')) {
            closeMenu(); document.getElementById('menuToggle').focus();
        }
    });
    document.getElementById('farmaciaMain').hidden = false;
    const message = document.getElementById('farmaciaMessage');
    const state = { orders: { page: 1, sequence: 0 }, inventory: { page: 1, sequence: 0 } };
    const showError = error => { message.textContent = error.message || 'No se pudo completar la operación.'; message.setAttribute('role', 'alert'); };
    const clearMessage = () => { message.textContent = ''; message.setAttribute('role', 'status'); };
    let statsSequence = 0;
    async function loadStats() {
        const sequence = ++statsSequence;
        const cards = [...document.querySelectorAll('[data-order-status]')];
        cards.forEach(card => {
            card.setAttribute('aria-busy', 'true');
            card.querySelector('[data-count-message]').textContent = 'Actualizando…';
        });
        const results = await Promise.allSettled(cards.map(async card => {
            const result = await apiFetch(`/api/farmacia/pedidos?pagina=1&estado=${card.dataset.orderStatus}`);
            if (sequence !== statsSequence) return;
            card.querySelector('[data-count]').textContent = String(result.paginacion.total);
            card.dataset.loaded = 'true';
            card.querySelector('[data-count-message]').textContent = result.paginacion.total === 0 ? 'Sin pedidos en este estado' : 'Total en todas las páginas';
        }));
        if (sequence !== statsSequence) return false;
        results.forEach((result, index) => {
            const card = cards[index];
            card.setAttribute('aria-busy', 'false');
            if (result.status === 'rejected') {
                if (!card.dataset.loaded) card.querySelector('[data-count]').textContent = 'No disponible';
                card.querySelector('[data-count-message]').textContent = 'Sin actualizar. Reintenta la consulta.';
            }
        });
        const ok = results.every(result => result.status === 'fulfilled');
        document.getElementById('retryFarmaciaStats').hidden = ok;
        return ok;
    }
    document.getElementById('retryFarmaciaStats').addEventListener('click', loadStats);
    document.querySelectorAll('[data-order-status]').forEach(card => card.addEventListener('click', () => {
        document.getElementById('estadoFarmacia').value = card.dataset.orderStatus;
        state.orders.page = 1;
        document.getElementById('pedidosFarmacia').focus();
        loadOrders();
    }));
    function pagination(type, info) {
        document.getElementById(`${type}Page`).textContent = `${info.total} registros · Página ${info.pagina} de ${Math.max(1, info.paginas)}`;
        document.getElementById(`${type}Previous`).disabled = info.pagina <= 1;
        document.getElementById(`${type}Next`).disabled = info.pagina >= info.paginas;
    }
    async function loadOrders() {
        const sequence = ++state.orders.sequence;
        const target = document.getElementById('farmaciaOrders');
        target.setAttribute('aria-busy', 'true');
        clearMessage();
        try {
            const query = new URLSearchParams({ pagina: String(state.orders.page), estado: document.getElementById('estadoFarmacia').value });
            const result = await apiFetch(`/api/farmacia/pedidos?${query}`);
            if (sequence !== state.orders.sequence) return;
            target.replaceChildren();
            if (!result.pedidos.length) target.append(element('p', 'No hay pedidos para este filtro.'));
            for (const order of result.pedidos) {
                const card = element('article', ''); card.className = 'farmacia-order';
                card.append(element('h3', `Pedido #${order.id} · ${order.estado}`));
                card.append(element('p', `${order.usuario.nombre} ${order.usuario.apellido} · ${order.tipo_entrega === 'DOMICILIO' ? 'Domicilio' : 'Recoger en farmacia'}`));
                if (order.tipo_entrega === 'DOMICILIO') card.append(element('p', order.direccion || 'Dirección no registrada'));
                const items = element('ul', '');
                for (const item of order.detalles) items.append(element('li', `${item.medicamento.nombre} · ${item.cantidad} unidades`));
                card.append(items);
                const next = nextStatus[order.estado];
                if (next) {
                    const button = element('button', next[1]); button.type = 'button';
                    button.addEventListener('click', async () => {
                        button.disabled = true;
                        try {
                            await apiFetch(`/api/farmacia/pedidos/${order.id}/estado`, { method: 'PATCH', body: JSON.stringify({ estadoActual: order.estado, estado: next[0] }) });
                            await loadOrders();
                        } catch (error) {
                            if (error.status === 409) await loadOrders();
                            showError(error);
                        } finally { button.disabled = false; }
                    });
                    card.append(button);
                }
                target.append(card);
            }
            pagination('orders', result.paginacion);
        } catch (error) {
            if (sequence === state.orders.sequence) { target.replaceChildren(); showError(error); }
        } finally { if (sequence === state.orders.sequence) target.setAttribute('aria-busy', 'false'); }
    }
    async function loadInventory() {
        const sequence = ++state.inventory.sequence;
        const target = document.getElementById('farmaciaInventory');
        target.setAttribute('aria-busy', 'true');
        try {
            const query = new URLSearchParams({ pagina: String(state.inventory.page), buscar: document.getElementById('buscarFarmacia').value.trim() });
            const result = await apiFetch(`/api/farmacia/inventario?${query}`);
            if (sequence !== state.inventory.sequence) return;
            target.replaceChildren();
            for (const medication of result.medicamentos) {
                const row = element('tr', '');
                for (const value of [medication.nombre, medication.categoria.nombre, medication.stock, medication.estado]) row.append(element('td', String(value)));
                target.append(row);
            }
            document.getElementById('inventoryEmpty').textContent = result.medicamentos.length ? '' : 'No se encontraron medicamentos.';
            pagination('inventory', result.paginacion);
        } catch (error) { if (sequence === state.inventory.sequence) { target.replaceChildren(); showError(error); } }
        finally { if (sequence === state.inventory.sequence) target.setAttribute('aria-busy', 'false'); }
    }
    document.getElementById('filtroPedidos').addEventListener('submit', event => { event.preventDefault(); state.orders.page = 1; loadOrders(); });
    document.getElementById('buscarInventario').addEventListener('submit', event => { event.preventDefault(); state.inventory.page = 1; clearMessage(); loadInventory(); });
    for (const [type, load] of [['orders', loadOrders], ['inventory', loadInventory]]) {
        for (const [direction, delta] of [['Previous', -1], ['Next', 1]]) document.getElementById(`${type}${direction}`).addEventListener('click', () => {
            state[type].page = Math.max(1, state[type].page + delta); load();
        });
    }
    document.getElementById('refreshFarmacia').addEventListener('click', async () => {
        document.getElementById('refreshFarmacia').disabled = true;
        await Promise.allSettled([loadOrders(), loadInventory(), loadStats()]);
        document.getElementById('refreshFarmacia').disabled = false;
    });
    loadOrders(); loadInventory(); loadStats();
});
