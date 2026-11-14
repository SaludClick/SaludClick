const states = new Set(['', 'APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA']);
const sections = new Set(['#panelFarmacia', '#pedidosFarmacia', '#inventarioFarmacia']);
const page = value => /^[1-9]\d{0,5}$/.test(value || '') ? Number(value) : 1;

export function readFarmaciaContext(search) {
    const params = new URLSearchParams(search);
    return {
        filter: states.has(params.get('estado') || '') ? params.get('estado') || '' : '',
        page: page(params.get('pagina')),
        search: (params.get('buscar') || '').slice(0, 150),
        inventoryPage: page(params.get('inventarioPagina'))
    };
}

export function farmaciaContextUrl(context, hash = '#panelFarmacia') {
    const params = new URLSearchParams();
    if (context.filter) params.set('estado', context.filter);
    if (context.page > 1) params.set('pagina', String(context.page));
    if (context.search) params.set('buscar', context.search);
    if (context.inventoryPage > 1) params.set('inventarioPagina', String(context.inventoryPage));
    return `/pages/farmacia.html${params.size ? `?${params}` : ''}${sections.has(hash) ? hash : '#panelFarmacia'}`;
}

// The chat return target is restricted to the pharmacy page and known fields.
export function farmaciaReturnUrl(value, hash) {
    try {
        const url = new URL(value || '/pages/farmacia.html', window.location.origin);
        if (url.origin !== window.location.origin || url.pathname !== '/pages/farmacia.html') throw new Error('Destino no permitido');
        return farmaciaContextUrl(readFarmaciaContext(url.search), hash || url.hash);
    } catch { return farmaciaContextUrl(readFarmaciaContext(''), hash); }
}
