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
const SIGUIENTE = Object.freeze({ APROBADA: 'PREPARANDO', PREPARANDO: 'LISTA', LISTA: 'ENTREGADA' });
async function avanzarPedido(idEntrada, body) {
    if (!/^[1-9]\d*$/.test(String(idEntrada)) || !Number.isSafeInteger(Number(idEntrada))) throw invalid('Pedido no válido.');
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key => !['estadoActual', 'estado'].includes(key)) ||
        !Object.hasOwn(SIGUIENTE, body.estadoActual) || SIGUIENTE[body.estadoActual] !== body.estado) {
        throw invalid('Solo se permite avanzar de aprobado a preparando, listo y entregado.');
    }
    const id = Number(idEntrada);
    const count = await repository.avanzarPedido(id, body.estadoActual, body.estado);
    if (!count) throw Object.assign(new Error('El pedido cambió, no existe o no tiene un pago aprobado. Actualiza la lista.'), { status: 409 });
    return { id, estado: body.estado };
}
module.exports = { listarPedidos, listarInventario, avanzarPedido };
