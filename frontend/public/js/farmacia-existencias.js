import { apiFetch } from './api.js';
import { imagenPredeterminada, imagenSegura } from './medicamento-imagen.js';
import {descargarProtegido} from './farmacia-descargas.js';

const availability = { DISPONIBLE: 'Disponible', AGOTADO: 'Agotado', INACTIVO: 'Inactivo', INCONSISTENTE: 'Inconsistencia: revisión requerida', DESCONOCIDA: 'Estado desconocido' };
const formula = { REQUIERE: 'Requiere fórmula: validación autorizada pendiente', NO_REQUIERE: 'No requiere fórmula', DESCONOCIDO: 'Requisito desconocido: dispensación bloqueada' };
const missing = value => value === null || value === undefined || value === '' ? 'Sin registrar' : String(value);
const publicacion = estado => ['DISPONIBLE', 'AGOTADO'].includes(estado) ? 'Publicado' : 'Sin publicar';
function disponibilidadCatalogo(med) {
    if (!Number.isInteger(med.stock) || med.stock < 0) return 'No disponible';
    if (med.stock === 0) return 'Agotado';
    return med.stock <= (med.stock_minimo ?? 0) ? 'Stock bajo' : 'Disponible';
}
const stockText = value => value < 0 ? `Inválido (${value}): no utilizable` : String(value);

export function initFarmaciaExistencias(tipo, { root = document, request = apiFetch, initialContext = {}, onContextChange = () => {} } = {}) {
    const section = root.querySelector(`[data-existencias="${tipo}"]`);
    if (!section) return null;
    const part = key => section.querySelector(`[data-existencias-part="${key}"]`);
    const catalogo = tipo === 'catalogo', propio=!catalogo&&root.getElementById('farmaciaApp')?.dataset.inventarioPropio==='true', endpoint = `/api/farmacia/${catalogo ? 'medicamentos' : propio?'existencias':'inventario'}`;
    if(propio){
        if(part('alcance'))part('alcance').textContent='Existencias propias acreditadas mediante ingresos autorizados. Las solicitudes reservan unidades al iniciar preparación y descuentan existencias al confirmar la entrega.';
        if(part('nota'))part('nota').textContent='Indicadores de tu farmacia, independientes de los filtros. Unidades disponibles = físicas − reservadas. Entregadas: historial confirmado.';
        if(part('excel-status'))part('excel-status').textContent='Exporta todos los resultados de tu farmacia con los filtros aplicados.';
    }
    const list = part('lista'), status = part('estado'), dialog = part('detalle'), content = part('contenido');
    let page = initialContext.inventoryPage || 1, pages = 0, sequence = 0, detailSequence = 0, busy = false;
    const search = part('buscar'), availabilityFilter = part('disponibilidad');
    if (!catalogo) {
        search.value = initialContext.search || '';
        availabilityFilter.value = initialContext.availability || 'todas';
        if (!availabilityFilter.value) availabilityFilter.value = 'todas';
    }
    const formulaFilter = part('formula');
    if (formulaFilter) formulaFilter.value = initialContext.formula || 'todas';
    const node = (tag, text, className) => { const el = root.createElement(tag); el.textContent = text; if(className)el.className=className; return el; };
    const say = (text, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
    function controls() {
        part('anterior').disabled = busy || page <= 1;
        part('siguiente').disabled = busy || page >= pages;
    }
    function summary(info) {
        if (catalogo) return;
        const aviso = part('alerta-bajo');
        if (aviso) aviso.textContent = info && Number.isInteger(info.bajos)
            ? `${info.bajos} medicamentos con stock bajo (1-5 unidades). Aviso orientativo ${propio?'de tu farmacia':'del catálogo global'}, independiente de los filtros.`
            : 'Alerta de stock bajo no disponible.';
        for (const el of section.querySelectorAll('[data-existencias-count]')) el.textContent = info ? String(info[el.dataset.existenciasCount]) : '—';
        part('integridad').textContent = info && (info.inconsistentes || info.desconocidos) ? `${info.inconsistentes} registros con inconsistencias y ${info.desconocidos} con estado desconocido requieren revisión. Las consultas no corrigen existencias.` : '';
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
            const fields = catalogo ? [
                ['Categoría', med.categoria?.nombre], ['Presentación', med.presentacion],
                ['Descripción', med.descripcion],
                ['Cantidad disponible', med.stock], ['Stock mínimo', med.stock_minimo ?? 0],
                ['Publicación', publicacion(med.estado)], ['Disponibilidad', disponibilidadCatalogo(med)]
            ] : [
                ['Identificador', med.id], ['Categoría', med.categoria?.nombre], ['Presentación', med.presentacion],
                ['Descripción', med.descripcion], ['Nombre genérico', med.nombre_generico], ['Principio activo', med.principio_activo],
                ['Concentración', med.concentracion], ['Forma farmacéutica', med.forma_farmaceutica], ['Vía de administración', med.via_administracion],
                ['Stock registrado',stockText(med.stock)],['Disponibilidad de existencias',med.stockBajo?'Stock bajo (1-5) - Disponible':availability[med.disponibilidad]],['Estado de catálogo',med.estado],['Fórmula',formula[med.requisitoFormula]],
                ['Registro sanitario', med.registro_sanitario], ['Estado registro INVIMA', med.estado_registro_invima],
                ['Catálogo verificado', med.catalogo_verificado ? 'Sí' : 'No'], ['CUM', med.cum], ['IUM', med.ium],
                ['Titular del registro', med.titular_registro], ['Modalidad de comercialización', med.modalidad_comercializacion]
            ];
            for (const [label, value] of fields) data.append(node('dt', label), node('dd', missing(value)));
            content.append(data);
            if(propio){const ledger=node('dl','');for(const [label,value] of [['Existencias físicas',med.fisico],['Unidades reservadas',med.reservado],['Unidades entregadas históricas',med.entregados]])ledger.append(node('dt',label),node('dd',String(value)));content.append(ledger);}
            if (!catalogo && med.requisitoFormula !== 'NO_REQUIERE') content.append(node('p', 'La dispensación permanece bloqueada hasta disponer de validación farmacéutica autorizada.'));
            if (!catalogo && med.disponibilidad === 'INCONSISTENTE') { const alert = node('p', 'Existencias inconsistentes: no utilizarlas hasta su revisión autorizada.'); alert.setAttribute('role', 'alert'); content.append(alert); }
        } catch (error) {
            if (current === detailSequence && dialog.open) { const alert = node('p', error.message || 'No se pudo cargar el detalle.'); alert.setAttribute('role', 'alert'); content.replaceChildren(alert); }
        } finally { if (current === detailSequence) content.setAttribute('aria-busy', 'false'); }
    }
    async function load() {
        const current = ++sequence;
        busy = true; controls(); list.setAttribute('aria-busy', 'true'); say('Cargando información…');
        try {
            const query = new URLSearchParams({ pagina: String(page) });
            if (!catalogo) {
                query.set('buscar', search.value.trim());
                query.set('disponibilidad', availabilityFilter.value);
            }
            if (formulaFilter) query.set('formula',formulaFilter.value);
            const result = await request(`${endpoint}?${query}`);
            if (current !== sequence) return;
            pages = result.paginacion.paginas;
            if (page > Math.max(1, pages)) { page = Math.max(1, pages); return await load(); }
            onContextChange({ inventoryPage: page, search: search?.value.trim() ?? '', availability: availabilityFilter?.value ?? 'todas', formula: formulaFilter?.value??'todas' });
            list.replaceChildren();
            for (const med of result.medicamentos) {
                const row = node('tr', '');
                const values = catalogo ? [med.nombre, missing(med.presentacion), String(med.stock), String(med.stock_minimo??0), publicacion(med.estado), disponibilidadCatalogo(med)]
                    : [med.codigo_fuente || String(med.id), med.nombre, missing(med.descripcion), missing(med.presentacion), stockText(med.stock), propio?String(med.entregados):'Sin titularidad verificada', (med.stockBajo ? 'Stock bajo (1-5) - Disponible' : availability[med.disponibilidad])];
                const headings = [...section.querySelectorAll('thead th')];
                for (const [index, value] of values.entries()) { const cell = node('td', value); cell.dataset.label = headings[index].textContent; row.append(cell); }
                if (catalogo) {
                    const image = root.createElement('img');
                    image.alt = '';
                    image.className = 'farmacia-med-image';
                    image.loading = 'lazy';
                    image.referrerPolicy = 'no-referrer';
                    image.addEventListener('error', () => { image.src = imagenPredeterminada; }, { once: true });
                    image.src = imagenSegura(med.imagen);
                    const name = node('span', med.nombre, 'farmacia-catalogo-identidad');
                    name.prepend(image);
                    row.firstElementChild.replaceChildren(name);
                }
                const cell = node('td', ''), button = node('button', 'Ver detalle'); button.type = 'button'; button.dataset.medicationId = String(med.id);
                button.setAttribute('aria-label', `Ver detalle de ${med.nombre}`); button.addEventListener('click', () => void detail(med.id)); cell.append(button); row.append(cell); list.append(row);
                cell.dataset.label = catalogo ? 'Acciones' : 'Detalle';
                if (catalogo) {
                    cell.classList.add('farmacia-catalogo-acciones');
                    const buttons = node('div', '', 'farmacia-catalogo-botones');
                    cell.append(buttons);
                    buttons.append(button);
                    document.dispatchEvent(new CustomEvent('farmacia:medicamento-acciones', { detail: { med, container: buttons } }));
                }
            }
            summary(result.resumen);
            part('pagina').textContent = `${result.paginacion.total} registros · Página ${page} de ${Math.max(1, pages)}`;
            if (catalogo) {
                part('paginacion').hidden = pages <= 1;
                say(result.medicamentos.length ? '' : 'No hay medicamentos registrados.');
            } else say(result.medicamentos.length ? 'Información actualizada.' : 'No se encontraron medicamentos para estos filtros.');
        } catch (error) {
            if (current === sequence) { list.replaceChildren(); pages = 0; if (catalogo) part('paginacion').hidden = true; summary(null); part('pagina').textContent = ''; say(error.message || 'No se pudo cargar la información.', true); }
        } finally { if (current === sequence) { busy = false; list.setAttribute('aria-busy', 'false'); controls(); } }
    }
    part('form')?.addEventListener('submit', event => { event.preventDefault(); page = 1; void load(); });
    part('limpiar')?.addEventListener('click', () => { part('buscar').value = ''; part('disponibilidad').value = 'todas'; if(formulaFilter)formulaFilter.value='todas'; page = 1; void load(); });
    for (const [key, delta] of [['anterior', -1], ['siguiente', 1]]) part(key).addEventListener('click', () => { if (!busy) { page = Math.max(1, page + delta); void load(); } });
    part('cerrar').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { if (!dialog.open) { detailSequence++; content.replaceChildren(); } });
    root.getElementById('refreshFarmacia').addEventListener('click', () => void load());
    if(!catalogo)part('excel')?.addEventListener('click',async()=>{
        const button=part('excel'),message=part('excel-status');button.disabled=true;message.textContent='Generando reporte de todos los resultados…';
        try{const query=new URLSearchParams({buscar:part('buscar').value.trim(),disponibilidad:part('disponibilidad').value,formula:part('formula').value});await descargarProtegido(`${endpoint}/reporte.xlsx?${query}`,`Inventario_SaludClick_${new Date().toISOString().slice(0,10)}.xlsx`);message.textContent=propio?'Reporte Excel descargado. Alcance: existencias propias.':'Reporte Excel descargado. Alcance: catálogo global.';}
        catch(e){message.textContent=e.message;message.setAttribute('role','alert');}finally{button.disabled=false;}
    });
    void load();
    if (initialContext.id) void detail(initialContext.id);
    return { refresh: load };
}
