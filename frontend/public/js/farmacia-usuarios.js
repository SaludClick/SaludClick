import { apiFetch } from './api.js';

export function mostrarEPS(vinculacion) {
    const header = document.getElementById('farmaciaLinkedEps');
    if (!vinculacion || !['VINCULADA','SIN_VINCULO','EPS_NO_VIGENTE'].includes(vinculacion.estado)) throw new Error('No se pudo comprobar la EPS vinculada.');
    header.textContent = vinculacion.eps ? `EPS vinculada: ${vinculacion.eps.nombre}` : vinculacion.mensaje;
    header.setAttribute('role', 'status');
}
export async function consultarEPS() {
    const header = document.getElementById('farmaciaLinkedEps');
    try { mostrarEPS((await apiFetch('/api/farmacia/eps')).vinculacion); }
    catch (error) { header.textContent = error.message || 'No se pudo comprobar la EPS vinculada.'; header.setAttribute('role', 'alert'); }
}
export function initFarmaciaUsuarios({ initialContext = {}, onContextChange = () => {} } = {}) {
    const get = id => document.getElementById(id);
    const form = get('farmaciaUsuariosFilter'), search = get('farmaciaUsuariosBuscar');
    const estado = get('farmaciaUsuariosEstado');
    const status = get('farmaciaUsuariosStatus'), list = get('farmaciaUsuariosRows');
    let page = initialContext.page || 1, pages = 0, busy = false, allowed = false, sequence = 0;
    search.value = initialContext.search || '';
    estado.value = initialContext.estadoUsuario || '';
    function controls() {
        search.disabled = busy || !allowed;
        estado.disabled = busy || !allowed;
        get('farmaciaUsuariosBuscarButton').disabled = busy || !allowed;
        get('farmaciaUsuariosClear').disabled = busy || !allowed;
        get('farmaciaUsuariosPrevious').disabled = busy || !allowed || page <= 1;
        get('farmaciaUsuariosNext').disabled = busy || !allowed || page >= pages;
    }
    async function load() {
        const current = ++sequence; busy = true; controls();
        // Retirar la instantánea anterior mientras se revalida el vínculo.
        list.replaceChildren(); get('farmaciaUsuariosTable').hidden = true;
        get('farmaciaUsuariosTotal').textContent = '—'; get('farmaciaUsuariosPage').textContent = '';
        list.setAttribute('aria-busy', 'true'); status.textContent = 'Consultando pacientes activos de tu EPS…'; status.setAttribute('role', 'status');
        try {
            const query = new URLSearchParams({ pagina: String(page), buscar: search.value.trim() });
            const result = await apiFetch('/api/farmacia/usuarios?' + query);
            if (current !== sequence) return;
            mostrarEPS(result.vinculacion);
            // El endpoint limita el directorio a afiliados activos autorizados.
            const inactivos = estado.value === 'inactivos';
            const pacientes = inactivos ? [] : result.pacientes;
            const total = inactivos ? 0 : result.paginacion.total;
            allowed = !!result.vinculacion.eps; pages = inactivos ? 0 : result.paginacion.paginas;
            if (allowed && page > Math.max(1, pages)) { page = Math.max(1, pages); return await load(); }
            list.replaceChildren(); get('farmaciaUsuariosTable').hidden = !allowed;
            get('farmaciaUsuariosTotal').textContent = allowed ? String(result.totalActivos) : '—';
            get('farmaciaUsuariosEps').textContent = result.vinculacion.eps?.nombre || 'Sin EPS vigente';
            for (const paciente of pacientes) {
                const row = document.createElement('tr');
                for (const [label, value] of [['Nombre', paciente.nombres], ['Apellidos', paciente.apellidos], ['Tipo de documento', paciente.tipo_documento || 'No disponible'], ['Documento', paciente.documento || 'No disponible'], ['Correo', paciente.correo || 'No disponible'], ['EPS', result.vinculacion.eps.nombre], ['Estado', paciente.estado]]) {
                    const cell = document.createElement('td'); cell.textContent = value; cell.dataset.label = label; row.append(cell);
                }
                const identifier=document.createElement('td');identifier.textContent=paciente.identificador||'No disponible';identifier.dataset.label='Identificador de afiliación';row.append(identifier);
                list.append(row);
            }
            get('farmaciaUsuariosPage').textContent = allowed && total ? `${total} coincidencias · Página ${page} de ${pages}` : '';
            status.textContent = !allowed ? result.vinculacion.mensaje : inactivos ? 'El directorio autorizado solo incluye afiliados activos.' : pacientes.length ? 'Pacientes activos actualizados.' : 'No hay pacientes activos que coincidan con la búsqueda en tu EPS.';
            onContextChange({ page, search: search.value.trim(), estadoUsuario: estado.value });
        } catch (error) {
            if (current === sequence) {
                list.replaceChildren(); pages = 0; allowed = false;
                get('farmaciaUsuariosTable').hidden = true;
                get('farmaciaUsuariosEps').textContent = 'Sin EPS verificada';
                const header = get('farmaciaLinkedEps');
                header.textContent = 'No se pudo comprobar la EPS vinculada.'; header.setAttribute('role', 'alert');
                get('farmaciaUsuariosTotal').textContent = '—'; get('farmaciaUsuariosPage').textContent = '';
                status.textContent = error.message || 'No se pudo consultar el directorio.'; status.setAttribute('role', 'alert');
            }
        } finally { if (current === sequence) { busy = false; list.setAttribute('aria-busy', 'false'); controls(); } }
    }
    form.addEventListener('submit', event => { event.preventDefault(); page = 1; void load(); });
    estado.addEventListener('change', () => { page = 1; void load(); });
    get('farmaciaUsuariosClear').addEventListener('click', () => { search.value = ''; estado.value = ''; page = 1; void load(); });
    for (const [id,delta] of [['farmaciaUsuariosPrevious',-1],['farmaciaUsuariosNext',1]]) get(id).addEventListener('click', () => { if (!busy) { page += delta; void load(); } });
    get('farmaciaUsuariosRefresh').addEventListener('click', () => void load());
    void load();
}
