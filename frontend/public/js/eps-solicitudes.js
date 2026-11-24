import { apiFetch } from './api.js';
import { insigniaEstado } from './eps-presentation.js';

const porId = id => document.getElementById(id);
const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
const fechaVisible = valor => valor ? fecha.format(new Date(valor)) : 'Sin fecha';
const estadoVisible = valor => valor || 'Sin estado';
const farmaciaVisible = farmacia => farmacia
    ? `${farmacia.nombre || 'Nombre sin registrar'} · ID ${farmacia.id}`
    : 'Sin farmacia vigente';
const errorVisible = error => error.status === 403 ? `Acceso denegado. ${error.message}` : error.message;
const nombrePaciente = paciente => [paciente.nombres, paciente.apellidos].filter(Boolean).join(' ') || 'Sin nombre registrado';
const documentoPaciente = paciente => [paciente.tipo_documento, paciente.documento].filter(Boolean).join(' ');
const medicamentoVisible = ({ nombre, cantidad }) => `${nombre} · Cantidad ${cantidad}`;
const formulaVisible = asociada => asociada ? 'Asociada · Archivo no autorizado para EPS' : 'Sin fórmula asociada vigente';

function pintarLista(lista, valores, vacio) {
    lista.replaceChildren();
    for (const valor of valores.length ? valores : [vacio]) {
        const elemento = document.createElement('li');
        elemento.textContent = valor;
        lista.append(elemento);
    }
}

export function iniciarSolicitudes() {
    const seccion = porId('solicitudes');
    const formulario = porId('epsSolicitudesFiltros');
    const estado = porId('epsSolicitudesEstado');
    const tabla = porId('epsSolicitudesTabla');
    const filas = porId('epsSolicitudesFilas');
    const paginacion = porId('epsSolicitudesPaginacion');
    const anterior = porId('epsSolicitudesAnterior');
    const siguiente = porId('epsSolicitudesSiguiente');
    const detalle = porId('epsSolicitudDetalle');
    const datos = porId('epsSolicitudDatos');
    const detalleEstado = porId('epsSolicitudDetalleEstado');
    let filtros = {};
    let pagina = 1;
    let carga = 0;
    let cargaDetalle = 0;

    async function verDetalle(id) {
        const consulta = ++cargaDetalle;
        datos.hidden = true;
        detalleEstado.textContent = 'Consultando detalle…';
        porId('epsSolicitudTitulo').textContent = `Solicitud #${id}`;
        detalle.showModal();
        try {
            const { eps, solicitud } = await apiFetch(`/api/eps/solicitudes/${id}`);
            if (consulta !== cargaDetalle || !detalle.open) return;
            porId('epsSolicitudResumen').textContent = `${fechaVisible(solicitud.fecha)} · ${estadoVisible(solicitud.estado)} · ${farmaciaVisible(solicitud.farmacia)}`;
            porId('epsSolicitudPaciente').textContent = `${nombrePaciente(solicitud.paciente)} · ${documentoPaciente(solicitud.paciente)} · ${eps.nombre}`;
            pintarLista(porId('epsSolicitudMedicamentos'), solicitud.medicamentos.map(medicamentoVisible), 'Sin medicamentos registrados.');
            porId('epsSolicitudFormula').textContent = formulaVisible(solicitud.formula_asociada);
            pintarLista(porId('epsSolicitudHistorial'), solicitud.historial.map(e => `${fechaVisible(e.fecha)} · ${estadoVisible(e.estado_anterior)} → ${estadoVisible(e.estado)}`), 'Sin cambios registrados.');
            detalleEstado.textContent = '';
            datos.hidden = false;
        } catch (error) {
            if (consulta === cargaDetalle && detalle.open) detalleEstado.textContent = errorVisible(error);
        }
    }

    async function cargar(destino) {
        const consulta = ++carga;
        tabla.hidden = true;
        filas.replaceChildren();
        paginacion.hidden = true;
        estado.textContent = 'Consultando solicitudes…';
        const parametros = { ...filtros, pagina: String(destino), tamano: '25' };
        try {
            const respuesta = filtros.documento
                ? await apiFetch('/api/eps/solicitudes/busqueda', { method: 'POST', body: JSON.stringify(parametros) })
                : await apiFetch(`/api/eps/solicitudes?${new URLSearchParams(parametros)}`);
            if (consulta !== carga) return;
            const { solicitudes, eps, paginacion: actual } = respuesta;
            pagina = actual.pagina;
            for (const solicitud of solicitudes) {
                const fila = filas.insertRow();
                const valores = [`#${solicitud.id}`, nombrePaciente(solicitud.paciente), documentoPaciente(solicitud.paciente),
                    eps.nombre, farmaciaVisible(solicitud.farmacia), fechaVisible(solicitud.fecha)];
                for (const valor of valores) fila.insertCell().textContent = valor;
                fila.insertCell().append(insigniaEstado(estadoVisible(solicitud.estado)));
                const medicamentos = document.createElement('ul');
                pintarLista(medicamentos, solicitud.medicamentos.map(medicamentoVisible), 'Sin medicamentos registrados.');
                fila.insertCell().append(medicamentos);
                fila.insertCell().textContent = formulaVisible(solicitud.formula_asociada);
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.className = 'btn-outline';
                boton.textContent = 'Ver detalle';
                boton.setAttribute('aria-label', `Ver detalle de la solicitud ${solicitud.id}`);
                boton.addEventListener('click', () => verDetalle(solicitud.id));
                fila.insertCell().append(boton);
            }
            estado.textContent = actual.total ? `${eps.nombre} · ${actual.total} solicitudes` : 'Sin solicitudes para los filtros seleccionados.';
            tabla.hidden = !solicitudes.length;
            anterior.disabled = pagina <= 1;
            siguiente.disabled = pagina >= actual.paginas;
            porId('epsSolicitudesPagina').textContent = `Página ${pagina} de ${Math.max(1, actual.paginas)}`;
            paginacion.hidden = actual.paginas <= 1 && pagina <= 1;
        } catch (error) {
            if (consulta === carga) estado.textContent = errorVisible(error);
        }
    }

    formulario.addEventListener('submit', event => {
        event.preventDefault();
        const valores = Object.fromEntries([...new FormData(formulario)].map(([campo, valor]) => [campo, valor.trim()]));
        if (Boolean(valores.documento) !== Boolean(valores.tipo_documento)) {
            carga++;
            tabla.hidden = true;
            paginacion.hidden = true;
            estado.textContent = 'Indica el tipo y el número de documento para buscar por afiliado.';
            return;
        }
        filtros = Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor));
        cargar(1);
    });
    formulario.addEventListener('reset', () => {
        filtros = {};
        if (!seccion.hidden) cargar(1);
    });
    anterior.addEventListener('click', () => cargar(pagina - 1));
    siguiente.addEventListener('click', () => cargar(pagina + 1));
    detalle.addEventListener('close', () => {
        if (detalle.open) return;
        cargaDetalle++;
        datos.hidden = true;
        porId('epsSolicitudResumen').textContent = '';
        porId('epsSolicitudPaciente').textContent = '';
        porId('epsSolicitudMedicamentos').replaceChildren();
        porId('epsSolicitudFormula').textContent = '';
        porId('epsSolicitudHistorial').replaceChildren();
        if (location.hash.startsWith('#solicitudes/')) history.replaceState(null, '', '#solicitudes');
    });

    function navegar() {
        const enlaceDetalle = /^#solicitudes\/([1-9]\d{0,9})$/.exec(location.hash);
        seccion.hidden = location.hash !== '#solicitudes' && !enlaceDetalle;
        if (seccion.hidden) {
            carga++;
            filas.replaceChildren();
            if (detalle.open) detalle.close();
            formulario.reset();
            return;
        }
        cargar(1);
        seccion.scrollIntoView();
        if (enlaceDetalle) {
            if (detalle.open) detalle.close();
            verDetalle(enlaceDetalle[1]);
        }
    }

    window.addEventListener('hashchange', navegar);
    navegar();
}
