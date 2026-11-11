export const ROLES = Object.freeze({ ADMINISTRADOR: 1, USUARIO: 2, FARMACIA: 3, EPS: 4 });
const permisos = Object.freeze({
    '/pages/admin.html': [1], '/pages/admin-cuentas.html': [1],
    '/pages/farmacia.html': [3],
    '/pages/dashboard.html': [2], '/pages/medicamentos.html': [2],
    '/pages/pedidos.html': [2], '/pages/historial.html': [2], '/pages/formulas.html': [2],
    '/pages/chat.html': [2, 3], '/pages/perfil.html': [1, 2, 3, 4]
});
export const PAGINAS_PRIVADAS = new Set(Object.keys(permisos));
export function rolUsuario(usuario) {
    const role = Number(usuario?.rol_id ?? usuario?.rol);
    return Object.values(ROLES).includes(role) ? role : null;
}
export function paginaInicio(usuario) {
    return ({ 1: '/pages/admin.html', 2: '/pages/dashboard.html', 3: '/pages/farmacia.html', 4: '/pages/perfil.html' })[rolUsuario(usuario)] || '/login.html';
}
export function puedeAcceder(destino, usuario) {
    const url = new URL(destino, 'http://localhost');
    const roles = permisos[url.pathname];
    if (roles) return roles.includes(rolUsuario(usuario));
    if (url.pathname === '/index.html' && ['domicilio', 'formula'].includes(url.searchParams.get('accion'))) return rolUsuario(usuario) === ROLES.USUARIO;
    return true;
}
