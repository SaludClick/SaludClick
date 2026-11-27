import { checkAuthGuard, initAuth, getCurrentUser, getToken, actualizarUsuarioSesion } from './auth.js';
import { apiFetch } from './api.js';
import { ROLES, rolUsuario } from './roles.js';

export async function initPerfil() {
    const form = document.getElementById('perfilFormulario');
    if (!form || form.dataset.initialized) return;
    form.dataset.initialized = 'true';
    initAuth();
    const message = document.getElementById('mensajePerfil');
    const save = document.getElementById('guardarPerfil');
    const cancel = document.getElementById('cancelarPerfil');
    const retry = document.getElementById('reintentarPerfil');
    const fields = ['nombre', 'apellido', 'tipoDocumento', 'numeroDocumento', 'telefono', 'ciudad'];
    let saved;
    let savedToken;
    let busy = false;

    function setBusy(value) {
        busy = value;
        form.setAttribute('aria-busy', String(value));
        for (const field of fields) form.elements[field].disabled = value || !saved;
        save.disabled = cancel.disabled = value || !saved;
        retry.hidden = value || !!saved;
    }
    function render(user) {
        if (!user || typeof user.nombre !== 'string' || typeof user.apellido !== 'string' ||
            (getCurrentUser()?.id != null && Number(getCurrentUser().id) !== Number(user.id))) {
            throw new Error('No se pudo verificar el perfil de la sesión.');
        }
        for (const field of fields) form.elements[field].value = (field === 'tipoDocumento'
            ? user.tipo_documento ?? user.tipoDocumento : user[field]) ?? '';
        document.getElementById('email').value = user.correo ?? '';
        const name = document.getElementById('nombrePerfil');
        if (name) name.textContent = [user.nombre, user.apellido].filter(Boolean).join(' ');
    }
    async function load() {
        if (busy || !checkAuthGuard()) return;
        const token = getToken();
        setBusy(true);
        message.dataset.state = 'loading';
        message.textContent = 'Cargando perfil…';
        try {
            const { usuario } = await apiFetch('/api/auth/profile');
            if (token !== getToken()) return;
            render(usuario);
            saved = usuario;
            savedToken = token;
            message.textContent = '';
        } catch (error) {
            message.dataset.state = 'error';
            message.textContent = error.message;
        } finally {
            setBusy(false);
        }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !saved || !checkAuthGuard()) return;
        if (savedToken !== getToken()) {
            saved = undefined;
            form.reset();
            await load();
            return;
        }
        const values = Object.fromEntries(fields.map(field => [field, form.elements[field].value.trim()]));
        if (!values.nombre || !values.apellido) {
            message.dataset.state = 'error';
            message.textContent = 'Los nombres y apellidos son obligatorios.';
            form.elements[values.nombre ? 'apellido' : 'nombre'].focus();
            return;
        }
        const role = rolUsuario(getCurrentUser());
        if ([ROLES.USUARIO, ROLES.FARMACIA].includes(role) && values.telefono &&
            (!/^\+?[0-9 ()-]+$/.test(values.telefono) || !/^\d{7,15}$/.test(values.telefono.replace(/\D/g, '')))) {
            message.dataset.state = 'error';
            message.textContent = 'Ingresa un teléfono válido de 7 a 15 dígitos.';
            form.elements.telefono.focus();
            return;
        }
        const token = getToken();
        setBusy(true);
        message.dataset.state = 'loading';
        message.textContent = 'Guardando cambios…';
        try {
            const result = await apiFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify(values) });
            if (token !== getToken()) return;
            render(result.usuario);
            saved = result.usuario;
            const { nombre, apellido, correo } = saved;
            actualizarUsuarioSesion({ ...getCurrentUser(), nombre, apellido, correo });
            document.dispatchEvent(new Event('saludclick:perfil-actualizado'));
            message.dataset.state = 'success';
            message.textContent = result.mensaje || 'Perfil actualizado correctamente.';
        } catch (error) {
            message.dataset.state = 'error';
            message.textContent = error.message;
        } finally {
            setBusy(false);
        }
    });
    cancel.addEventListener('click', () => {
        if (!saved || busy) return;
        render(saved);
        message.dataset.state = '';
        message.textContent = 'Cambios descartados.';
    });
    retry.addEventListener('click', load);
    await load();
}

if (checkAuthGuard()) document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('farmaciaApp')) void initPerfil();
});
