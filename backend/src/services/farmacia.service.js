const repository = require('../repositories/farmacia.repository');
const validator = require('../validators/farmacia-solicitudes.validator');
const { SIGUIENTE } = require('../config/farmacia-solicitudes');

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
const {operacion}=require('./farmacia-operacion.rules');

function presentar(pedido) {
    const { pagos, direccion, ...publico } = pedido;
    return { ...publico, ...(direccion !== undefined && pedido.tipo_entrega === 'DOMICILIO' ? { direccion } : {}), operacion: operacion(pedido) };
}
async function listarPedidos(query = {}, actorId) {
    await validarFarmacia(actorId);
    const options = validator.listado(query);
    const { pedidos, total, resumen } = await repository.listarPedidos({ ...options, actorId });
    return { pedidos: pedidos.map(presentar), resumen, paginacion: pageInfo(options, total) };
}
async function detallePedido(rawId, query = {}, actorId) {
    const id = validator.id(rawId); validator.sinQuery(query);
    await validarFarmacia(actorId);
    const pedido = await repository.detallePedido(id, actorId);
    if (!pedido) throw Object.assign(new Error('Solicitud no encontrada en la cola de Farmacia.'), { status: 404 });
    return { pedido: presentar(pedido) };
}
async function listarInventario(query = {}) {
    const options = pagination(query);
    if (query.buscar !== undefined && (typeof query.buscar !== 'string' || query.buscar.length > 150)) {
        throw invalid('La búsqueda debe tener como máximo 150 caracteres.');
    }
    const { medicamentos, total } = await repository.listarInventario({ ...options, buscar: query.buscar?.trim() || '' });
    return { medicamentos, paginacion: pageInfo(options, total) };
}
async function avanzarPedido(rawId, body, notify, actorId) {
    const id = validator.id(rawId); validator.transicion(body);
    await validarFarmacia(actorId);
    const pedido = await repository.detallePedido(id, actorId);
    if (!pedido) throw Object.assign(new Error('La solicitud no existe o dejó de estar disponible. Actualiza la lista.'), { status: 409 });
    // Stored state is authoritative; the browser's old state is only a concurrency precondition.
    if (pedido.estado !== body.estadoActual || SIGUIENTE[pedido.estado] !== body.estado) {
        throw Object.assign(new Error('El estado cambió. Actualiza la lista antes de continuar.'), { status: 409 });
    }
    if (!operacion(pedido).siguienteEstado) throw Object.assign(new Error('Operación bloqueada: se exige pago real aprobado y medicamentos sin validación farmacéutica pendiente o desconocida.'), { status: 409 });
    const siguiente = SIGUIENTE[pedido.estado];
    const { count, destinatarios } = await repository.avanzarPedido(id, pedido.estado, siguiente, actorId);
    if (!count) throw Object.assign(new Error('La solicitud o sus condiciones cambiaron. Actualiza la lista.'), { status: 409 });
    if (destinatarios.length && notify) {
        try { await notify(destinatarios); } catch { /* Persistence already committed. */ }
    }
    return { id, estado: siguiente };
}
async function validarFarmacia(id) {
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || !await repository.farmaciaActiva(id))) {
        throw Object.assign(new Error('La farmacia no tiene acceso vigente.'), { status: 403 });
    }
}
module.exports = { listarPedidos, detallePedido, listarInventario, avanzarPedido };
