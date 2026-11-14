import { checkAuthGuard, getCurrentUser, initAuth, logout } from './auth.js';
import { apiFetch } from './api.js';
import { paginaInicio, rolUsuario, ROLES } from './roles.js';
import { readFarmaciaContext, farmaciaContextUrl } from './farmacia-context.js';

const nextStatus = { APROBADA: ['PREPARANDO', 'Iniciar preparación'], PREPARANDO: ['LISTA', 'Marcar listo'], LISTA: ['ENTREGADA', 'Confirmar entrega'] };
const statusLabel = { APROBADA: 'Por preparar', PREPARANDO: 'En preparación', LISTA: 'Listo para entregar', ENTREGADA: 'Entregado' };
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
    const mobileMenu = window.matchMedia('(max-width: 900px)');
    const syncMenuAccessibility = () => {
        document.getElementById('menu').inert = mobileMenu.matches && !document.getElementById('menu').classList.contains('active');
    };
    const closeMenu = () => {
        document.getElementById('menu').classList.remove('active');
        document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
        syncMenuAccessibility();
    };
    document.getElementById('menuToggle').addEventListener('click', () => queueMicrotask(syncMenuAccessibility));
    mobileMenu.addEventListener('change', closeMenu);
    syncMenuAccessibility();
    const updateNavigation = () => {
        const hash = location.hash || '#panelFarmacia';
        document.querySelectorAll('#menu a').forEach(link => {
            const active = link.hash === hash;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
        });
    };
    window.addEventListener('hashchange', updateNavigation);
    document.querySelectorAll('#menu a').forEach(link => link.addEventListener('click', () => {
        closeMenu();
        if (link.hash) document.querySelector(link.hash)?.focus();
    }));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById('menu').classList.contains('active')) {
            closeMenu(); document.getElementById('menuToggle').focus();
        }
    });
    document.getElementById('farmaciaMain').hidden = false;
    const message = document.getElementById('farmaciaMessage');
    const context = readFarmaciaContext(location.search);
    const state = {
        orders: { page: context.page, sequence: 0, filter: context.filter, stale: true },
        inventory: { page: context.inventoryPage, sequence: 0, search: context.search }
    };
    document.getElementById('estadoFarmacia').value = context.filter;
    document.getElementById('buscarFarmacia').value = context.search;
    const saveContext = () => {
        const url = farmaciaContextUrl({ filter: state.orders.filter, page: state.orders.page,
            search: state.inventory.search, inventoryPage: state.inventory.page }, location.hash);
        history.replaceState(null, '', url);
        document.querySelector('#menu a[href^="/pages/chat-farmacia.html"]').href = `/pages/chat-farmacia.html?volver=${encodeURIComponent(url)}`;
        document.querySelectorAll('[data-order-status]').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.orderStatus === state.orders.filter)));
        updateNavigation();
    };
    window.addEventListener('hashchange', saveContext);
    saveContext();
    const pending = new Set();
    const syncOrderButtons = () => document.querySelectorAll('[data-order-id]').forEach(button => {
        button.disabled = state.orders.stale || pending.has(Number(button.dataset.orderId));
    });
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
    document.getElementById('retryFarmaciaStats').addEventListener('click', async () => {
        if (await refreshOrders()) { clearMessage(); message.textContent = 'Datos de pedidos actualizados.'; }
    });
    document.querySelectorAll('[data-order-status]').forEach(card => card.addEventListener('click', () => {
        document.getElementById('estadoFarmacia').value = card.dataset.orderStatus;
        state.orders.filter = card.dataset.orderStatus;
        state.orders.page = 1;
        location.hash = 'pedidosFarmacia';
        saveContext();
        document.getElementById('pedidosFarmacia').focus();
        loadOrders();
    }));
    function pagination(type, info, shown) {
        const first = shown ? (info.pagina - 1) * info.tamano + 1 : 0;
        document.getElementById(`${type}Page`).textContent = `Mostrando ${first}–${shown ? first + shown - 1 : 0} de ${info.total} · Página ${info.pagina} de ${Math.max(1, info.paginas)}`;
        document.getElementById(`${type}Previous`).disabled = info.pagina <= 1;
        document.getElementById(`${type}Next`).disabled = info.pagina >= info.paginas;
    }
    async function loadOrders() {
        const sequence = ++state.orders.sequence;
        const target = document.getElementById('farmaciaOrders');
        const status = document.getElementById('ordersMessage');
        const filter = state.orders.filter;
        let page = state.orders.page;
        state.orders.stale = true;
        syncOrderButtons();
        target.setAttribute('aria-busy', 'true');
        status.textContent = 'Cargando pedidos…';
        status.setAttribute('role', 'status');
        document.getElementById('retryFarmaciaOrders').hidden = true;
        try {
            let result;
            for (let attempt = 0; attempt < 3; attempt++) {
                const query = new URLSearchParams({ pagina: String(page), estado: filter });
                result = await apiFetch(`/api/farmacia/pedidos?${query}`);
                if (sequence !== state.orders.sequence) return true;
                const last = Math.max(1, result.paginacion.paginas);
                if (page <= last && (result.pedidos.length || result.paginacion.total === 0)) break;
                page = Math.min(page, last);
                if (attempt === 2) throw new Error('Los pedidos cambiaron durante la consulta. Reintenta.');
            }
            state.orders.page = page;
            saveContext();
            target.replaceChildren();
            document.getElementById('ordersAppliedFilter').textContent = `Vista: ${statusLabel[filter] || 'Pedidos activos'} · Más antiguos primero`;
            if (!result.pedidos.length) target.append(element('p', 'No hay pedidos para este filtro.'));
            for (const order of result.pedidos) {
                const card = element('article', ''); card.className = 'farmacia-order';
                card.dataset.status = order.estado;
                const heading = element('div', ''); heading.className = 'farmacia-order-heading';
                heading.append(element('h3', `Pedido #${order.id}`));
                const badge = element('span', statusLabel[order.estado] || order.estado); badge.className = 'farmacia-status';
                heading.append(badge); card.append(heading);
                const date = order.fecha ? new Date(order.fecha) : null;
                if (date && !Number.isNaN(date.getTime())) {
                    const time = element('time', `Creado: ${new Intl.DateTimeFormat('es-CO', {dateStyle:'medium',timeStyle:'short'}).format(date)}`);
                    time.dateTime = date.toISOString(); card.append(time);
                } else card.append(element('p', 'Fecha no registrada'));
                card.append(element('p', `Paciente: ${order.usuario.nombre} ${order.usuario.apellido}`));
                card.append(element('p', `Entrega: ${order.tipo_entrega === 'DOMICILIO' ? 'Domicilio' : 'Recoger en farmacia'}`));
                if (order.tipo_entrega === 'DOMICILIO') card.append(element('p', order.direccion || 'Dirección no registrada'));
                const items = element('ul', '');
                for (const item of order.detalles) items.append(element('li', `${item.medicamento.nombre} · ${item.cantidad} unidades`));
                card.append(items);
                const next = nextStatus[order.estado];
                if (next) {
                    const button = element('button', next[1]); button.type = 'button';
                    button.dataset.orderId = String(order.id);
                    button.setAttribute('aria-label', `${next[1]} del pedido #${order.id}`);
                    button.addEventListener('click', () => advanceOrder(order, next, button));
                    card.append(button);
                }
                else card.append(element('p', 'Entrega completada. No hay acciones pendientes.'));
                target.append(card);
            }
            pagination('orders', result.paginacion, result.pedidos.length);
            state.orders.stale = false;
            status.textContent = '';
            return true;
        } catch (error) {
            if (sequence === state.orders.sequence) {
                status.textContent = `Pedidos sin actualizar: ${error.message}`;
                status.setAttribute('role', 'alert');
                document.getElementById('retryFarmaciaOrders').hidden = false;
            }
            return false;
        } finally {
            if (sequence === state.orders.sequence) {
                target.setAttribute('aria-busy', 'false');
                syncOrderButtons();
            }
        }
    }
    async function refreshOrders() {
        const results = await Promise.all([loadOrders(), loadStats()]);
        return results.every(Boolean);
    }
    async function advanceOrder(order, next, button) {
        if (pending.has(order.id) || state.orders.stale) return;
        pending.add(order.id);
        const hadFocus = document.activeElement === button;
        button.disabled = true;
        button.textContent = 'Guardando…';
        clearMessage();
        try {
            await apiFetch(`/api/farmacia/pedidos/${order.id}/estado`, {
                method: 'PATCH', body: JSON.stringify({ estadoActual: order.estado, estado: next[0] })
            });
            const refreshed = await refreshOrders();
            message.textContent = refreshed ? `Pedido #${order.id} actualizado a ${next[0]}.` :
                `El pedido #${order.id} se actualizó, pero faltan datos por refrescar. Reintenta la consulta.`;
            message.setAttribute('role', refreshed ? 'status' : 'alert');
        } catch (error) {
            const refreshed = await refreshOrders();
            showError({ message: error.status === 409 ?
                `El pedido cambió o no cumple las condiciones para avanzar. ${refreshed ? 'Lista actualizada.' : 'Reintenta la consulta.'}` :
                `No se pudo confirmar el cambio. ${refreshed ? 'Consulta el estado actualizado antes de intentar de nuevo.' : 'Reintenta la consulta antes de avanzar.'}` });
        } finally {
            pending.delete(order.id);
            button.textContent = next[1];
            syncOrderButtons();
            if (hadFocus && !button.isConnected && document.activeElement === document.body) {
                document.getElementById('pedidosFarmacia').focus();
            }
        }
    }
    async function loadInventory() {
        const sequence = ++state.inventory.sequence;
        const target = document.getElementById('farmaciaInventory');
        const status = document.getElementById('inventoryMessage');
        target.setAttribute('aria-busy', 'true');
        status.textContent = 'Cargando inventario…';
        status.setAttribute('role', 'status');
        document.getElementById('retryFarmaciaInventory').hidden = true;
        try {
            let page = state.inventory.page;
            let result;
            for (let attempt = 0; attempt < 3; attempt++) {
                const query = new URLSearchParams({ pagina: String(page), buscar: state.inventory.search });
                result = await apiFetch(`/api/farmacia/inventario?${query}`);
                if (sequence !== state.inventory.sequence) return true;
                const last = Math.max(1, result.paginacion.paginas);
                if (page <= last) break;
                page = last;
                if (attempt === 2) throw new Error('El inventario cambió. Reintenta.');
            }
            state.inventory.page = page;
            saveContext();
            target.replaceChildren();
            for (const medication of result.medicamentos) {
                const row = element('tr', '');
                const cells = [
                    ['Medicamento', medication.nombre], ['Categoría', medication.categoria.nombre],
                    ['Unidades en stock', `${medication.stock} unidades${Number(medication.stock) === 0 ? ' · Sin existencias' : ''}`],
                    ['Estado del registro', medication.estado]
                ];
                for (const [label, value] of cells) {
                    const cell = element('td', ''); cell.dataset.label = label;
                    cell.append(element('span', String(value))); row.append(cell);
                }
                target.append(row);
            }
            document.getElementById('inventoryAppliedSearch').textContent = state.inventory.search ? `Coincidencias para: ${state.inventory.search}` : 'Todos los medicamentos';
            document.getElementById('inventoryEmpty').textContent = result.medicamentos.length ? '' : 'No se encontraron medicamentos.';
            pagination('inventory', result.paginacion, result.medicamentos.length);
            status.textContent = '';
            return true;
        } catch (error) {
            if (sequence === state.inventory.sequence) {
                status.textContent = `Inventario sin actualizar: ${error.message}`;
                status.setAttribute('role', 'alert');
                document.getElementById('retryFarmaciaInventory').hidden = false;
            }
            return false;
        }
        finally { if (sequence === state.inventory.sequence) target.setAttribute('aria-busy', 'false'); }
    }
    document.getElementById('filtroPedidos').addEventListener('submit', event => {
        event.preventDefault(); state.orders.page = 1;
        state.orders.filter = document.getElementById('estadoFarmacia').value;
        saveContext();
        loadOrders();
    });
    document.getElementById('buscarInventario').addEventListener('submit', event => {
        event.preventDefault(); state.inventory.page = 1;
        state.inventory.search = document.getElementById('buscarFarmacia').value.trim();
        saveContext();
        loadInventory();
    });
    document.getElementById('retryFarmaciaOrders').addEventListener('click', async () => {
        if (await refreshOrders()) { clearMessage(); message.textContent = 'Datos de pedidos actualizados.'; }
    });
    document.getElementById('retryFarmaciaInventory').addEventListener('click', loadInventory);
    document.getElementById('clearFarmaciaInventory').addEventListener('click', () => {
        document.getElementById('buscarFarmacia').value = '';
        state.inventory.search = ''; state.inventory.page = 1;
        saveContext(); loadInventory(); document.getElementById('buscarFarmacia').focus();
    });
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
