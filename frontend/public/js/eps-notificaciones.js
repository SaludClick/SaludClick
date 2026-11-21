import { apiFetch } from './api.js';
import { getToken } from './auth.js';

const ruta = '/api/eps/notificaciones';
const porId = id => document.getElementById(id);
const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
const secciones = { '#solicitudes': 'Ir a Solicitudes', '#farmacias': 'Ir a Farmacias vinculadas', '#perfil': 'Ir a Perfil' };
const tipos = {
    ACTIVACION: 'Cuenta EPS', PERFIL: 'Perfil', SOLICITUD: 'Solicitud',
    SOLICITUD_NUEVA: 'Solicitud', SOLICITUD_ESTADO: 'Solicitud',
    FARMACIA: 'Convenio', FARMACIA_VINCULADA: 'Convenio', FARMACIA_DESVINCULADA: 'Convenio'
};

function nodo(tipo, texto) {
    const elemento = document.createElement(tipo);
    elemento.textContent = texto;
    return elemento;
}

export function iniciarNotificaciones() {
    const modulo = porId('notificaciones');
    const lista = porId('epsAvisosLista');
    const estado = porId('epsAvisosEstado');
    const filtro = porId('epsAvisosFiltro');
    const anterior = porId('epsAvisosAnterior');
    const siguiente = porId('epsAvisosSiguiente');
    const todas = porId('epsAvisosLeerTodas');
    const paginacion = porId('epsAvisosPaginacion');
    const badge = porId('epsAvisosContador');
    let pagina = 1;
    let secuencia = 0;
    let mutando = false;
    let bloqueada = false;
    let firma = '';

    function contador(cantidad) {
        badge.hidden = !cantidad;
        badge.textContent = cantidad ? String(cantidad) : '';
        badge.setAttribute('aria-label', `${cantidad} notificaciones no leídas`);
        todas.disabled = mutando || !cantidad;
    }

    function errorVisible(error) {
        if (error.status === 403) {
            bloqueada = true;
            contador(0);
            return 'Acceso denegado. La cuenta no tiene una vinculación EPS vigente.';
        }
        return error.message;
    }

    function tarjeta(aviso) {
        const fila = nodo('li', '');
        fila.append(nodo('h3', aviso.titulo), nodo('p', aviso.mensaje),
            nodo('p', `${tipos[aviso.tipo]} · ${fecha.format(new Date(aviso.fecha))} · ${aviso.leida_at ? 'Leída' : 'No leída'}`));
        const acciones = nodo('div', '');
        acciones.className = 'eps-avisos-controles';
        if (secciones[aviso.enlace]) {
            const enlace = nodo('a', secciones[aviso.enlace]);
            enlace.href = aviso.enlace;
            acciones.append(enlace);
        }
        if (!aviso.leida_at) {
            const boton = nodo('button', 'Marcar como leída');
            boton.className = 'btn-outline';
            boton.type = 'button';
            boton.addEventListener('click', () => marcar(`/${aviso.id}/leida`));
            acciones.append(boton);
        }
        fila.append(acciones);
        return fila;
    }

    async function actualizar(destino = pagina, mostrarCarga = false) {
        if (!getToken() || bloqueada || mutando) return;
        const consulta = ++secuencia;
        const dashboard = !location.hash || location.hash === '#dashboard';
        if (!modulo.hidden && mostrarCarga) estado.textContent = 'Consultando notificaciones…';
        try {
            const query = new URLSearchParams({ estado: filtro.value, pagina: String(destino) });
            const url = dashboard ? `${ruta}?tamano=4` : modulo.hidden ? `${ruta}/no-leidas/count` : `${ruta}?${query}`;
            const datos = await apiFetch(url);
            if (consulta !== secuencia) return;
            contador(datos.noLeidas);
            if (dashboard) window.dispatchEvent(new CustomEvent('eps:avisos-dashboard', { detail: datos }));
            if (modulo.hidden) return;
            const info = datos.paginacion;
            if (destino > 1 && destino > info.paginas) {
                await actualizar(Math.max(1, info.paginas), mostrarCarga);
                return;
            }
            pagina = info.pagina;
            const nuevaFirma = JSON.stringify(datos.notificaciones);
            if (firma !== nuevaFirma) {
                lista.replaceChildren(...datos.notificaciones.map(tarjeta));
                firma = nuevaFirma;
            }
            estado.textContent = info.total ? '' : 'Sin notificaciones para el filtro seleccionado.';
            anterior.disabled = pagina <= 1;
            siguiente.disabled = pagina >= info.paginas;
            paginacion.hidden = info.paginas <= 1;
            porId('epsAvisosPagina').textContent = `Página ${pagina} de ${info.paginas}`;
        } catch (error) {
            if (consulta !== secuencia) return;
            const mensaje = errorVisible(error);
            if (dashboard) window.dispatchEvent(new CustomEvent('eps:avisos-dashboard', { detail: { error: mensaje } }));
            if (modulo.hidden) return;
            lista.replaceChildren();
            firma = '';
            paginacion.hidden = true;
            todas.disabled = true;
            estado.textContent = mensaje;
        }
    }

    async function marcar(destino) {
        if (mutando || bloqueada) return;
        secuencia++;
        mutando = true;
        todas.disabled = true;
        try {
            const { noLeidas } = await apiFetch(ruta + destino, { method: 'PATCH' });
            mutando = false;
            contador(noLeidas);
            await actualizar();
        } catch (error) {
            mutando = false;
            estado.textContent = errorVisible(error);
            if (!bloqueada) todas.disabled = badge.hidden;
            else {
                lista.replaceChildren();
                firma = '';
                paginacion.hidden = true;
            }
        }
    }

    function navegar() {
        modulo.hidden = location.hash !== '#notificaciones';
        if (!modulo.hidden) {
            bloqueada = false;
            modulo.scrollIntoView();
        }
        actualizar(1, true);
    }

    todas.addEventListener('click', () => marcar('/leer-todas'));
    filtro.addEventListener('change', () => actualizar(1, true));
    anterior.addEventListener('click', () => actualizar(pagina - 1, true));
    siguiente.addEventListener('click', () => actualizar(pagina + 1, true));
    window.addEventListener('hashchange', navegar);
    porId('refreshEps').addEventListener('click', () => actualizar(1));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) actualizar(); });
    window.setInterval(() => { if (!document.hidden) actualizar(); }, 30000);
    navegar();
}
