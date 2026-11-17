const states = new Set(['', 'todas', 'APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA']);
const sections = { '#panelFarmacia': '/pages/farmacia.html', '#pedidosFarmacia': '/pages/farmacia-solicitudes.html', '#inventarioFarmacia': '/pages/farmacia-inventario.html', '#medicamentos': '/pages/farmacia-medicamentos.html', '#notificacionesFarmacia': '/pages/farmacia-notificaciones.html' };
const paths = new Set(['/pages/farmacia.html', ...['usuarios','solicitudes','inventario','medicamentos','entregas','notificaciones','perfil'].map(name => '/pages/farmacia-' + name + '.html')]);
const page = value => /^[1-9]\d{0,5}$/.test(value || '') ? Number(value) : 1;
export function readFarmaciaContext(search) {
    const params = new URLSearchParams(search);
    return {
        filter: states.has(params.get('estado') || '') ? params.get('estado') || '' : '',
        page: page(params.get('pagina')), search: (params.get('buscar') || '').slice(0, 150),
        inventoryPage: page(params.get('inventarioPagina')),
        id: /^[1-9]\d{0,9}$/.test(params.get('id') || '') ? params.get('id') : '',
        availability: ['disponibles','bajos','agotados','inactivos','inconsistentes','desconocidos'].includes(params.get('disponibilidad')) ? params.get('disponibilidad') : 'todas',
        formula: ['requiere','no-requiere','desconocido'].includes(params.get('formula')) ? params.get('formula') : 'todas'
    };
}
export function farmaciaContextUrl(context, section = '/pages/farmacia.html') {
    const path = sections[section] || (paths.has(section) ? section : '/pages/farmacia.html');
    const params = new URLSearchParams();
    if (path === '/pages/farmacia-usuarios.html') {
        if (context.search) params.set('buscar', context.search);
        if (context.page > 1) params.set('pagina', String(context.page));
    }
    if (/farmacia-(solicitudes|entregas)\.html$/.test(path)) {
        if (context.filter) params.set('estado', context.filter);
        if (context.page > 1) params.set('pagina', String(context.page));
        if (context.id) params.set('id', context.id);
    }
    if (/farmacia-(inventario|medicamentos)\.html$/.test(path)) {
        if (context.search) params.set('buscar', context.search);
        if (context.inventoryPage > 1) params.set('inventarioPagina', String(context.inventoryPage));
        if (context.availability && context.availability !== 'todas') params.set('disponibilidad', context.availability);
        if (context.formula && context.formula !== 'todas') params.set('formula', context.formula);
    }
    return path + (params.size ? '?' + params : '');
}
export function farmaciaReturnUrl(value, section) {
    try {
        const url = new URL(value || '/pages/farmacia.html', window.location.origin);
        if (url.origin !== window.location.origin || !paths.has(url.pathname)) throw new Error('Destino no permitido');
        return farmaciaContextUrl(readFarmaciaContext(url.search), section || (url.pathname === '/pages/farmacia.html' && sections[url.hash] ? url.hash : url.pathname));
    } catch { return farmaciaContextUrl(readFarmaciaContext(''), section); }
}
