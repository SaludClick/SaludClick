import { apiFetch } from './api.js';
import { insigniaEstado } from './eps-presentation.js';

const porId = id => document.getElementById(id);
const nombreVisible = farmacia => farmacia.nombre || 'Nombre sin registrar';
const convenioVisible = farmacia => farmacia.activa ? 'Convenio activo' : 'Convenio inactivo';
const mensajeError = error => error.status === 403 ? `Acceso denegado. ${error.message}` : error.message;
const formatoFecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' });

export function iniciarFarmacias() {
    const seccion = porId('farmacias');
    const formulario = porId('epsFarmaciasBuscar');
    const estado = porId('epsFarmaciasEstado');
    const tabla = porId('epsFarmaciasTabla');
    const filas = porId('epsFarmaciasFilas');
    const paginacion = porId('epsFarmaciasPaginacion');
    const anterior = porId('epsFarmaciasAnterior');
    const siguiente = porId('epsFarmaciasSiguiente');
    const dialogo = porId('epsFarmaciaDetalle');
    const detalleEstado = porId('epsFarmaciaDetalleEstado');
    const datos = porId('epsFarmaciaDatos');
    let buscar = '';
    let pagina = 1;
    let solicitud = 0;
    let solicitudDetalle = 0;

    async function verDetalle(id) {
        const actual = ++solicitudDetalle;
        const titulo = porId('epsFarmaciaDetalleTitulo');
        titulo.textContent = 'Detalle de farmacia';
        datos.replaceChildren();
        detalleEstado.textContent = 'Consultando detalle…';
        dialogo.showModal();
        try {
            const { eps, farmacia } = await apiFetch(`/api/eps/farmacias/${id}`);
            if (actual !== solicitudDetalle || !dialogo.open) return;
            titulo.textContent = nombreVisible(farmacia);
            const campos = {
                ID: farmacia.id, EPS: eps.nombre, Convenio: convenioVisible(farmacia),
                'Fecha del vínculo': farmacia.vinculada_at ? formatoFecha.format(new Date(farmacia.vinculada_at)) : 'Sin fecha registrada'
            };
            for (const [etiqueta, valor] of Object.entries(campos)) {
                const termino = document.createElement('dt');
                const descripcion = document.createElement('dd');
                termino.textContent = etiqueta;
                descripcion.textContent = valor;
                datos.append(termino, descripcion);
            }
            detalleEstado.textContent = '';
        } catch (error) {
            if (actual === solicitudDetalle && dialogo.open) detalleEstado.textContent = mensajeError(error);
        }
    }

    async function cargar(destino) {
        const actual = ++solicitud;
        tabla.hidden = true;
        paginacion.hidden = true;
        filas.replaceChildren();
        estado.textContent = 'Consultando farmacias vinculadas…';
        const query = new URLSearchParams({ buscar, pagina: String(destino), tamano: '25' });
        try {
            const { eps, farmacias, paginacion: resultado } = await apiFetch(`/api/eps/farmacias?${query}`);
            if (actual !== solicitud) return;
            for (const farmacia of farmacias) {
                const fila = filas.insertRow();
                const nombre = document.createElement('strong');
                nombre.textContent = nombreVisible(farmacia);
                const identificador = document.createElement('small');
                identificador.className = 'eps-farmacia-id';
                identificador.textContent = `ID ${farmacia.id}`;
                fila.insertCell().append(nombre, identificador);
                fila.insertCell().append(insigniaEstado(convenioVisible(farmacia)));
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.className = 'btn-outline';
                boton.textContent = `Ver detalle de ${nombreVisible(farmacia)}`;
                boton.setAttribute('aria-label', `Ver detalle de ${nombreVisible(farmacia)}, ID ${farmacia.id}`);
                boton.addEventListener('click', () => verDetalle(farmacia.id));
                fila.insertCell().append(boton);
            }
            estado.textContent = resultado.total
                ? `${eps.nombre} · ${resultado.total} ${resultado.total === 1 ? 'farmacia vinculada' : 'farmacias vinculadas'}`
                : 'Sin farmacias vinculadas para la búsqueda.';
            tabla.hidden = !farmacias.length;
            pagina = resultado.pagina;
            anterior.disabled = pagina <= 1;
            siguiente.disabled = pagina >= resultado.paginas;
            porId('epsFarmaciasPagina').textContent = `Página ${pagina} de ${Math.max(1, resultado.paginas)}`;
            paginacion.hidden = resultado.paginas <= 1 && pagina <= 1;
        } catch (error) {
            if (actual === solicitud) estado.textContent = mensajeError(error);
        }
    }

    function navegar() {
        seccion.hidden = location.hash !== '#farmacias';
        if (seccion.hidden) {
            solicitud++;
            filas.replaceChildren();
            if (dialogo.open) dialogo.close();
            return;
        }
        cargar(1);
        seccion.scrollIntoView();
    }

    formulario.addEventListener('submit', event => {
        event.preventDefault();
        buscar = porId('epsFarmaciaNombre').value.trim();
        cargar(1);
    });
    anterior.addEventListener('click', () => cargar(pagina - 1));
    siguiente.addEventListener('click', () => cargar(pagina + 1));
    dialogo.addEventListener('close', () => {
        if (dialogo.open) return;
        solicitudDetalle++;
        datos.replaceChildren();
    });
    window.addEventListener('hashchange', navegar);
    navegar();
}
