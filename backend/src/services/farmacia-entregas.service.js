// Dominio preparado, SIN adaptador de producción ni rutas de escritura.
// Las operaciones tx son un contrato futuro, no tablas/columnas existentes.
const { createHash } = require('node:crypto');
const { SIGUIENTE } = require('../config/farmacia-solicitudes');
const fail = (status, codigo) => Object.assign(new Error(codigo), { status, codigo });
function validar(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(k => !['pedidoId','version','estadoActual','estado','clave','recepcion','observaciones'].includes(k)) ||
        !Number.isSafeInteger(body.pedidoId) || body.pedidoId < 1 ||
        !Number.isSafeInteger(body.version) || body.version < 1 ||
        !Object.hasOwn(SIGUIENTE, body.estadoActual) || SIGUIENTE[body.estadoActual] !== body.estado ||
        typeof body.clave !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.clave)) throw fail(400, 'ENTREGA_INVALIDA');
    for (const key of ['recepcion', 'observaciones']) {
        if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].trim().length > 500 || /[\x00-\x1f\x7f]/.test(body[key]))) throw fail(400, 'EVIDENCIA_INVALIDA');
    }
    if (body.estado === 'ENTREGADA' ? !body.recepcion?.trim() : body.recepcion !== undefined) throw fail(400, 'RECEPCION_INVALIDA');
    return { pedidoId: body.pedidoId, version: body.version, estadoActual: body.estadoActual,
        estado: body.estado, clave: body.clave.toLowerCase(), recepcion: body.recepcion?.trim() || null,
        observaciones: body.observaciones?.trim() || null };
}
function createService(repository) {
    return { async registrar(actorId, body) {
        if (!Number.isSafeInteger(actorId) || actorId < 1) throw fail(403, 'CUENTA_NO_VIGENTE');
        const input = validar(body);
        if (!repository) throw fail(503, 'ENTREGAS_PERSISTENCIA_PENDIENTE');
        const huella = createHash('sha256').update(JSON.stringify({ actorId, ...input })).digest('hex');
        return repository.transaction(async tx => {
            // Autorizar y bloquear ámbito antes de consultar pedido o clave.
            const scope = await tx.autorizarYBloquear(actorId, input.pedidoId);
            if (scope?.cuenta?.id !== actorId || scope.cuenta.rol_id !== 3 || scope.cuenta.estado !== 'ACTIVO' ||
                scope.titularidadVerificada !== true || !scope.estadosPermitidos?.includes(input.estado)) throw fail(403, 'ENTREGA_NO_AUTORIZADA');
            const previous = await tx.buscarClave(input.clave);
            if (previous) {
                if (previous.huella !== huella) throw fail(409, 'CLAVE_REUTILIZADA');
                return { evento: previous, repetido: true };
            }
            const pedido = await tx.bloquearPedido(input.pedidoId);
            if (!pedido || pedido.version !== input.version || pedido.estado !== input.estadoActual) throw fail(409, 'ENTREGA_CONFLICTO');
            // No hay contrato actual de validación clínica: true y null bloquean.
            if (!pedido.pagos?.some(p => p.estado === 'APROBADO' && p.simulacion === false) ||
                !pedido.detalles?.length || pedido.detalles.some(d => d.medicamento?.requiere_formula !== false)) throw fail(409, 'DISPENSACION_BLOQUEADA');
            if (await tx.actualizarEstado(input.pedidoId, input.version, input.estadoActual, input.estado) !== 1) throw fail(409, 'ENTREGA_CONFLICTO');
            // Actor y fecha del servidor. Auditoría y estado deben confirmar juntos.
            const evento = await tx.registrarEvento({ ...input, actorId, fecha: new Date(), huella });
            return { evento, repetido: false };
        });
    } };
}
module.exports = { validar, createService, ...createService() };
