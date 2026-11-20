import { apiFetch } from './api.js';

const labels = { APROBADA: 'Aprobada', PREPARANDO: 'En preparación', LISTA: 'Lista', ENTREGADA: 'Entregada' };
const actions = { PREPARANDO: 'Iniciar preparación', LISTA: 'Marcar lista', ENTREGADA: 'Confirmar entrega' };
const reasons = {
    PAGO_REAL_NO_APROBADO: 'No hay un pago aprobado habilitado para este entorno.',
    VALIDACION_FARMACEUTICA_PENDIENTE: 'Requiere validación farmacéutica autorizada; la operación permanece bloqueada.',
    REQUISITO_FORMULA_DESCONOCIDO: 'Hay medicamentos con requisito de fórmula sin determinar; operación bloqueada.',
    SIN_MEDICAMENTOS: 'La solicitud no tiene medicamentos.'
};

export function initFarmaciaSolicitudes({ root = document, request = apiFetch, initialContext = {}, onContextChange = () => {} } = {}) {
    const get = id => root.getElementById(id);
    const target = get('farmaciaOrders'), status = get('farmaciaOrdersStatus');
    const detail = get('farmaciaSolicitudDetalle'), content = get('farmaciaSolicitudDetalleContent');
    const confirm = get('farmaciaSolicitudConfirmacion');
    let page = initialContext.page || 1, pages = 0, sequence = 0, detailSequence = 0, busy = false, stale = true, writing = false, selected = null, detailId = null;
    get('estadoFarmacia').value = initialContext.filter || '';
    get('buscarSolicitudFarmacia').value = initialContext.id || '';
    const node = (tag, text, className) => { const el = root.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
    const say = (text, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
    const date = value => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : 'Fecha no registrada';
    function controls() {
        get('ordersPrevious').disabled = busy || writing || page <= 1;
        get('ordersNext').disabled = busy || writing || page >= pages;
        for (const id of ['farmaciaOrdersRefresh', 'farmaciaOrdersClear', 'buscarSolicitudFarmacia', 'estadoFarmacia']) get(id).disabled = writing;
        for (const button of target.querySelectorAll('button')) button.disabled = busy || stale || writing;
        get('farmaciaSolicitudConfirmar').disabled = writing;
        get('farmaciaSolicitudCancelar').disabled = writing;
        for (const button of content.querySelectorAll('button')) button.disabled = busy || stale || writing;
    }
    function appendOperation(container, order) {
        if (order.operacion.simulacion) container.append(node('p', 'Pedido con pago simulado'));
        for (const reason of order.operacion.bloqueos) container.append(node('p', reasons[reason] || 'La operación requiere revisión.', 'farmacia-order-blocked'));
        const next = order.operacion.siguienteEstado;
        if (actions[next]) {
            const button = node('button', actions[next]); button.type = 'button';
            button.addEventListener('click', () => {
                if (busy || stale || writing) return;
                selected = order;
                get('farmaciaSolicitudConfirmacionText').textContent = `Solicitud #${order.id}: ${labels[order.estado]} → ${labels[next]}.`;
                if (!confirm.open) confirm.showModal();
                controls();
            });
            container.append(button);
        } else if (order.estado === 'ENTREGADA') container.append(node('p', 'Solicitud entregada. Sin transiciones disponibles.'));
    }
    async function openDetail(id) {
        detailId = id;
        const current = ++detailSequence;
        content.replaceChildren(node('p', 'Cargando detalle…')); content.setAttribute('aria-busy', 'true');
        if (!detail.open) detail.showModal();
        try {
            const { pedido } = await request(`/api/integracion/farmacia/pedidos/${id}`);
            if (current !== detailSequence || !detail.open) return;
            content.replaceChildren();
            content.append(node('h3', `Solicitud #${pedido.id} · ${labels[pedido.estado]}`), node('p', date(pedido.fecha)));
            content.append(node('p', `Modalidad: ${pedido.tipo_entrega === 'DOMICILIO' ? 'Domicilio' : 'Recoger en farmacia'}`));
            if (pedido.usuario) content.append(node('p', `Destinatario: ${pedido.usuario.nombre} ${pedido.usuario.apellido}`));
            if (pedido.tipo_entrega === 'DOMICILIO') content.append(node('p', `Dirección de entrega: ${pedido.direccion || 'No registrada'}`));
            const table = node('table', '', 'farmacia-order-items');
            table.append(node('caption', 'Medicamentos y cantidades'));
            const head = node('thead', ''), header = node('tr', '');
            for (const text of ['Medicamento', 'Descripción', 'Cantidad', 'Requisito de fórmula']) { const th = node('th', text); th.scope = 'col'; header.append(th); }
            head.append(header); table.append(head);
            const body = node('tbody', '');
            for (const item of pedido.detalles) {
                const row = node('tr', '');
                for (const text of [item.medicamento.nombre, item.medicamento.descripcion || 'Sin descripción', String(item.cantidad), item.medicamento.requiere_formula === false ? 'No requiere' : item.medicamento.requiere_formula === true ? 'Requiere validación' : 'Sin determinar']) row.append(node('td', text));
                body.append(row);
            }
            table.append(body); const wrap = node('div', '', 'farmacia-table'); wrap.append(table); content.append(wrap);
            appendOperation(content, pedido);
        } catch (error) {
            if (current === detailSequence && detail.open) { const alert = node('p', error.message || 'No se pudo cargar el detalle.'); alert.setAttribute('role', 'alert'); content.replaceChildren(alert); }
        } finally { if (current === detailSequence) content.setAttribute('aria-busy', 'false'); }
    }
    async function load() {
        const current = ++sequence;
        busy = true; stale = true; controls(); target.setAttribute('aria-busy', 'true'); say('Cargando solicitudes…');
        try {
            const query = new URLSearchParams({ pagina: String(page), estado: get('estadoFarmacia').value });
            const id = get('buscarSolicitudFarmacia').value.trim(); if (id) query.set('id', id);
            const result = await request(`/api/integracion/farmacia/pedidos?${query}`);
            if (current !== sequence) return;
            pages = result.paginacion.paginas;
            if (page > Math.max(1, pages)) { page = Math.max(1, pages); return await load(); }
            onContextChange({ page, filter: get('estadoFarmacia').value, id: get('buscarSolicitudFarmacia').value.trim() });
            target.replaceChildren();
            for (const order of result.pedidos) {
                const card = node('article', '', 'farmacia-order');
                card.dataset.status = order.estado;
                card.append(node('h3', `Solicitud #${order.id} · ${labels[order.estado]}`), node('p', `${date(order.fecha)} · ${order.tipo_entrega === 'DOMICILIO' ? 'Domicilio' : 'Recoger en farmacia'}`));
                const items = node('ul', '');
                for (const item of order.detalles) items.append(node('li', `${item.medicamento.nombre} · ${item.cantidad} unidades`));
                card.append(items);
                const buttons = node('div', '', 'farmacia-order-actions'); appendOperation(buttons, order);
                const more = node('button', 'Ver detalle'); more.type = 'button'; more.dataset.detail = String(order.id);
                more.addEventListener('click', () => void openDetail(order.id)); buttons.append(more); card.append(buttons); target.append(card);
            }
            for (const el of root.querySelectorAll('[data-order-count]')) el.textContent = String(result.resumen[el.dataset.orderCount]);
            for (const card of root.querySelectorAll('[data-order-status]')) {
                const key = { APROBADA: 'pendientes', PREPARANDO: 'preparando', LISTA: 'listas' }[card.dataset.orderStatus];
                card.querySelector('[data-count]').textContent = String(result.resumen[key]);
                card.querySelector('[data-count-message]').textContent = 'Total en todas las páginas';
                card.setAttribute('aria-busy', 'false');
            }
            get('retryFarmaciaStats').hidden = true;
            if (get('farmaciaOrdersSummaryStatus')) get('farmaciaOrdersSummaryStatus').textContent = 'Indicadores actualizados.';
            get('retryFarmaciaOrders').hidden = true;
            get('ordersAppliedFilter').textContent = `Vista: ${labels[get('estadoFarmacia').value] || (get('estadoFarmacia').value === 'todas' ? 'Todas las operativas' : 'Solicitudes activas')} · Más antiguos primero`;
            get('ordersPage').textContent = `${result.paginacion.total} solicitudes · Página ${page} de ${Math.max(1, pages)}`;
            say(result.pedidos.length ? 'Solicitudes actualizadas.' : 'No hay solicitudes para estos filtros.');
            stale = false;
            return true;
        } catch (error) {
            if (current === sequence) {
                pages = 0;
                target.replaceChildren();
                detailSequence++; detailId = null; content.replaceChildren();
                if (detail.open) detail.close();
                if (confirm.open) confirm.close();
                selected = null;
                get('ordersPage').textContent = 'Consulta no disponible';
                for (const el of root.querySelectorAll('[data-order-count]')) el.textContent = '—';
                for (const card of root.querySelectorAll('[data-order-status]')) {
                    card.setAttribute('aria-busy', 'false');
                    card.querySelector('[data-count]').textContent = '—';
                    card.querySelector('[data-count-message]').textContent = 'Sin actualizar. Reintenta la consulta.';
                }
                get('retryFarmaciaStats').hidden = false;
                if (get('farmaciaOrdersSummaryStatus')) get('farmaciaOrdersSummaryStatus').textContent = 'Indicadores no disponibles. Reintenta la consulta.';
                get('retryFarmaciaOrders').hidden = false;
                say(error.message || 'No se pudieron cargar las solicitudes.', true);
            }
            return false;
        } finally { if (current === sequence) { busy = false; target.setAttribute('aria-busy', 'false'); controls(); } }
    }
    get('filtroPedidos').addEventListener('submit', event => { event.preventDefault(); page = 1; void load(); });
    for (const card of root.querySelectorAll('[data-order-status]')) card.addEventListener('click', () => {
        if (writing) return;
        get('estadoFarmacia').value = card.dataset.orderStatus; page = 1;
        location.hash = 'pedidosFarmacia'; get('pedidosFarmacia').focus(); void load();
    });
    for (const id of ['retryFarmaciaStats', 'retryFarmaciaOrders']) get(id).addEventListener('click', () => { if (!writing) void load(); });
    get('farmaciaOrdersClear').addEventListener('click', () => { get('buscarSolicitudFarmacia').value = ''; get('estadoFarmacia').selectedIndex = 0; page = 1; void load(); });
    for (const [id, delta] of [['ordersPrevious', -1], ['ordersNext', 1]]) get(id).addEventListener('click', () => { page = Math.max(1, page + delta); void load(); });
    get('farmaciaSolicitudCerrar').addEventListener('click', () => detail.close());
    detail.addEventListener('close', () => { if (!detail.open) { detailSequence++; detailId = null; content.replaceChildren(); } });
    get('farmaciaSolicitudCancelar').addEventListener('click', () => confirm.close());
    confirm.addEventListener('cancel', event => { if (writing) event.preventDefault(); });
    confirm.addEventListener('close', () => { if (!confirm.open) selected = null; });
    get('farmaciaSolicitudConfirmar').addEventListener('click', async () => {
        if (writing || !selected) return;
        const order = selected; writing = true; controls(); confirm.close();
        try {
            await request(`/api/integracion/farmacia/solicitudes/${order.id}/estado`, { method: 'PATCH', body: JSON.stringify({ estadoActual: order.estado, estado: order.operacion.siguienteEstado }) });
            confirm.close(); const refreshed = await load();
            get('farmaciaMessage').textContent = refreshed ? `Solicitud #${order.id} actualizada.` : `La solicitud #${order.id} se actualizó, pero faltan datos por refrescar. Reintenta la consulta.`;
            if (detail.open && detailId === order.id) await openDetail(order.id);
        } catch (error) {
            confirm.close();
            if (error.status === 409) {
                const refreshed = await load();
                get('farmaciaMessage').textContent = refreshed ? 'El pedido cambió o no cumple las condiciones para avanzar. Lista actualizada.' : 'No se pudo refrescar el pedido. Reintenta la consulta.';
                if (detail.open && detailId === order.id) await openDetail(order.id);
            }
            say(error.message || 'No se pudo actualizar la solicitud.', true);
        } finally { writing = false; controls(); }
    });
    get('refreshFarmacia').addEventListener('click', () => { if (!writing) void load(); });
    void load();
    return { refresh: load };
}
