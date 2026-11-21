import { apiFetch } from './api.js';
import {descargarProtegido} from './farmacia-descargas.js';

const labels = { PENDIENTE: 'Pendiente', APROBADA: 'Confirmada', PREPARANDO: 'En preparación', LISTA: 'Lista para entrega', ENTREGADA: 'Entregada', CANCELADA: 'Cancelada' };
const actions = { PREPARANDO: 'Iniciar preparación', LISTA: 'Marcar lista', ENTREGADA: 'Confirmar entrega' };
const blockedActions = { APROBADA: 'Iniciar preparación', PREPARANDO: 'Marcar lista', LISTA: 'Confirmar entrega' };
const nombrePaciente = usuario => [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ').trim() || 'Nombre no disponible';
const documentoPaciente = usuario => [usuario?.tipo_documento, usuario?.cedula].filter(Boolean).join(' ') || 'Documento no disponible';
const reasons = {
    PAGO_REAL_NO_APROBADO: 'Sin pago real aprobado. Un pago simulado no autoriza la operación.',
    VALIDACION_FARMACEUTICA_PENDIENTE: 'Requiere validación farmacéutica autorizada; la operación permanece bloqueada.',
    REQUISITO_FORMULA_DESCONOCIDO: 'Hay medicamentos con requisito de fórmula sin determinar; operación bloqueada.',
    SIN_MEDICAMENTOS: 'La solicitud no tiene medicamentos.',
    MEDICAMENTO_NO_DISPONIBLE: 'Un medicamento no está disponible en el catálogo. Se requiere revisión antes de preparar la solicitud.',
    PAGO_REAL_INSUFICIENTE: 'El pago real aprobado no cubre el total de la solicitud.',
    CANTIDADES_INVALIDAS: 'Las cantidades requieren revisión antes de continuar.'
};

export function initFarmaciaSolicitudes({ root = document, request = apiFetch, initialContext = {}, onContextChange = () => {} } = {}) {
    const get = id => root.getElementById(id);
    const target = get('farmaciaOrders'), status = get('farmaciaOrdersStatus');
    const detail = get('farmaciaSolicitudDetalle'), content = get('farmaciaSolicitudDetalleContent');
    const confirm = get('farmaciaSolicitudConfirmacion');
    let page = initialContext.page || 1, pages = 0, sequence = 0, detailSequence = 0, busy = false, stale = true, writing = false, selected = null, detailId = null;
    const search = get('documentoSolicitudFarmacia');
    let documento = '';
    const operation=get('farmaciaApp')?.dataset.solicitudes==='true',keys=new Map();
    const node = (tag, text, className) => { const el = root.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
    const say = (text, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
    function appendFormulas(container, order, heading = true) {
        if (heading) container.append(node('h4', 'Fórmula médica'));
        if (!order.formulas?.length) {
            container.append(node('p', 'Fórmula no disponible'));
            if (order.motivoFormula) container.append(node('p', order.motivoFormula));
            return;
        }
        for (const formula of order.formulas) {
            const group = node('div', '', 'farmacia-formula-actions');
            const feedback = node('p', '');
            feedback.setAttribute('role', 'status');
            group.append(node('p', formula.nombre));
            const path = `/api/farmacia/pedidos/${order.id}/formulas/${formula.id}`;
            const addButton = (label, descargar) => {
                const button = node('button', label);
                button.type = 'button';
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    feedback.textContent = '';
                    try {
                        await descargarProtegido(descargar ? path + '?descarga=1' : path, formula.nombre, { mostrar: !descargar });
                    } catch (error) {
                        feedback.textContent = error.message;
                    } finally {
                        button.disabled = busy || stale || writing;
                    }
                });
                group.append(button);
            };
            addButton('Ver fórmula', false);
            if (formula.permite_descarga) addButton(formula.tipo_mime === 'application/pdf' ? 'Descargar PDF' : 'Descargar fórmula', true);
            group.append(feedback);
            container.append(group);
        }
    }
    const date = value => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : 'Fecha no registrada';
    function controls() {
        get('ordersPrevious').disabled = busy || writing || page <= 1;
        get('ordersNext').disabled = busy || writing || page >= pages;
        for (const id of ['farmaciaOrdersRefresh', 'farmaciaOrdersClear', 'documentoSolicitudFarmacia']) get(id).disabled = writing;
        for (const button of target.querySelectorAll('button')) button.disabled = busy || stale || writing;
        get('farmaciaSolicitudConfirmar').disabled = writing;
        get('farmaciaSolicitudCancelar').disabled = writing;
        for (const button of content.querySelectorAll('button')) button.disabled = busy || stale || writing;
    }
    function appendOperation(container, order) {
        const { siguienteEstado: next, bloqueos } = order.operacion;
        if (!next && bloqueos.length && blockedActions[order.estado]) {
            const button = node('button', blockedActions[order.estado]);
            button.type = 'button';
            const feedback = node('div', '', 'farmacia-order-blocked');
            feedback.setAttribute('role', 'alert');
            feedback.hidden = true;
            button.addEventListener('click', () => {
                if (busy || stale || writing) return;
                feedback.hidden = false;
                feedback.replaceChildren(...bloqueos.map(reason =>
                    node('p', reasons[reason] || 'La operación requiere revisión.')));
            });
            container.append(button, feedback);
            return;
        }
        if (actions[next]) {
            const button = node('button', actions[next]); button.type = 'button';
            button.addEventListener('click', () => {
                if (busy || stale || writing) return;
                selected = order;
                if(get('farmaciaSolicitudRecepcion')){get('farmaciaSolicitudRecepcion').value='';get('farmaciaSolicitudRecepcion').disabled=!order.version||next!=='ENTREGADA';get('farmaciaSolicitudObservaciones').value='';get('farmaciaSolicitudObservaciones').disabled=!order.version;}
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
            const { pedido } = await request(`/api/farmacia/pedidos/${id}`);
            if (current !== detailSequence || !detail.open) return;
            content.replaceChildren();
            content.append(node('h3', `Solicitud #${pedido.id} · ${labels[pedido.estado]}`), node('p', date(pedido.fecha)));
            content.append(node('p', `Modalidad: ${pedido.tipo_entrega === 'DOMICILIO' ? 'Domicilio' : 'Recoger en farmacia'}`));
            content.append(node('p', `Paciente: ${nombrePaciente(pedido.usuario)}`), node('p', documentoPaciente(pedido.usuario)));
            if(pedido.eps)content.append(node('p',`EPS: ${pedido.eps}`));
            if(pedido.observaciones)content.append(node('p',`Observaciones: ${pedido.observaciones}`));
            if(pedido.updated_at)content.append(node('p',`Última actualización: ${date(pedido.updated_at)}`));
            if (pedido.tipo_entrega === 'DOMICILIO') content.append(node('p', `Dirección de entrega: ${pedido.direccion || 'No registrada'}`));
            const table = node('table', '', 'farmacia-order-items');
            table.append(node('caption', 'Medicamentos y cantidades'));
            const head = node('thead', ''), header = node('tr', '');
            const columns = ['Medicamento', 'Descripción', 'Presentación', 'Cantidad', 'Requisito de fórmula'];
            for (const text of columns) { const th = node('th', text); th.scope = 'col'; header.append(th); }
            head.append(header); table.append(head);
            const body = node('tbody', '');
            for (const item of pedido.detalles) {
                const row = node('tr', '');
                const values = [item.medicamento.nombre, item.medicamento.descripcion || 'Sin descripción',item.medicamento.presentacion||'Sin presentación registrada', String(item.cantidad), item.medicamento.requiere_formula === false ? 'No requiere' : item.medicamento.requiere_formula === true ? 'Requiere validación' : 'Sin determinar'];
                for (const [index, value] of values.entries()) {
                    const cell = node('td', value);
                    cell.dataset.label = columns[index];
                    row.append(cell);
                }
                body.append(row);
            }
            table.append(body); const wrap = node('div', '', 'farmacia-table'); wrap.append(table); content.append(wrap);
            appendOperation(content, pedido);
            appendFormulas(content, pedido);
            if(pedido.historial){content.append(node('h3','Historial de cambios'));for(const event of pedido.historial)content.append(node('p',`${date(event.created_at)} · ${event.responsable} · ${event.estado_anterior} → ${event.estado}${event.observaciones?' · '+event.observaciones:''}`));if(!pedido.historial.length)content.append(node('p','Sin cambios registrados por Farmacia.'));}
        } catch (error) {
            if (current === detailSequence && detail.open) { const alert = node('p', error.message || 'No se pudo cargar el detalle.'); alert.setAttribute('role', 'alert'); content.replaceChildren(alert); }
        } finally { if (current === detailSequence) content.setAttribute('aria-busy', 'false'); }
    }
    async function load() {
        const current = ++sequence;
        busy = true; stale = true; controls(); target.setAttribute('aria-busy', 'true'); say('Cargando solicitudes…');
        try {
            const query = new URLSearchParams({ pagina: String(page), estado: 'todas' });
            if (documento) query.set('documento', documento);
            const result = await request(`/api/farmacia/pedidos?${query}`);
            if (current !== sequence) return;
            pages = result.paginacion.paginas;
            if (page > Math.max(1, pages)) { page = Math.max(1, pages); return await load(); }
            onContextChange({ page: documento ? 1 : page });
            target.replaceChildren();
            if (result.pedidos.length) {
                const titles = ['Solicitud', 'Paciente', 'Medicamentos', 'Fórmula médica', 'Acciones'];
                const table = node('table', '', 'farmacia-requests-table');
                table.append(node('caption', 'Solicitudes asignadas'));
                const header = table.createTHead().insertRow();
                for (const title of titles) {
                    const cell = node('th', title);
                    cell.scope = 'col';
                    header.append(cell);
                }
                const body = table.createTBody();
                for (const order of result.pedidos) {
                    const row = body.insertRow();
                    row.className = 'farmacia-order';
                    row.dataset.status = order.estado;
                    const sections = titles.map(title => {
                        const cell = row.insertCell();
                        cell.dataset.label = title;
                        const section = node('div', '');
                        cell.append(section);
                        return section;
                    });
                    const [summary, patient, items, formulas, buttons] = sections;
                    summary.append(node('h3', `Solicitud #${order.id} · ${labels[order.estado]}`), node('p', date(order.fecha)));
                    patient.append(node('p', nombrePaciente(order.usuario)), node('p', documentoPaciente(order.usuario)));
                    if (order.eps) patient.append(node('p', order.eps));
                    if (order.detalles.length) {
                        const medications = node('ul', '');
                        for (const item of order.detalles) {
                            medications.append(node('li', `${item.medicamento.nombre} × ${item.cantidad}`));
                        }
                        items.append(medications);
                    } else {
                        items.append(node('p', 'Sin medicamentos registrados.'));
                    }
                    appendFormulas(formulas, order, false);
                    buttons.className = 'farmacia-order-actions';
                    appendOperation(buttons, order);
                    const more = node('button', 'Ver detalle');
                    more.type = 'button';
                    more.dataset.detail = String(order.id);
                    more.addEventListener('click', () => void openDetail(order.id));
                    buttons.append(more);
                }
                const wrap = node('div', '', 'farmacia-table');
                wrap.append(table);
                target.append(wrap);
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
            get('ordersPage').textContent = `${result.paginacion.total} solicitudes · Página ${page} de ${Math.max(1, pages)}`;
            say(result.pedidos.length ? 'Solicitudes actualizadas.' : documento ? 'No hay solicitudes para esta cédula.' : 'No hay solicitudes asignadas.');
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
    function applySearch() {
        documento = search.value.trim();
        page = 1;
        onContextChange({ page, id: '' });
        void load();
    }
    get('filtroPedidos').addEventListener('submit', event => { event.preventDefault(); if (!writing) applySearch(); });
    search.addEventListener('input', () => { if (!search.value.trim() && documento && !writing) applySearch(); });
    for (const id of ['retryFarmaciaStats', 'retryFarmaciaOrders']) get(id).addEventListener('click', () => { if (!writing) void load(); });
    get('farmaciaOrdersClear').addEventListener('click', () => { search.value = ''; applySearch(); search.focus(); });
    for (const [id, delta] of [['ordersPrevious', -1], ['ordersNext', 1]]) get(id).addEventListener('click', () => { page = Math.max(1, page + delta); void load(); });
    get('farmaciaSolicitudCerrar').addEventListener('click', () => detail.close());
    detail.addEventListener('close', () => { if (!detail.open) { detailSequence++; detailId = null; content.replaceChildren(); } });
    get('farmaciaSolicitudCancelar').addEventListener('click', () => confirm.close());
    confirm.addEventListener('cancel', event => { if (writing) event.preventDefault(); });
    confirm.addEventListener('close', () => { if (!confirm.open) selected = null; });
    get('farmaciaSolicitudConfirmar').addEventListener('click', async () => {
        if (writing || !selected) return;
        const order = selected;
        if(order.version&&order.operacion.siguienteEstado==='ENTREGADA'&&!get('farmaciaSolicitudRecepcion').value.trim()){say('Registra la recepción confirmada antes de entregar.',true);get('farmaciaSolicitudRecepcion').focus();return;}
        writing = true; controls(); confirm.close();
        try {
            const body={estadoActual:order.estado,estado:order.operacion.siguienteEstado};
            if(order.version){const key=`${order.id}:${order.version}`;if(!keys.has(key))keys.set(key,crypto.randomUUID());Object.assign(body,{version:order.version,clave:keys.get(key),recepcion:get('farmaciaSolicitudRecepcion').value.trim(),observaciones:get('farmaciaSolicitudObservaciones').value.trim()});}
            await request(`/api/farmacia/pedidos/${order.id}/estado`, { method: 'PATCH', body: JSON.stringify(body) });
            document.dispatchEvent(new Event('farmacia:solicitudes-actualizadas'));
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
    if (operation) root.addEventListener('farmacia:solicitudes-actualizadas', () => {
        if (!busy && !writing && !detail.open && !confirm.open) void load();
    });
    void load().then(loaded => {
        if (loaded && initialContext.id) return openDetail(initialContext.id);
    });
    return { refresh: load };
}
