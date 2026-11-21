import { apiFetch } from './api.js';

const porId = id => document.getElementById(id);
const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
const mes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fechaVisible = valor => valor ? fecha.format(new Date(valor)) : 'Sin fecha';

function nodo(tag, texto, clase) {
    const elemento = document.createElement(tag);
    if (texto !== undefined) elemento.textContent = texto;
    if (clase) elemento.className = clase;
    return elemento;
}

function tarjeta(titulo, total, detalles) {
    const elemento = nodo('article', undefined, 'card admin-dashboard-card');
    elemento.append(nodo('h2', titulo), nodo('strong', total, 'eps-dash-total'),
        ...detalles.map(texto => nodo('p', texto, 'eps-dash-dato')));
    return elemento;
}

function graficar(id, serie, vacio) {
    const zona = porId(id);
    if (!serie.some(({ total }) => total > 0)) {
        zona.replaceChildren(nodo('p', vacio));
        return;
    }
    const lista = nodo('ul', undefined, 'eps-dash-series');
    const maximo = Math.max(...serie.map(({ total }) => total));
    for (const { etiqueta, total } of serie) {
        const fila = nodo('li');
        const barra = nodo('meter', undefined, 'eps-dash-barra');
        barra.max = maximo;
        barra.value = total;
        barra.setAttribute('aria-label', `${etiqueta}, ${total}`);
        fila.append(nodo('span', `${etiqueta} · ${total}`), barra);
        lista.append(fila);
    }
    zona.replaceChildren(lista);
}

function pintarRecientes(solicitudes) {
    const zona = porId('epsDashboardRecientes');
    if (!solicitudes.length) return zona.replaceChildren(nodo('p', 'Sin solicitudes acreditadas.'));
    const tabla = nodo('table');
    const encabezado = tabla.createTHead().insertRow();
    for (const titulo of ['Solicitud', 'Fecha', 'Estado', 'Farmacia']) {
        const celda = nodo('th', titulo);
        celda.scope = 'col';
        encabezado.append(celda);
    }
    const cuerpo = tabla.createTBody();
    for (const solicitud of solicitudes) {
        const fila = cuerpo.insertRow();
        const enlace = nodo('a', `#${solicitud.id}`);
        enlace.href = `#solicitudes/${solicitud.id}`;
        enlace.setAttribute('aria-label', `Ver solicitud #${solicitud.id}`);
        fila.insertCell().append(enlace);
        for (const valor of [fechaVisible(solicitud.fecha), solicitud.estado ?? 'Sin estado',
            solicitud.farmacia?.nombre ?? 'Sin farmacia vigente']) fila.insertCell().textContent = valor;
    }
    zona.replaceChildren(tabla);
}

export function iniciarDashboard() {
    const panel = porId('epsDashboard');
    const datos = porId('epsDashboardDatos');
    const estado = porId('epsDashboardEstado');
    const titular = porId('epsDashboardEntidad');
    const avisos = porId('epsDashboardAvisos');
    const metricas = porId('epsDashboardMetricas');
    const metricasAvisos = nodo('div', undefined, 'card admin-dashboard-card');
    let secuencia = 0;

    function pintarNotificaciones({ notificaciones, noLeidas, paginacion, error }) {
        metricasAvisos.replaceChildren(nodo('h2', 'Notificaciones'));
        if (error || !paginacion) metricasAvisos.append(nodo('p', error || 'Consultando avisos…'));
        else metricasAvisos.append(nodo('strong', paginacion.total, 'eps-dash-total'), nodo('p', `${noLeidas} sin leer`));
        if (error || !notificaciones?.length) {
            avisos.replaceChildren(nodo('p', error || 'Sin avisos registrados.'));
            return;
        }
        const lista = nodo('ul', undefined, 'eps-dash-lista');
        for (const aviso of notificaciones) {
            const fila = nodo('li');
            fila.append(nodo('strong', aviso.titulo), nodo('p', `${fechaVisible(aviso.fecha)} · ${aviso.leida_at ? 'Leída' : 'No leída'}`));
            lista.append(fila);
        }
        avisos.replaceChildren(lista);
    }

    function pintar({ eps, afiliados, solicitudes, farmacias }) {
        titular.textContent = eps.nombre;
        const estados = solicitudes.estados.map(item => ({ etiqueta: item.estado ?? 'Sin estado', total: item.total }));
        const principales = ['PENDIENTE', 'APROBADA', 'PREPARANDO', 'ENTREGADA'];
        const conteoEstados = principales.map(etiqueta => ({ etiqueta, total: estados.find(e => e.etiqueta === etiqueta)?.total ?? 0 }))
            .concat(estados.filter(e => !principales.includes(e.etiqueta)));
        const distribucion = [{ etiqueta: 'Activos', total: afiliados.activos }, { etiqueta: 'Inactivos', total: afiliados.inactivos }];
        const otros = afiliados.total - afiliados.activos - afiliados.inactivos;
        if (otros > 0) distribucion.push({ etiqueta: 'Otros o sin estado', total: otros });
        const textoSerie = serie => serie.map(({ etiqueta, total }) => `${etiqueta} · ${total}`);
        metricas.replaceChildren(tarjeta('Afiliados', afiliados.total, textoSerie(distribucion)),
            tarjeta('Solicitudes', solicitudes.total, textoSerie(conteoEstados)),
            tarjeta('Farmacias vinculadas', farmacias.total, [`${farmacias.activas} con vínculo activo`]), metricasAvisos);
        graficar('epsGraficoEstados', estados, 'Sin solicitudes por estado.');
        graficar('epsGraficoMeses', solicitudes.meses.map(item => ({
            etiqueta: item.mes ? mes.format(new Date(`${item.mes}-01T00:00:00Z`)) : 'Sin fecha',
            total: item.total
        })), 'Sin solicitudes registradas.');
        graficar('epsGraficoAfiliados', distribucion, 'Sin afiliados registrados.');
        pintarRecientes(solicitudes.recientes);
        const lista = nodo('ul', undefined, 'eps-dash-lista');
        for (const farmacia of farmacias.recientes) {
            lista.append(nodo('li', `${farmacia.nombre || 'Nombre sin registrar'} · ${farmacia.activa ? 'Vigente' : 'Inactivo'}`));
        }
        porId('epsDashboardFarmacias').replaceChildren(lista.children.length ? lista : nodo('p', 'Sin farmacias vinculadas.'));
    }

    async function cargar() {
        if (panel.hidden) return;
        const actual = ++secuencia;
        datos.hidden = true;
        titular.textContent = 'Resumen de la entidad';
        estado.textContent = 'Consultando estadísticas…';
        try {
            const respuesta = await apiFetch('/api/eps/dashboard/resumen');
            if (actual !== secuencia) return;
            pintar(respuesta);
            estado.textContent = '';
            datos.hidden = false;
        } catch (error) {
            if (actual === secuencia) estado.textContent = error.status === 403 ? `Acceso denegado. ${error.message}` : error.message;
        }
    }

    function navegar() {
        panel.hidden = Boolean(location.hash && location.hash !== '#dashboard');
        if (panel.hidden) secuencia++;
        else cargar();
    }

    pintarNotificaciones({});
    window.addEventListener('eps:avisos-dashboard', event => pintarNotificaciones(event.detail));
    window.addEventListener('hashchange', navegar);
    porId('refreshEps').addEventListener('click', cargar);
    navegar();
}
