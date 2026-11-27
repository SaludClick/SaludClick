import { getCurrentUser, getToken, logout } from './auth.js';
import { ROLES, rolUsuario } from './roles.js';
import './menu.js';

const dashboard = '/pages/dashboard.html';
const icon = name => `<svg aria-hidden="true" focusable="false"><use href="/images/user-icons.svg#${name}"></use></svg>`;
const links = [
    ['dashboard', 'house', 'Inicio'],
    ['medicamentos', 'pills', 'Medicamentos'],
    ['pedidos', 'cart-shopping', 'Pedidos'],
    ['formulas', 'file-medical', 'Fórmulas'],
    ['historial', 'clock-rotate-left', 'Historial'],
    ['perfil', 'user', 'Mi perfil'],
    ['chat-farmacia', 'comments', 'Chat con farmacia'],
    ['soporte', 'headset', 'Atención administrativa'],
    ['chat', 'circle-question', 'VITALIX']
];

function updateName() {
    const label = document.querySelector('.user-panel-header #nombreUsuarioTop');
    if (!label) return;
    const user = getCurrentUser();
    const name = user?.nombre || '';
    label.textContent = name || 'Usuario';
    label.title = name;
}

document.querySelectorAll('[data-user-header]').forEach(placeholder => {
    if (!getToken() || rolUsuario(getCurrentUser()) !== ROLES.USUARIO) return;
    const activePath = location.pathname === '/pages/constancia-entrega.html'
        ? '/pages/pedidos.html' : location.pathname;
    const header = document.createElement('header');
    header.className = 'navbar dashboard-navbar user-panel-header panel-topbar';
    header.id = 'navbar';
    header.innerHTML = `
        <div class="container nav-container">
            <a href="${dashboard}" class="logo" aria-label="SaludClick, ir a mi inicio">
                ${icon('heart-pulse')}<span>SaludClick</span>
            </a>
            <div class="dashboard-header-actions">
                <div class="dashboard-top-identity">
                    <span class="dashboard-account-icon" aria-hidden="true"></span>
                    <span id="nombreUsuarioTop"></span>
                </div>
                <div class="user-panel-menu-anchor">
                    <button class="menu-toggle" id="menuToggle" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="menu">
                        <span class="panel-menu-icon" aria-hidden="true"></span>
                    </button>
                    <nav class="main-nav" id="menu" aria-label="Menú principal">
                        ${links.map(([route, symbol, text]) => {
                            const path = `/pages/${route}.html`;
                            return `<a class="nav-link${path === activePath ? ' active' : ''}" href="${path}"${path === activePath ? ' aria-current="page"' : ''}>
                                ${icon(symbol)}<span>${text}</span></a>`;
                        }).join('')}
                        <button type="button" id="logout" class="nav-link user-panel-logout">
                            ${icon('right-from-bracket')}<span>Cerrar sesión</span>
                        </button>
                    </nav>
                </div>
                <saludclick-theme-control></saludclick-theme-control>
            </div>
        </div>`;
    header.querySelector('#logout').addEventListener('click', logout);
    placeholder.replaceWith(header);
    document.querySelector('[data-user-header-fallback]')?.remove();
    updateName();
    window.addEventListener('pageshow', event => { if (event.persisted) updateName(); });
    document.addEventListener('saludclick:perfil-actualizado', updateName);
});
