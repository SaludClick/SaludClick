import { apiFetch } from './api.js';

const availability = { DISPONIBLE: 'Disponible', AGOTADO: 'Agotado', INACTIVO: 'Inactivo', INCONSISTENTE: 'Inconsistencia: revisión requerida', DESCONOCIDA: 'Estado desconocido' };
const formula = { REQUIERE: 'Requiere fórmula: validación autorizada pendiente', NO_REQUIERE: 'No requiere fórmula', DESCONOCIDO: 'Requisito desconocido: dispensación bloqueada' };
const missing = value => value === null || value === undefined || value === '' ? 'Sin registrar' : String(value);
const stockText = value => value < 0 ? `Inválido (${value}): no utilizable` : String(value);

export function initFarmaciaExistencias(tipo, { root = document, request = apiFetch, initialContext = {}, onContextChange = () => {} } = {}) {
    const section = root.querySelector(`[data-existencias="${tipo}"]`);
    if (!section) return null;
    const part = key => section.querySelector(`[data-existencias-part="${key}"]`);
    const catalogo = tipo === 'catalogo', endpoint = `/api/farmacia/${catalogo ? 'medicamentos' : 'inventario'}`;
    const list = part('lista'), status = part('estado'), dialog = part('detalle'), content = part('contenido');
    let page = catalogo ? 1 : initialContext.inventoryPage || 1, pages = 0, sequence = 0, detailSequence = 0, busy = false;
    if (!catalogo) part('buscar').value = initialContext.search || '';
    const node = (tag, text) => { const el = root.createElement(tag); el.textContent = text; return el; };
    const say = (text, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
    function controls() {
        part('anterior').disabled = busy || page <= 1;
        part('siguiente').disabled = busy || page >= pages;
    }
    function summary(info) {
        for (const el of section.querySelectorAll('[data-existencias-count]')) el.textContent = info ? String(info[el.dataset.existenciasCount]) : '—';
        part('integridad').textContent = info && (info.inconsistentes || info.desconocidos) ? `${info.inconsistentes} registros con inconsistencias y ${info.desconocidos} con estado desconocido requieren revisión. Las consultas no corrigen existencias.` : '';
        if (catalogo) {
            const stats = root.getElementById('farmaciaCatalogStats');
            if (stats) {
                stats.replaceChildren(); stats.setAttribute('aria-busy', 'false');
                for (const [key, label] of [['total', 'Medicamentos en catálogo'], ['disponibles', 'Con existencias disponibles'], ['agotados', 'Agotados']]) {
                    const article = node('article', ''); article.className = 'admin-stat';
                    article.append(node('strong', info ? String(info[key]) : '—'), node('span', label)); stats.append(article);
                }
            }
        }
    }
    async function detail(id) {
        const current = ++detailSequence;
        content.replaceChildren(node('p', 'Cargando detalle…')); content.setAttribute('aria-busy', 'true');
        if (!dialog.open) dialog.showModal();
        try {
            const { medicamento: med } = await request(`${endpoint}/${id}`);
            if (current !== detailSequence || !dialog.open) return;
            content.replaceChildren(node('h3', med.nombre));
            const data = node('dl', '');
            for (const [label, value] of [
                ['Identificador', med.id], ['Categoría', med.categoria?.nombre], ['Presentación', med.presentacion],
                ['Descripción', med.descripcion], ['Nombre genérico', med.nombre_generico], ['Principio activo', med.principio_activo],
                ['Concentración', med.concentracion], ['Forma farmacéutica', med.forma_farmaceutica], ['Vía de administración', med.via_administracion],
                ['Stock registrado', stockText(med.stock)], ['Disponibilidad de existencias', availability[med.disponibilidad]], ['Estado de catálogo', med.estado],
                ['Fórmula', formula[med.requisitoFormula]], ['Registro sanitario', med.registro_sanitario], ['Estado registro INVIMA', med.estado_registro_invima],
                ['Catálogo verificado', med.catalogo_verificado ? 'Sí' : 'No'], ['CUM', med.cum], ['IUM', med.ium],
                ['Titular del registro', med.titular_registro], ['Modalidad de comercialización', med.modalidad_comercializacion]
            ]) data.append(node('dt', label), node('dd', missing(value)));
            content.append(data);
            if (med.requisitoFormula !== 'NO_REQUIERE') content.append(node('p', 'La dispensación permanece bloqueada hasta disponer de validación farmacéutica autorizada.'));
            if (med.disponibilidad === 'INCONSISTENTE') { const alert = node('p', 'Existencias inconsistentes: no utilizarlas hasta su revisión autorizada.'); alert.setAttribute('role', 'alert'); content.append(alert); }
        } catch (error) {
            if (current === detailSequence && dialog.open) { const alert = node('p', error.message || 'No se pudo cargar el detalle.'); alert.setAttribute('role', 'alert'); content.replaceChildren(alert); }
        } finally { if (current === detailSequence) content.setAttribute('aria-busy', 'false'); }
    }
    async function load() {
        const current = ++sequence;
        busy = true; controls(); list.setAttribute('aria-busy', 'true'); say('Cargando información…');
        try {
            const query = new URLSearchParams({ pagina: String(page), buscar: part('buscar').value.trim(), disponibilidad: part('disponibilidad').value, formula: part('formula').value });
            const result = await request(`${endpoint}?${query}`);
            if (current !== sequence) return;
            pages = result.paginacion.paginas;
            if (page > Math.max(1, pages)) { page = Math.max(1, pages); return await load(); }
            if (!catalogo) onContextChange({ inventoryPage: page, search: part('buscar').value.trim() });
            list.replaceChildren();
            for (const med of result.medicamentos) {
                const row = node('tr', '');
                const values = catalogo ? [med.nombre, missing(med.presentacion), missing(med.principio_activo), availability[med.disponibilidad], formula[med.requisitoFormula]]
                    : [med.nombre, missing(med.presentacion), missing(med.categoria?.nombre), stockText(med.stock), availability[med.disponibilidad]];
                const headings = [...section.querySelectorAll('thead th')];
                for (const [index, value] of values.entries()) { const cell = node('td', value); cell.dataset.label = headings[index].textContent; row.append(cell); }
                const cell = node('td', ''), button = node('button', 'Ver detalle'); button.type = 'button'; button.dataset.medicationId = String(med.id);
                button.setAttribute('aria-label', `Ver detalle de ${med.nombre}`); button.addEventListener('click', () => void detail(med.id)); cell.append(button); row.append(cell); list.append(row);
                cell.dataset.label = 'Detalle';
            }
            summary(result.resumen);
            part('pagina').textContent = `${result.paginacion.total} registros · Página ${page} de ${Math.max(1, pages)}`;
            say(result.medicamentos.length ? 'Información actualizada.' : 'No se encontraron medicamentos para estos filtros.');
        } catch (error) {
            if (current === sequence) { list.replaceChildren(); pages = 0; summary(null); part('pagina').textContent = ''; say(error.message || 'No se pudo cargar la información.', true); }
        } finally { if (current === sequence) { busy = false; list.setAttribute('aria-busy', 'false'); controls(); } }
    }
    part('form').addEventListener('submit', event => { event.preventDefault(); page = 1; void load(); });
    part('limpiar').addEventListener('click', () => { part('buscar').value = ''; part('disponibilidad').value = 'todas'; part('formula').value = 'todas'; page = 1; void load(); });
    for (const [key, delta] of [['anterior', -1], ['siguiente', 1]]) part(key).addEventListener('click', () => { if (!busy) { page = Math.max(1, page + delta); void load(); } });
    part('cerrar').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { if (!dialog.open) { detailSequence++; content.replaceChildren(); } });
    root.getElementById('refreshFarmacia').addEventListener('click', () => void load());
    void load(); return { refresh: load };
}
