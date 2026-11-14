import { initFarmaciaSolicitudes } from './farmacia-solicitudes.js';
import { initFarmaciaExistencias } from './farmacia-existencias.js';
import { checkAuthGuard, getCurrentUser, initAuth, logout } from './auth.js';
import { paginaInicio, rolUsuario, ROLES } from './roles.js';
import { readFarmaciaContext, farmaciaContextUrl } from './farmacia-context.js';

if (checkAuthGuard()) document.addEventListener('DOMContentLoaded', () => {
    const user = getCurrentUser();
    if (rolUsuario(user) !== ROLES.FARMACIA) { window.location.replace(paginaInicio(user)); return; }
    initAuth();
    document.getElementById('farmaciaUserName').textContent = user.nombre || 'Farmacia';
    document.getElementById('logout').addEventListener('click', logout);
    const mobileMenu = window.matchMedia('(max-width: 900px)');
    const syncMenuAccessibility = () => {
        document.getElementById('menu').inert = mobileMenu.matches && !document.getElementById('menu').classList.contains('active');
    };
    const closeMenu = () => {
        document.getElementById('menu').classList.remove('active');
        document.getElementById('menuToggle').setAttribute('aria-expanded', 'false');
        syncMenuAccessibility();
    };
    document.getElementById('menuToggle').addEventListener('click', () => queueMicrotask(syncMenuAccessibility));
    mobileMenu.addEventListener('change', closeMenu);
    syncMenuAccessibility();
    const updateNavigation = () => {
        const hash = location.hash || '#panelFarmacia';
        document.querySelectorAll('#menu a').forEach(link => {
            const active = link.hash === hash;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
        });
    };
    window.addEventListener('hashchange', updateNavigation);
    document.querySelectorAll('#menu a').forEach(link => link.addEventListener('click', () => {
        closeMenu();
        if (link.hash) document.querySelector(link.hash)?.focus();
    }));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById('menu').classList.contains('active')) {
            closeMenu(); document.getElementById('menuToggle').focus();
        }
    });
    document.getElementById('farmaciaMain').hidden = false;
    const context = readFarmaciaContext(location.search);
    const saveContext = changes => {
        Object.assign(context, changes);
        const url = farmaciaContextUrl(context, location.hash);
        history.replaceState(null, '', url);
        document.querySelector('#menu a[href^="/pages/chat-farmacia.html"]').href = '/pages/chat-farmacia.html?volver=' + encodeURIComponent(url);
        document.querySelectorAll('[data-order-status]').forEach(card => card.setAttribute('aria-pressed', String(card.dataset.orderStatus === context.filter)));
        updateNavigation();
    };
    window.addEventListener('hashchange', () => saveContext({}));
    initFarmaciaSolicitudes({ initialContext: context, onContextChange: saveContext });
    initFarmaciaExistencias('inventario', { initialContext: context, onContextChange: saveContext });
    initFarmaciaExistencias('catalogo');
    saveContext({});
});
