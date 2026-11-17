import { initFarmaciaSolicitudes } from './farmacia-solicitudes.js';
import { initFarmaciaExistencias } from './farmacia-existencias.js';
import { initFarmaciaNotifications } from './farmacia-notificaciones.js';
import { initPerfil } from './perfil.js';
import { checkAuthGuard, getCurrentUser, initAuth, logout } from './auth.js';
import { apiFetch } from './api.js';
import { paginaInicio, rolUsuario, ROLES } from './roles.js';
import { readFarmaciaContext, farmaciaContextUrl, farmaciaReturnUrl } from './farmacia-context.js';
import { initFarmaciaDashboard } from './farmacia-dashboard.js';
import { consultarEPS, initFarmaciaUsuarios } from './farmacia-usuarios.js';

if (checkAuthGuard()) document.addEventListener('DOMContentLoaded', async () => {
    const app = document.getElementById('farmaciaApp');
    if (!app) return;
    const user = getCurrentUser();
    if (rolUsuario(user) !== ROLES.FARMACIA) { window.location.replace(paginaInicio(user)); return; }
    const context = readFarmaciaContext(location.search);
    const legacy = farmaciaReturnUrl(location.pathname + location.search + location.hash);
    if (location.pathname === '/pages/farmacia.html' && legacy.split('?')[0] !== location.pathname) { location.replace(legacy); return; }
    initAuth();
    document.getElementById('farmaciaUserName').textContent = user.nombre || 'Farmacia';
    document.getElementById('logout').addEventListener('click', logout);
    const menu = document.getElementById('menu'), toggle = document.getElementById('menuToggle');
    const mobile = window.matchMedia('(max-width: 900px)');
    const sync = () => { menu.inert = mobile.matches && !menu.classList.contains('active'); };
    const close = () => { menu.classList.remove('active'); toggle.setAttribute('aria-expanded', 'false'); sync(); };
    toggle.addEventListener('click', () => queueMicrotask(sync));
    mobile.addEventListener('change', close); sync();
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.classList.contains('active')) { close(); toggle.focus(); } });
    const access = document.getElementById('farmaciaAccessStatus');
    try { await apiFetch('/api/farmacia/verificar-acceso'); }
    catch (error) {
        access.textContent = error.message || 'No se pudo verificar el acceso a Farmacia.';
        access.setAttribute('role', 'alert');
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Reintentar acceso';
        retry.addEventListener('click', () => location.reload()); access.append(' ', retry);
        return;
    }
    access.hidden = true;
    document.getElementById('farmaciaMain').hidden = false;
    app.dataset.authorized = 'true';
    const module = app.dataset.farmaciaModule;
    const saveContext = changes => {
        Object.assign(context, changes);
        const url = farmaciaContextUrl(context, location.pathname);
        history.replaceState(null, '', url);
        if (module !== 'chat') app.querySelector('[data-farmacia-link="chat"]').href = '/pages/farmacia-chat.html?volver=' + encodeURIComponent(url);
    };
    if (module !== 'chat') saveContext({});
    if (module === 'usuarios') initFarmaciaUsuarios({ initialContext: context, onContextChange: saveContext });
    else void consultarEPS();
    if (module === 'dashboard') initFarmaciaDashboard();
    if (module === 'solicitudes' || module === 'entregas') {
        if (module === 'entregas' && !['LISTA','ENTREGADA'].includes(context.filter)) context.filter = 'LISTA';
        initFarmaciaSolicitudes({ initialContext: context, onContextChange: saveContext });
    }
    if (module === 'inventario' || module === 'medicamentos') initFarmaciaExistencias(module === 'inventario' ? 'inventario' : 'catalogo', { initialContext: context, onContextChange: saveContext });
    if (module === 'notificaciones') {
        const notifications = initFarmaciaNotifications();
        document.getElementById('refreshFarmacia').addEventListener('click', () => notifications.refresh());
    }
    if (module === 'perfil') void initPerfil();
    if (module === 'chat') document.getElementById('farmaciaChatReturn').href = farmaciaReturnUrl(new URLSearchParams(location.search).get('volver'));
    document.dispatchEvent(new Event('farmacia:ready'));
});
