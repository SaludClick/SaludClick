import { apiFetch } from './api.js';
import { actualizarUsuarioSesion, getCurrentUser } from './auth.js';

const porId = id => document.getElementById(id);

function describir(elemento, campos) {
    elemento.replaceChildren();
    for (const [etiqueta, valor] of Object.entries(campos)) {
        const termino = document.createElement('dt');
        const descripcion = document.createElement('dd');
        termino.textContent = etiqueta;
        descripcion.textContent = valor || 'Sin registrar';
        elemento.append(termino, descripcion);
    }
}

export function iniciarPerfil() {
    const vista = porId('perfil');
    const estado = porId('epsPerfilEstado');
    const datos = porId('epsPerfilDatos');
    const form = porId('epsPerfilForm');
    const guardar = form.querySelector('button');
    let consulta = 0;
    let guardando = false;

    function pintar({ eps, usuario }) {
        porId('epsPerfilEntidad').textContent = eps.nombre;
        describir(porId('epsPerfilInstitucional'), {
            'ID de entidad': eps.id, Vínculo: 'Vigente', Correo: eps.correo,
            Teléfono: eps.telefono, Ciudad: eps.ciudad, Dirección: eps.direccion
        });
        describir(porId('epsPerfilCuenta'), { Correo: usuario.correo, Estado: usuario.estado, Rol: 'EPS' });
        for (const campo of ['nombre', 'apellido', 'telefono', 'ciudad']) form.elements[campo].value = usuario[campo] ?? '';
        datos.hidden = false;
    }

    async function cargar() {
        const actual = ++consulta;
        datos.hidden = true;
        estado.textContent = 'Consultando perfil…';
        try {
            const perfil = await apiFetch('/api/eps/perfil');
            if (actual !== consulta) return;
            pintar(perfil);
            estado.textContent = '';
        } catch (error) {
            if (actual === consulta) estado.textContent = error.status === 403 ? `Acceso denegado. ${error.message}` : error.message;
        }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (guardando) return;
        guardando = true;
        guardar.disabled = true;
        const actual = ++consulta;
        estado.textContent = 'Guardando perfil…';
        try {
            const perfil = await apiFetch('/api/eps/perfil', {
                method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(form)))
            });
            const { nombre, apellido } = perfil.usuario;
            actualizarUsuarioSesion({ ...getCurrentUser(), nombre, apellido });
            porId('epsUserName').textContent = nombre;
            if (actual === consulta) {
                pintar(perfil);
                estado.textContent = 'Perfil actualizado.';
            } else if (!vista.hidden) await cargar();
        } catch (error) {
            if (actual === consulta) {
                if (error.status === 403) datos.hidden = true;
                estado.textContent = error.status === 403 ? `Acceso denegado. ${error.message}` : error.message;
            }
        } finally {
            guardando = false;
            guardar.disabled = false;
        }
    });

    function navegar() {
        vista.hidden = location.hash !== '#perfil';
        if (vista.hidden) { consulta++; datos.hidden = true; }
        else { cargar(); vista.scrollIntoView(); }
    }
    window.addEventListener('hashchange', navegar);
    navegar();
}
