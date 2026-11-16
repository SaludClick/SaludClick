// Preparación de dominio. No tiene adaptador persistente ni ruta de escritura.
// El adaptador futuro DEBE cumplir el contrato transaccional documentado.
const { createHash } = require('node:crypto');
const { movimiento } = require('../validators/farmacia-movimientos.validator');
const error = (status, codigo, message) => Object.assign(new Error(message), { status, codigo });
function createService(repository) {
    return {
        async registrar(actorId, body) {
            if (!Number.isInteger(actorId) || actorId < 1 || actorId > 2147483647) throw error(403, 'CUENTA_NO_VIGENTE', 'Cuenta no autorizada.');
            const input = movimiento(body);
            if (!repository) throw error(503, 'INVENTARIO_ESTRUCTURA_PENDIENTE', 'Movimientos bloqueados: faltan titularidad e historial persistentes.');
            const huella = createHash('sha256').update(JSON.stringify({ actorId, ...input })).digest('hex');
            return repository.transaction(async tx => {
                // Revalidar cuenta, titularidad y permiso dentro de la transacción.
                const scope = await tx.autorizar(actorId, input.inventarioId);
                if (scope?.cuenta?.id !== actorId || scope.cuenta.rol_id !== 3 || scope.cuenta.estado !== 'ACTIVO' || scope.titularidadVerificada !== true || !scope.tiposPermitidos?.includes(input.tipo)) {
                    throw error(403, 'INVENTARIO_NO_AUTORIZADO', 'No tienes autorización sobre este inventario y operación.');
                }
                // Serializar también claves repetidas que apunten a medicamentos distintos.
                await tx.bloquearInventario(input.inventarioId);
                const saldo = await tx.bloquearSaldo(input.inventarioId, input.medicamentoId);
                if (!saldo) throw error(404, 'EXISTENCIA_NO_ENCONTRADA', 'La existencia no pertenece al inventario autorizado.');
                const previous = await tx.buscarClave(input.inventarioId, input.clave);
                if (previous) {
                    if (previous.huella !== huella) throw error(409, 'CLAVE_REUTILIZADA', 'La clave ya corresponde a otro movimiento.');
                    return { movimiento: previous, repetido: true };
                }
                if (!Number.isInteger(saldo.stock) || saldo.stock < 0 || saldo.stock > 2147483647 || !Number.isInteger(saldo.version) || saldo.version < 1) throw error(409, 'SALDO_INCONSISTENTE', 'El saldo requiere revisión autorizada.');
                const delta = input.tipo === 'SALIDA' || input.direccion === 'DISMINUIR' ? -input.cantidad : input.cantidad;
                const final = saldo.stock + delta;
                if (final < 0 || final > 2147483647) throw error(409, 'SALDO_FUERA_RANGO', 'La operación excede el saldo o su rango permitido.');
                const changed = await tx.actualizarSaldo(input.inventarioId, input.medicamentoId, saldo.version, final);
                if (changed !== 1) throw error(409, 'INVENTARIO_CONFLICTO', 'El saldo cambió; vuelve a consultar.');
                const saved = await tx.registrarAuditoria({ ...input, actorId, fecha: new Date(),
                    saldoAnterior: saldo.stock, saldoFinal: final, delta, huella });
                return { movimiento: saved, repetido: false };
            });
        }
    };
}
module.exports = { createService, ...createService() };
