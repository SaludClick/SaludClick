import { apiFetch } from './api.js';
import { imagenPredeterminada, imagenSegura } from './medicamento-imagen.js';

function leerFoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('No se pudo leer la fotografía seleccionada.'));
        reader.readAsDataURL(file);
    });
}

export async function initFarmaciaCatalogo() {
    const get = id => document.getElementById(id);
    const form = get('farmaciaMedicamentoForm');
    if (!form) return;
    const dialog = get('farmaciaMedicamentoDialog');
    const status = get('farmaciaMedicamentoStatus');
    const notice = get('farmaciaCatalogoPermisos');
    const add = get('farmaciaNuevoMedicamento');
    const save = get('farmaciaMedicamentoGuardar');
    const preview = get('farmaciaImagenPreview');
    const imageStatus = get('farmaciaImagenStatus');
    const field = name => form.elements.namedItem(name);
    const inputs = ['nombre', 'descripcion', 'presentacion', 'categoria_id', 'stock', 'stock_minimo'];
    let rights = { puedeCrear: false, ambitos: [], categorias: [] };
    let editing = null;
    let busy = false;
    let previewUrl = '';

    function show(message, error = false, target = status) {
        target.textContent = message;
        target.setAttribute('role', error ? 'alert' : 'status');
    }

    function updatePreview() {
        const file = field('foto').files[0];
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        const validFile = !file || file.size > 0 && file.size <= 4 * 1024 * 1024
            && (/^image\/(jpeg|png|webp)$/.test(file.type) || !file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
        const fileMessage = validFile ? '' : 'Selecciona una imagen JPG, PNG o WebP de hasta 4 MB.';
        field('foto').setCustomValidity(fileMessage);
        imageStatus.textContent = fileMessage;
        if (file && validFile) previewUrl = URL.createObjectURL(file);
        const source = previewUrl || imagenSegura(editing?.originalImage);
        if (preview.getAttribute('src') !== source) preview.src = source;
    }

    preview.addEventListener('error', () => {
        if (preview.getAttribute('src') === imagenPredeterminada) return;
        preview.src = imagenPredeterminada;
        imageStatus.textContent = 'La imagen no se pudo cargar. Se muestra la imagen predeterminada.';
    });
    field('foto').addEventListener('change', updatePreview);
    dialog.addEventListener('close', () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
    });

    async function permissions() {
        try {
            rights = await apiFetch('/api/farmacia/medicamentos/permisos');
            add.disabled = !rights.puedeCrear;
            show(rights.puedeCrear ? '' : 'Tu farmacia no tiene permiso para agregar medicamentos.', false, notice);
            const category = field('categoria_id');
            const currentCategory = category.value;
            category.replaceChildren(new Option('Selecciona una categoría', ''), ...rights.categorias.map(c => new Option(c.nombre, String(c.id))));
            if (dialog.open) category.value = currentCategory;
        } catch (error) {
            add.disabled = true;
            rights = { puedeCrear: false, ambitos: [], categorias: [] };
            show(error.message, true, notice);
        }
    }

    function open(med = null, scope = null) {
        form.reset();
        show('');
        const originalImage = med?.imagen || '';
        editing = med ? { id: med.id, version: scope.version, originalImage,
            stock: med.stock, minimo: med.stock_minimo ?? 0 } : null;
        get('farmaciaMedicamentoTitle').textContent = med ? 'Editar medicamento' : 'Agregar medicamento';
        for (const name of inputs) {
            if (med?.[name] != null) field(name).value = name === 'categoria_id' ? (med.categoria?.id ?? med[name]) : med[name];
        }
        field('presentacion').required = !med || med.presentacion !== null;
        if (med) field('estado').value = ['DISPONIBLE','AGOTADO'].includes(med.estado) ? 'DISPONIBLE' : 'INACTIVO';
        updatePreview();
        dialog.showModal();
    }

    function endpoint(id) {
        return '/api/farmacia/medicamentos' + (id ? '/' + id : '');
    }

    async function refresh(message) {
        if (message) {
            document.querySelector('#medicamentos [data-existencias-part="detalle"]')?.close();
            get('farmaciaMessage').textContent = message;
        }
        await permissions();
        get('refreshFarmacia').click();
    }

    async function edit(med, scope) {
        if (busy || dialog.open) return;
        busy = true;
        try {
            const { medicamento } = await apiFetch(endpoint(med.id));
            open(medicamento, scope);
        } catch (error) {
            show(error.message, true, notice);
        } finally { busy = false; }
    }

    async function remove(med, scope) {
        if (busy || !window.confirm('¿Eliminar «' + med.nombre + '»? Se conservará su historial.')) return;
        busy = true;
        try {
            await apiFetch(endpoint(med.id), { method: 'DELETE', body: JSON.stringify({ version: scope.version }) });
            await refresh('Medicamento desactivado.');
        } catch (error) {
            if (error.status === 409) await refresh('');
            show(error.message, true, notice);
        } finally { busy = false; }
    }

    function actions(event) {
        const { med, container } = event.detail;
        const scope = rights.ambitos.find(item => item.medicamento_id === med.id);
        if (!scope) return;
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.textContent = 'Editar medicamento';
        editButton.addEventListener('click', () => void edit(med, scope));
        container.replaceChildren(editButton);
        if (med.estado === 'INACTIVO') return;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = 'Eliminar';
        removeButton.className = 'farmacia-catalogo-retirar';
        removeButton.addEventListener('click', () => void remove(med, scope));
        container.append(removeButton);
    }

    add.addEventListener('click', () => { if (rights.puedeCrear && !busy && !dialog.open) open(); });
    get('farmaciaMedicamentoCancelar').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    document.addEventListener('farmacia:medicamento-acciones', actions);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        updatePreview();
        if (!form.reportValidity()) return;
        busy = true;
        save.disabled = true;
        show('Guardando medicamento…');
        const body = Object.fromEntries(['nombre', 'descripcion', 'presentacion', 'estado'].map(name => [name, field(name).value.trim()]));
        if (!field('presentacion').required && !body.presentacion) body.presentacion = null;
        body.categoria_id = Number(field('categoria_id').value);
        const stock = field('stock').valueAsNumber;
        const minimo = field('stock_minimo').valueAsNumber;
        if (editing) {
            body.version = editing.version;
            if (stock !== editing.stock) {
                body.stock = stock;
                body.stockEsperado = editing.stock;
            }
            if (minimo !== editing.minimo) body.stock_minimo = minimo;
        } else {
            body.stock = stock;
            body.stock_minimo = minimo;
        }
        try {
            const file = field('foto').files[0];
            if (file) body.foto = await leerFoto(file);
            await apiFetch(endpoint(editing?.id), { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            dialog.close();
            await refresh('Medicamento guardado.');
        } catch (error) {
            if (error.status === 409) await refresh('');
            show(error.message, true);
        } finally {
            busy = false;
            save.disabled = false;
        }
    });
    await permissions();
}
