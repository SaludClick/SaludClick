import { apiFetch } from './api.js';
import { insigniaEstado } from './eps-presentation.js';

export function iniciarAfiliados() {
    const porId = id => document.getElementById(id);
    const seccion = porId('afiliados');
    const formulario = porId('epsAfiliadosBuscar');
    const tabla = porId('epsAfiliadosTabla');
    const filas = porId('epsAfiliadosFilas');
    const estado = porId('epsAfiliadosEstado');
    const paginacion = porId('epsAfiliadosPaginacion');
    const anterior = porId('epsAnterior');
    const siguiente = porId('epsSiguiente');
    const detalle = porId('epsAfiliadoDetalle');
    const detalleEstado = porId('epsDetalleEstado');
    const datos = porId('epsDetalleDatos');
    let pagina = 1;
    let buscar = '';
    let ultimaConsulta = 0;
    let ultimoDetalle = 0;

    async function verDetalle(id) {
        const consulta = ++ultimoDetalle;
        datos.replaceChildren();
        detalleEstado.textContent = 'Cargando detalle…';
        detalle.showModal();
        try {
            const { afiliado } = await apiFetch(`/api/eps/afiliados/${encodeURIComponent(id)}`);
            if (consulta !== ultimoDetalle || !detalle.open) return;
            const campos = {
                ID: afiliado.id, Nombres: afiliado.nombres, Apellidos: afiliado.apellidos,
                Documento: `${afiliado.tipo_documento || ''} ${afiliado.documento || ''}`.trim(),
                Correo: afiliado.correo, Estado: afiliado.estado
            };
            for (const [etiqueta, valor] of Object.entries(campos)) {
                const termino = document.createElement('dt');
                const descripcion = document.createElement('dd');
                termino.textContent = etiqueta;
                descripcion.textContent = valor || '—';
                datos.append(termino, descripcion);
            }
            detalleEstado.textContent = '';
        } catch (error) {
            if (consulta === ultimoDetalle && detalle.open) detalleEstado.textContent = error.message;
        }
    }

    async function cargar(destino) {
        const consulta = ++ultimaConsulta;
        tabla.hidden = true;
        paginacion.hidden = true;
        filas.replaceChildren();
        estado.textContent = 'Consultando afiliados…';
        const query = new URLSearchParams({ buscar, pagina: String(destino), tamano: '25' });
        try {
            const respuesta = await apiFetch(`/api/eps/afiliados?${query}`);
            if (consulta !== ultimaConsulta) return;
            const { afiliados, eps, totalActivos, paginacion: paginaActual } = respuesta;
            pagina = paginaActual.pagina;
            for (const afiliado of afiliados) {
                const fila = filas.insertRow();
                const documento = `${afiliado.tipo_documento || ''} ${afiliado.documento || ''}`.trim();
                for (const valor of [afiliado.id, afiliado.nombres, afiliado.apellidos, documento]) {
                    fila.insertCell().textContent = valor || '—';
                }
                fila.insertCell().append(insigniaEstado(afiliado.estado || '—'));
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.className = 'btn-outline';
                boton.textContent = 'Ver detalle';
                boton.setAttribute('aria-label', `Ver detalle del afiliado ${afiliado.id}`);
                boton.addEventListener('click', () => verDetalle(afiliado.id));
                fila.insertCell().append(boton);
            }
            const coincidencias = paginaActual.total ? `${paginaActual.total} coincidencias` : 'Sin resultados';
            estado.textContent = `${eps.nombre} · ${totalActivos} afiliados activos · ${coincidencias}`;
            tabla.hidden = !afiliados.length;
            anterior.disabled = pagina <= 1;
            siguiente.disabled = pagina >= paginaActual.paginas;
            porId('epsPagina').textContent = `Página ${pagina} de ${paginaActual.paginas}`;
            paginacion.hidden = paginaActual.paginas <= 1 && pagina <= 1;
        } catch (error) {
            if (consulta === ultimaConsulta) estado.textContent = error.message;
        }
    }

    function navegar() {
        seccion.hidden = location.hash !== '#afiliados';
        if (seccion.hidden) {
            ultimaConsulta++;
            filas.replaceChildren();
            if (detalle.open) detalle.close();
            datos.replaceChildren();
            return;
        }
        cargar(1);
        seccion.scrollIntoView();
    }

    formulario.addEventListener('submit', event => {
        event.preventDefault();
        buscar = porId('epsBuscar').value.trim();
        cargar(1);
    });
    anterior.addEventListener('click', () => cargar(pagina - 1));
    siguiente.addEventListener('click', () => cargar(pagina + 1));
    window.addEventListener('hashchange', navegar);
    navegar();
}
