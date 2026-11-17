import { checkAuthGuard, initAuth, getToken } from './auth.js';
import { STORAGE_KEY, MAX_CANTIDAD, IMAGEN_MEDICAMENTO_RESPALDO, setCatalogo, leerEstado, actualizarPedido, totalUnidades } from './pedido-temporal.js';
import { apiFetch } from './api.js';

if (checkAuthGuard()) document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    const $ = id => document.getElementById(id);
    const grid = $('catalogoMedicamentos');
    const search = $('buscadorMedicamentos');
    const category = $('filtroCategoriaMedicamentos');
    const notice = $('catalogoEstado');
    const selection = $('detallePedido');
    const confirm = $('confirmarPedido');
    let items = [];
    let ready = false;
    let visibleLimit = 24;
    let loading = false;
    const normalize = value => String(value).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const element = (tag, text, cls) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    };
    const say = text => { $('mensajePedido').textContent = text; };
    const limit = med => Math.min(99, MAX_CANTIDAD, med.stock);
    function state(value, text) {
        notice.dataset.state = value;
        notice.textContent = text;
        notice.setAttribute('role', value === 'error' ? 'alert' : 'status');
        grid.setAttribute('aria-busy', String(value === 'loading'));
    }
    function card(med) {
        const article = element('article', undefined, 'mc-card');
        article.dataset.categoriaId = med.categoriaId;
        article.dataset.catalogId = med.id;
        const imageBox = element('div', undefined, 'mc-image');
        const img = element('img', undefined, 'mc-medication-image');
        img.src = med.imagen;
        img.alt = med.nombre;
        img.loading = 'lazy';
        img.width = 160;
        img.height = 120;
        img.addEventListener('error', () => { img.src = IMAGEN_MEDICAMENTO_RESPALDO; }, { once: true });
        imageBox.append(img);
        const body = element('div', undefined, 'mc-card-body');
        body.append(element('span', med.categoria, 'mc-category'), element('h3', med.nombre), element('p', med.presentacion, 'mc-presentation'));
        body.append(element('p', med.disponible ? 'Disponible · ' + med.stock + ' unidades' : (med.estado === 'INACTIVO' ? 'No disponible' : 'Sin existencias'), 'mc-availability' + (med.disponible ? '' : ' mc-unavailable')));
        const prescription = med.requiereFormula === true ? 'Requiere fórmula médica' : med.requiereFormula === false ? 'No requiere fórmula según el catálogo' : 'Prescripción: información no registrada';
        body.append(element('p', prescription, 'mc-prescription'));
        const button = element('button', med.disponible ? 'Agregar a solicitud' : 'No disponible', 'mc-primary');
        button.type = 'button';
        button.dataset.medicamentoId = med.id;
        button.disabled = !med.disponible;
        button.setAttribute('aria-label', 'Agregar ' + med.nombre + ' a la solicitud');
        body.append(button);
        article.append(imageBox, body);
        return article;
    }
    function filter(reset = true) {
        if (!ready) return;
        if (reset) visibleLimit = 24;
        const q = normalize(search.value.trim());
        const filtered = items.filter(med => normalize(med.nombre).includes(q) && (!category.value || String(med.categoriaId) === category.value));
        grid.replaceChildren(...filtered.slice(0, visibleLimit).map(card));
        $('catalogoResultados').textContent = filtered.length + (filtered.length === 1 ? ' medicamento' : ' medicamentos');
        $('verMasMedicamentos').hidden = filtered.length <= visibleLimit;
        state(filtered.length ? 'loaded' : 'empty', filtered.length ? '' : (items.length ? 'No hay medicamentos que coincidan con tu búsqueda.' : 'No hay medicamentos registrados en el catálogo.'));
        renderSelection();
    }
    function actionButton(label, action, id, quantity, aria) {
        const button = element('button', label, 'mc-secondary');
        button.type = 'button';
        if (aria) button.setAttribute('aria-label', aria);
        button.addEventListener('click', () => execute(action, id, quantity));
        return button;
    }
    function renderSelection() {
        selection.replaceChildren();
        confirm.disabled = true;
        $('vaciarPedido').disabled = true;
        try {
            const saved = leerEstado(localStorage);
            $('totalSeleccionado').textContent = totalUnidades(saved.borrador);
            $('vaciarPedido').disabled = !saved.borrador.length;
            for (const button of grid.querySelectorAll('[data-medicamento-id]')) {
                const med = items.find(item => item.id === Number(button.dataset.medicamentoId));
                const selected = saved.borrador.find(line => Number(line.id) === med.id);
                button.disabled = !med.disponible || (selected?.cantidad || 0) >= limit(med);
            }
            if (!saved.borrador.length) {
                selection.append(element('p', 'Tu selección está vacía. Agrega medicamentos del catálogo.', 'mc-empty-selection'));
                return;
            }
            let valid = ready && saved.borrador.length > 0;
            for (const line of saved.borrador) {
                const med = items.find(item => item.id === Number(line.id));
                const row = element('div', undefined, 'mc-selection-item');
                row.dataset.selectedId = line.id;
                const name = med ? med.nombre : 'Medicamento #' + line.id + ' no disponible en el catálogo';
                row.append(element('strong', name, 'mc-selected-name'));
                if (!med || !med.disponible || line.cantidad > limit(med)) valid = false;
                const controls = element('div', undefined, 'mc-quantity');
                const input = element('input');
                input.type = 'number';
                input.min = '1';
                input.max = String(med ? Math.max(1, limit(med)) : 99);
                input.value = line.cantidad;
                input.setAttribute('aria-label', 'Cantidad de ' + name);
                input.addEventListener('change', () => execute('cantidad', Number(line.id), Number(input.value)));
                controls.append(actionButton('−', 'cantidad', Number(line.id), line.cantidad - 1, 'Reducir cantidad de ' + name), input, actionButton('+', 'cantidad', Number(line.id), line.cantidad + 1, 'Aumentar cantidad de ' + name));
                row.append(controls, actionButton('Eliminar', 'eliminar', Number(line.id), undefined, 'Eliminar ' + name + ' de la selección'));
                if (!med || !med.disponible || line.cantidad > limit(med)) row.append(element('small', 'Revisa la disponibilidad y cantidad antes de continuar.'));
                selection.append(row);
            }
            confirm.disabled = !valid;
        } catch (error) {
            $('totalSeleccionado').textContent = '—';
            selection.append(element('p', 'No se pudo recuperar tu selección. Los datos guardados se conservaron.'));
            say(error.message);
        }
    }
    function execute(action, id, quantity) {
        if (!checkAuthGuard() || !ready) return;
        try {
            if (action === 'agregar' || action === 'cantidad') {
                const med = items.find(item => item.id === id);
                const saved = leerEstado(localStorage);
                const next = action === 'agregar' ? (saved.borrador.find(line => Number(line.id) === id)?.cantidad || 0) + 1 : quantity;
                if (!med?.disponible || !Number.isInteger(next) || next < 1 || next > limit(med)) throw new Error('La cantidad debe estar entre 1 y ' + (med ? limit(med) : 0) + ', según las existencias actuales.');
            }
            actualizarPedido(localStorage, action, id, quantity);
            say(action === 'agregar' ? 'Medicamento agregado a tu selección. Continúa a Pedidos para confirmar la solicitud.' : 'Selección actualizada.');
        } catch (error) { say(error.message); }
        renderSelection();
    }
    async function loadCatalog() {
        if (loading || !checkAuthGuard()) return;
        loading = true;
        ready = false;
        const token = getToken();
        state('loading', 'Cargando catálogo...');
        grid.replaceChildren();
        $('catalogoResultados').textContent = '';
        $('reintentarCatalogo').hidden = true;
        $('verMasMedicamentos').hidden = true;
        confirm.disabled = true;
        try {
            const response = await apiFetch('/api/medicamentos');
            if (token !== getToken()) return;
            if (!Array.isArray(response.medicamentos)) throw new Error('El servidor no devolvió un catálogo válido.');
            items = response.medicamentos.map(med => ({
                id: Number(med.id), nombre: med.nombre, categoriaId: med.categoria_id,
                categoria: typeof med.categoria === 'string' && med.categoria ? med.categoria : 'Sin categoría registrada',
                presentacion: med.presentacion || med.descripcion || 'Presentación no registrada',
                requiereFormula: med.requiere_formula,
                imagen: med.imagen || IMAGEN_MEDICAMENTO_RESPALDO,
                estado: String(med.estado || '').toUpperCase(), stock: Math.max(0, Number(med.stock) || 0),
                disponible: med.estado === 'DISPONIBLE' && Number(med.stock) > 0,
                precio: Number(med.precio) || 0
            }));
            if (items.some(med => !Number.isSafeInteger(med.id) || med.id < 1 || typeof med.nombre !== 'string')) throw new Error('El catálogo contiene datos incompletos.');
            setCatalogo(items);
            category.replaceChildren(new Option('Todas las categorías', ''));
            const categories = [...new Map(items.map(med => [String(med.categoriaId), med.categoria]))];
            categories.sort((a, b) => a[1].localeCompare(b[1], 'es')).forEach(([id, name]) => category.append(new Option(name, id)));
            ready = true;
            filter();
        } catch (error) {
            items = [];
            state('error', 'No fue posible cargar el catálogo. ' + error.message);
            $('reintentarCatalogo').hidden = false;
            renderSelection();
        } finally { loading = false; }
    }
    grid.addEventListener('click', event => {
        const button = event.target.closest('button[data-medicamento-id]');
        if (button && !button.disabled) execute('agregar', Number(button.dataset.medicamentoId));
    });
    confirm.addEventListener('click', () => { if (checkAuthGuard() && !confirm.disabled) window.location.href = 'pedidos.html#checkout'; });
    $('vaciarPedido').addEventListener('click', () => execute('vaciar'));
    search.addEventListener('input', () => filter());
    search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); filter(); } });
    category.addEventListener('change', () => filter());
    $('buscarMedicamentos').addEventListener('click', () => filter());
    $('limpiarMedicamentos').addEventListener('click', () => {
        search.value = '';
        category.value = '';
        const url = new URL(location.href);
        url.searchParams.delete('buscar');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        filter();
    });
    $('verMasMedicamentos').addEventListener('click', () => { visibleLimit += 24; filter(false); });
    $('reintentarCatalogo').addEventListener('click', loadCatalog);
    window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) renderSelection(); });
    window.addEventListener('pageshow', event => { if (event.persisted) loadCatalog(); });
    search.value = new URLSearchParams(location.search).get('buscar') || '';
    loadCatalog();
});
