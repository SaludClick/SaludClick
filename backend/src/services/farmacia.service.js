const repository = require('../repositories/farmacia.repository');
const ESTADOS = new Set(['APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA']);

function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function pagination(query) {
    const raw = query.pagina ?? '1';
    if (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw)) throw invalid('Página no válida.');
    const pagina = Number(raw), take = 25;
    return { pagina, take, skip: (pagina - 1) * take };
}
function pageInfo(options, total) {
    return { pagina: options.pagina, tamano: options.take, total, paginas: Math.ceil(total / options.take) };
}
async function listarPedidos(query = {}) {
    const options = pagination(query);
    const estado = query.estado || undefined;
    if (estado !== undefined && !ESTADOS.has(estado)) throw invalid('Estado de pedido no permitido.');
    const { pedidos, total } = await repository.listarPedidos({ ...options, estado });
    return { pedidos, paginacion: pageInfo(options, total) };
}
async function listarInventario(query = {}) {
    const options = pagination(query);
    if (query.buscar !== undefined && (typeof query.buscar !== 'string' || query.buscar.length > 150)) {
        throw invalid('La búsqueda debe tener como máximo 150 caracteres.');
    }
    const { medicamentos, total } = await repository.listarInventario({ ...options, buscar: query.buscar?.trim() || '' });
    return { medicamentos, paginacion: pageInfo(options, total) };
}
module.exports = { listarPedidos, listarInventario };
