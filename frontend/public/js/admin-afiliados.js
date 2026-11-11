import { apiFetch } from '/js/api.js';
import { getToken, getCurrentUser, logout } from '/js/auth.js';
import { obtenerResumenAfiliados } from './admin-afiliados-resumen.js';
const etiquetas = { id: 'ID del afiliado', nombres: 'Nombres', apellidos: 'Apellidos', tipo_documento: 'Tipo de documento', documento: 'Número de documento', fecha_nacimiento: 'Fecha de nacimiento', telefono: 'Teléfono', correo: 'Correo electrónico', direccion: 'Dirección', ciudad: 'Ciudad', regimen: 'Régimen', estado: 'Estado de afiliación', eps_id: 'EPS ID original' };
const $ = id => document.getElementById(id);
const base = '/api/admin/afiliados';
let pagina = 1, seleccionado, secuencia = 0, detalleSecuencia = 0, temporizador, guardando = false;
let resumenCache = null, resumenPendiente = null, resumenVersion = 0;
function nodo(tipo, texto, clase) { const n = document.createElement(tipo); n.textContent = texto ?? ''; if (clase) n.className = clase; return n; }
function iniciales(a) { return [a.nombres, a.apellidos].map(v => v?.trim().charAt(0) ?? '').join('').toLocaleUpperCase('es'); }
function estadoCuenta(a) { return a.cuenta_conflicto ? 'Requiere revisión' : a.usuario ? (a.usuario.estado ?? 'Sin estado') : 'Sin cuenta'; }
function badge(valor, tono) {
    const estado = String(valor ?? '').trim().toLocaleUpperCase('es');
    const texto = ({ ACTIVO: 'Activo', INACTIVO: 'Inactivo' })[estado] || (valor === null || valor === undefined || valor === '' ? 'Sin estado' : valor);
    const n = nodo('span', texto, 'af-badge');
    n.dataset.tone = tono || (estado === 'ACTIVO' ? 'active' : estado === 'INACTIVO' ? 'inactive' : 'neutral');
    return n;
}
function etiquetasCuenta(a) {
    const grupo = nodo('span', '', 'af-account-stack');
    if (a.cuenta_conflicto) grupo.append(badge('Requiere revisión', 'review'));
    else if (a.usuario) grupo.append(badge('Con cuenta', 'linked'), document.createTextNode(' '), badge(estadoCuenta(a)));
    else grupo.append(badge('Sin cuenta', 'neutral'));
    return grupo;
}
function cancelarResumen() { resumenVersion++; resumenCache = null; resumenPendiente = null; }
function pintarResumen(resumen) {
    $('conCuenta').textContent = String(resumen.conCuenta); $('sinCuenta').textContent = String(resumen.sinCuenta);
    for (const id of ['conCuenta', 'sinCuenta']) $(id).setAttribute('aria-busy', 'false');
    $('resumen').textContent = `Cifras del registro completo, independientes de los filtros.${resumen.enRevision ? ` ${resumen.enRevision} ${resumen.enRevision === 1 ? 'afiliado requiere' : 'afiliados requieren'} revisión del vínculo de cuenta.` : ''}`;
}
async function actualizarResumen(data, params, forzar) {
    if (forzar || (resumenCache && resumenCache.total !== data.total)) cancelarResumen();
    if (resumenCache) { pintarResumen(resumenCache); return; }
    if (resumenPendiente) return;
    const version = ++resumenVersion;
    resumenPendiente = version;
    for (const id of ['conCuenta', 'sinCuenta']) { $(id).textContent = '—'; $(id).setAttribute('aria-busy', 'true'); }
    $('resumen').textContent = 'Calculando el resumen de cuentas del registro completo…';
    try {
        const sinFiltros = ['buscar', 'eps', 'estado', 'cuenta'].every(c => !params.get(c));
        const primera = sinFiltros && data.pagina === 1 ? data : undefined;
        const resumen = await obtenerResumenAfiliados(p => apiFetch(`${base}?pagina=${p}`), primera);
        if (version !== resumenVersion) return;
        if (resumen.total !== data.total) throw new Error('El total del registro cambió.');
        resumenCache = resumen; pintarResumen(resumen);
    } catch {
        if (version !== resumenVersion) return;
        for (const id of ['conCuenta', 'sinCuenta']) $(id).textContent = '—';
        $('resumen').textContent = 'No se pudo completar el resumen de cuentas. Pulsa Actualizar para reintentar.';
    } finally {
        if (version === resumenVersion) { resumenPendiente = null; for (const id of ['conCuenta', 'sinCuenta']) $(id).setAttribute('aria-busy', 'false'); }
    }
}
function celda(label, contenido, clase) { const n = document.createElement('td'); n.dataset.label = label; if (clase) n.className = clase; n.append(contenido); return n; }
function listaEstado(tipo, titulo, descripcion) {
    $('estadoLista').hidden = tipo === 'oculto';
    $('estadoLista').querySelector('.af-spinner').hidden = tipo !== 'cargando';
    $('estadoTitulo').textContent = titulo;
    $('estadoDescripcion').textContent = descripcion;
}
function mensaje(texto) { $('mensaje').textContent = texto; $('mensaje').hidden = !texto; }
function opciones(id, valores, titulo, presentar = v => v) {
    const select = $(id), anterior = select.value;
    select.replaceChildren(new Option(titulo, ''), ...valores.map(v => new Option(presentar(v), v)));
    select.value = valores.includes(anterior) ? anterior : '';
}
function renderizar(a) {
    const fila = document.createElement('tr');
    const persona = nodo('div', '', 'af-person');
    const nombre = document.createElement('div');
    nombre.append(nodo('strong', `${a.nombres} ${a.apellidos}`), nodo('small', a.correo));
    persona.append(nodo('span', iniciales(a), 'af-avatar'), nombre);
    const documento = nodo('div', '', 'af-document'); documento.append(nodo('small', a.tipo_documento), nodo('strong', a.documento));
    const boton = nodo('button', 'Ver detalles', 'af-detail-button');
    boton.type = 'button'; boton.setAttribute('aria-label', `Ver detalles de ${a.nombres} ${a.apellidos}`);
    boton.onclick = () => abrir(a.id, boton);
    fila.append(celda('Nombre completo', persona), celda('Tipo y documento', documento), celda('EPS', nodo('span', a.eps?.nombre ?? (a.eps_id ? `EPS ID ${a.eps_id}` : 'Sin EPS identificada'), 'af-eps')), celda('Estado de afiliación', badge(a.estado)), celda('Estado de cuenta', etiquetasCuenta(a)), celda('Acciones', boton));
    return fila;
}
async function cargar(refrescarResumen = false) {
    const actual = ++secuencia;
    $('anterior').disabled = $('siguiente').disabled = true;
    $('registro').setAttribute('aria-busy', 'true');
    $('filas').replaceChildren(); mensaje('');
    listaEstado('cargando', 'Cargando afiliados', 'Estamos consultando el registro.');
    const params = new URLSearchParams({ pagina: String(pagina), buscar: $('buscar').value, eps: $('filtroEps').value, estado: $('filtroEstado').value, cuenta: $('filtroCuenta').value });
    try {
        const data = await apiFetch(`${base}?${params}`);
        if (actual !== secuencia) return;
        if (!Array.isArray(data.afiliados) || !Number.isInteger(data.total) || !Number.isInteger(data.coincidencias) || !data.filtros || !Array.isArray(data.filtros.eps) || !Array.isArray(data.filtros.estados)) throw new Error('El servidor devolvió una respuesta de afiliados inválida. Actualiza la página o consulta al administrador.');
        pagina = data.pagina;
        $('total').textContent = String(data.total);
        actualizarResumen(data, params, refrescarResumen);
        $('resultados').textContent = `${data.coincidencias} ${data.coincidencias === 1 ? 'resultado' : 'resultados'}${params.get('buscar') || params.get('eps') || params.get('estado') || params.get('cuenta') ? ' con los filtros actuales' : ' disponibles'}`;
        opciones('filtroEps', data.filtros.eps, 'Todas las EPS', v => data.filtros.epsConfirmadas?.find(e => e.id === v)?.nombre || (v ? `EPS ID ${v}` : 'Sin EPS identificada'));
        opciones('filtroEstado', data.filtros.estados, 'Todos los estados');
        $('filas').replaceChildren(...data.afiliados.map(renderizar));
        if (data.afiliados.length) listaEstado('oculto', '', '');
        else if (data.total === 0) listaEstado('vacio', 'No hay afiliados registrados', 'La fuente PostgreSQL consultada no devolvió afiliados. Revisa que el backend esté conectado a la fuente original correcta.');
        else listaEstado('vacio', 'No encontramos coincidencias', 'Prueba otro nombre, documento o correo, o limpia los filtros para ver el registro.');
        $('pagina').textContent = `Página ${pagina} de ${Math.max(1, Math.ceil(data.coincidencias / 10))}`;
        $('rango').textContent = data.coincidencias ? `Mostrando ${(pagina - 1) * 10 + 1}–${(pagina - 1) * 10 + data.afiliados.length} de ${data.coincidencias} afiliados` : 'Mostrando 0–0 de 0 afiliados';
        $('anterior').disabled = pagina <= 1;
        $('siguiente').disabled = pagina * 10 >= data.coincidencias;
    } catch (e) {
        if (actual !== secuencia) return;
        $('total').textContent = '—'; $('resumen').textContent = 'El total no está disponible';
        cancelarResumen();
        for (const id of ['conCuenta', 'sinCuenta']) { $(id).textContent = '—'; $(id).setAttribute('aria-busy', 'false'); }
        $('resultados').textContent = 'La consulta no se pudo completar'; $('rango').textContent = 'Sin información disponible'; $('pagina').textContent = 'Página —';
        mensaje(e.message);
        listaEstado('error', 'No pudimos cargar el registro', 'Revisa el aviso y pulsa Actualizar para intentar nuevamente.');
    } finally { if (actual === secuencia) $('registro').setAttribute('aria-busy', 'false'); }
}
async function abrir(id, boton) {
    const actual = ++detalleSecuencia;
    boton.disabled = true; mensaje('');
    try {
        const { afiliado: a, puedeCrearCuenta, motivoCuenta } = await apiFetch(`${base}/${encodeURIComponent(id)}`);
        if (actual !== detalleSecuencia) return;
        if (!a || Object.keys(etiquetas).some(c => !(c in a))) throw new Error('La ficha recibida está incompleta. Intenta nuevamente.');
        seleccionado = a.id;
        const secciones = {
            camposIdentificacion: ['id', 'tipo_documento', 'documento'],
            camposPersonales: ['nombres', 'apellidos', 'fecha_nacimiento'],
            camposContacto: ['telefono', 'correo', 'direccion', 'ciudad'],
            camposAfiliacion: ['regimen', 'estado', 'eps_id']
        };
        for (const [contenedor, campos] of Object.entries(secciones)) $(contenedor).replaceChildren(...campos.map(c => {
            const grupo = nodo('div', '', 'af-field'); grupo.dataset.field = c;
            grupo.append(nodo('dt', etiquetas[c]), nodo('dd', a[c])); return grupo;
        }));
        $('detalleNombre').textContent = `${a.nombres} ${a.apellidos}`;
        $('detalleIniciales').textContent = iniciales(a);
        $('detalleDocumento').textContent = `${a.tipo_documento} ${a.documento}`;
        $('estadoAfiliacion').replaceChildren(badge(a.estado)); $('estadoCuenta').replaceChildren(etiquetasCuenta(a));
        $('detalleEps').textContent = a.eps?.nombre ? `EPS: ${a.eps.nombre}. ID original: ${a.eps_id}.` : `EPS ID original: ${a.eps_id || '(vacío)'}. No hay una relación EPS validada disponible.`;
        $('crearCuenta').reset(); $('crearCuenta').hidden = puedeCrearCuenta !== true;
        $('mensajeCuenta').textContent = motivoCuenta || (a.usuario ? 'Este afiliado ya tiene una cuenta vinculada.' : puedeCrearCuenta ? '' : 'Para crear cuenta se requiere autorización vigente con los mismos datos de identidad.');
        $('detalle').showModal(); document.body.style.overflow = 'hidden';
    } catch (e) { mensaje(e.message); }
    finally { boton.disabled = false; }
}
$('crearCuenta').onsubmit = async event => {
    event.preventDefault(); if (guardando) return;
    guardando = true;
    const boton = $('crearCuenta').querySelector('button'); boton.disabled = true; boton.textContent = 'Creando cuenta…';
    try {
        const data = await apiFetch(`${base}/${encodeURIComponent(seleccionado)}/cuenta`, { method: 'POST', body: JSON.stringify({ verificado: $('verificado').checked, password: $('password').value }) });
        $('crearCuenta').reset(); $('crearCuenta').hidden = true;
        $('estadoCuenta').replaceChildren(etiquetasCuenta({ usuario: data.usuario }));
        $('mensajeCuenta').textContent = 'Cuenta PACIENTE creada y vinculada. Los datos de afiliación se conservan.'; await cargar(true);
    } catch (e) { $('mensajeCuenta').textContent = e.message; }
    finally { guardando = false; boton.disabled = false; boton.textContent = 'Crear cuenta'; }
};
$('cerrar').onclick = () => $('detalle').close();
$('cerrarFicha').onclick = () => $('detalle').close();
$('detalle').addEventListener('close', () => { $('crearCuenta').reset(); document.body.style.overflow = ''; });
$('anterior').onclick = () => { pagina--; cargar(); };
$('siguiente').onclick = () => { pagina++; cargar(); };
function filtrar() { clearTimeout(temporizador); secuencia++; pagina = 1; cargar(); }
function actualizarLimpiarBusqueda() { $('limpiarBusqueda').hidden = !$('buscar').value; }
$('buscar').oninput = () => { actualizarLimpiarBusqueda(); clearTimeout(temporizador); secuencia++; $('anterior').disabled = $('siguiente').disabled = true; temporizador = setTimeout(filtrar, 300); };
for (const id of ['filtroEps', 'filtroEstado', 'filtroCuenta']) $(id).onchange = filtrar;
$('filtros').onsubmit = event => { event.preventDefault(); filtrar(); };
$('limpiar').onclick = () => { $('filtros').reset(); actualizarLimpiarBusqueda(); filtrar(); };
$('limpiarBusqueda').onclick = () => { $('buscar').value = ''; actualizarLimpiarBusqueda(); $('buscar').focus(); filtrar(); };
$('actualizar').onclick = () => { clearTimeout(temporizador); cargar(true); };
$('menuToggle').onclick = () => { const abierto = $('menu').classList.toggle('active'); $('menuToggle').setAttribute('aria-expanded', String(abierto)); };
$('logout').onclick = logout;
function verificarSesion() {
    let usuario; try { usuario = getCurrentUser(); } catch { /* Sesión local inválida. */ }
    if (getToken() && Number(usuario?.rol_id ?? usuario?.rol) === 1) return true;
    ++secuencia; ++detalleSecuencia; cancelarResumen(); $('filas').replaceChildren(); for (const dl of $('campos').querySelectorAll('dl')) dl.replaceChildren(); $('crearCuenta').reset(); $('detalle').close();
    location.replace('/login.html'); return false;
}
for (const evento of ['pageshow', 'focus', 'storage']) window.addEventListener(evento, verificarSesion);
if (verificarSesion()) cargar();
