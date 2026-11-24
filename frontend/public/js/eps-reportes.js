import { apiFetch } from './api.js';

const porId = id => document.getElementById(id);

function csvCelda(valor) {
    const texto = String(valor ?? '');
    const seguro = /^[\u0000-\u0020]*[=+@-]|^[\t\r\n]/.test(texto) ? "'" + texto : texto;
    return '"' + seguro.replaceAll('"', '""') + '"';
}

function tabla(titulo, filas) {
    const seccion = document.createElement('section');
    seccion.className = 'eps-surface';
    const encabezado = document.createElement('h2');
    encabezado.textContent = titulo;
    seccion.append(encabezado);
    if (!filas.length) {
        const mensaje = document.createElement('p');
        mensaje.textContent = 'Sin registros para mostrar.';
        seccion.append(mensaje);
        return seccion;
    }
    const bloque = document.createElement('div');
    bloque.className = 'eps-tabla';
    const cuerpo = document.createElement('table').createTBody();
    for (const [etiqueta, valor] of filas) {
        const fila = cuerpo.insertRow();
        if (etiqueta === 'Total') fila.dataset.total = '';
        const campo = document.createElement('th');
        campo.scope = 'row';
        campo.textContent = etiqueta;
        fila.append(campo);
        fila.insertCell().textContent = valor;
    }
    bloque.append(cuerpo.parentElement);
    seccion.append(bloque);
    return seccion;
}

export function iniciarReportes() {
    const vista = porId('reportes');
    const form = porId('epsReportesFiltro');
    const estado = porId('epsReportesEstado');
    const datos = porId('epsReportesDatos');
    const exportar = porId('epsReportesCSV');
    let consulta = 0;
    let csv = [];

    async function cargar() {
        const actual = ++consulta;
        csv = [];
        exportar.disabled = true;
        datos.hidden = true;
        estado.textContent = 'Consultando reportes…';
        const query = new URLSearchParams([...new FormData(form)].filter(([, valor]) => valor));
        try {
            const { eps, afiliados, solicitudes, farmacias } = await apiFetch(`/api/eps/reportes/resumen?${query}`);
            if (actual !== consulta) return;
            const resumen = [
                ['Afiliados', [['Total', afiliados.total], ['Activos', afiliados.activos], ['Inactivos', afiliados.inactivos]]],
                ['Solicitudes por estado', [['Total', solicitudes.total], ...solicitudes.estados.map(f => [f.estado ?? 'Sin estado', f.total])]],
                ['Actividad mensual', solicitudes.meses.map(f => [f.mes ?? 'Sin fecha', f.total])],
                ['Farmacias vinculadas', [['Total', farmacias.total], ['Vigentes', farmacias.activas],
                    ...farmacias.recientes.map(f => [`${f.nombre || 'Nombre sin registrar'} · ID ${f.id}`, f.activa ? 'Vigente' : 'Inactivo'])]]
            ];
            csv = [['EPS', 'Desde', 'Hasta', 'Sección', 'Indicador', 'Valor'],
                ...resumen.flatMap(([seccion, filas]) => filas.map(([indicador, valor]) =>
                    [eps.nombre, query.get('desde') || '', query.get('hasta') || '', seccion, indicador, valor]))];
            datos.replaceChildren(...resumen.map(([titulo, filas]) => tabla(titulo, filas)));
            datos.hidden = false;
            exportar.disabled = false;
            estado.textContent = '';
        } catch (error) {
            if (actual === consulta) estado.textContent = error.status === 403 ? `Acceso denegado. ${error.message}` : error.message;
        }
    }

    exportar.addEventListener('click', () => {
        if (!csv.length) return;
        const archivo = new Blob(['\uFEFF', csv.map(fila => fila.map(csvCelda).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(archivo);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = 'saludclick-reporte-eps.csv';
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    form.addEventListener('input', () => {
        consulta++;
        exportar.disabled = true;
        csv = [];
        datos.hidden = true;
        estado.textContent = 'Consulta el período para actualizar el reporte.';
    });
    form.addEventListener('submit', event => { event.preventDefault(); cargar(); });
    function navegar() {
        vista.hidden = location.hash !== '#reportes';
        if (vista.hidden) consulta++;
        else { cargar(); vista.scrollIntoView(); }
    }
    window.addEventListener('hashchange', navegar);
    navegar();
}
