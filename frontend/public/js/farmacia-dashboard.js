import { apiFetch } from './api.js';

export function initFarmaciaDashboard() {
    let sequence = 0;
    const ordersStatus = document.getElementById('farmaciaDashboardOrdersStatus');
    const stockStatus = document.getElementById('farmaciaDashboardStockStatus');
    const retry = document.getElementById('retryFarmaciaStats');
    async function load() {
        const current = ++sequence;
        for (const status of [ordersStatus, stockStatus]) { status.textContent = 'Actualizando indicadores…'; status.setAttribute('role', 'status'); }
        document.querySelectorAll('[data-dashboard-state]').forEach(card => card.setAttribute('aria-busy', 'true'));
        document.getElementById('farmaciaCatalogStats').setAttribute('aria-busy', 'true');
        const results = await Promise.allSettled([
            apiFetch('/api/farmacia/pedidos?estado=todas&tamano=1'),
            apiFetch('/api/farmacia/inventario?tamano=1')
        ]);
        if (current !== sequence) return;
        const [orders, stock] = results;
        const keys = { APROBADA: 'pendientes', PREPARANDO: 'preparando', LISTA: 'listas', ENTREGADA: 'entregadas' };
        for (const card of document.querySelectorAll('[data-dashboard-state]')) {
            card.querySelector('[data-count]').textContent = orders.status === 'fulfilled' ? String(orders.value.resumen[keys[card.dataset.dashboardState]]) : '—';
            card.querySelector('[data-count-message]').textContent = orders.status === 'fulfilled' ? 'Total en todas las páginas' : 'Sin actualizar. Reintenta la consulta.';
            card.setAttribute('aria-busy', 'false');
        }
        for (const el of document.querySelectorAll('[data-dashboard-stock]')) el.textContent = stock.status === 'fulfilled' ? String(stock.value.resumen[el.dataset.dashboardStock]) : '—';
        document.getElementById('farmaciaCatalogStats').setAttribute('aria-busy', 'false');
        for (const [status, result] of [[ordersStatus, orders], [stockStatus, stock]]) {
            status.textContent = result.status === 'fulfilled' ? 'Indicadores actualizados.' : result.reason.message || 'No se pudieron actualizar los indicadores.';
            status.setAttribute('role', result.status === 'fulfilled' ? 'status' : 'alert');
        }
        retry.hidden = results.every(result => result.status === 'fulfilled');
    }
    document.getElementById('refreshFarmacia').addEventListener('click', () => void load());
    retry.addEventListener('click', () => void load());
    void load();
}
