const { createHash } = require("node:crypto");
const { fail } = require("../validators/administrative.validator");

async function verificarSinMovimientosHistoricos(db, solicitudId) {
    const { rows } = await db.query(
        "SELECT 1 FROM farmacia_stock_eventos WHERE solicitud_id=$1 AND etapa IS NULL LIMIT 1",
        [solicitudId]
    );
    if (rows.length) fail("El pedido tiene movimientos históricos de inventario que requieren conciliación.", 409);
}

async function moverStock(db, { order, actorId, clave, accion, nuevas = {}, entrega = false }) {
    await verificarSinMovimientosHistoricos(db, order.solicitud_id);
    const previas = order.preparadas;
    const ids = [...new Set([...Object.keys(previas), ...Object.keys(nuevas)])].map(Number).sort((a, b) => a - b);
    if (entrega && !ids.length) fail("No existe una preparación para descontar.", 409);
    for (const medicamentoId of ids) {
        const anterior = previas[medicamentoId] || 0;
        const delta = (nuevas[medicamentoId] || 0) - anterior;
        if (!entrega && delta === 0) continue;
        const cantidad = entrega ? anterior : Math.abs(delta);
        const tipo = entrega ? "ENTREGA" : delta > 0 ? "RESERVA" : "LIBERACION";
        const ajusteReserva = entrega ? -cantidad : delta;
        const ajusteFisico = entrega ? -cantidad : 0;
        const changed = await db.query(
            `UPDATE farmacia_existencias SET reservado=reservado+$3, cantidad=cantidad+$4, updated_at=now()
             WHERE farmacia_id=$1 AND medicamento_id=$2 AND reservado+$3>=0
               AND cantidad+$4>=reservado+$3 RETURNING farmacia_id`,
            [order.farmacia_id, medicamentoId, ajusteReserva, ajusteFisico]
        );
        if (!changed.rows.length) {
            fail(delta > 0 ? "No hay existencias libres suficientes." : "No se pudo verificar la reserva de inventario.", 409);
        }
        const etapa = order.etapa_indice + 1;
        const visita = entrega ? order.visita_activa : null;
        const domiciliario = visita ? order.domiciliario_id : null;
        const huella = createHash("sha256").update(JSON.stringify({
            solicitud: order.solicitud_id, etapa, medicamentoId, cantidad,
            farmacia: order.farmacia_id, accion, visita, domiciliario
        })).digest("hex");
        await db.query(
            `INSERT INTO farmacia_stock_eventos
                (farmacia_id,medicamento_id,solicitud_id,actor_id,tipo,cantidad,clave,huella,referencia,etapa,visita_id,domiciliario_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [order.farmacia_id, medicamentoId, order.solicitud_id, actorId, tipo, cantidad, clave, huella,
                `Solicitud #${order.solicitud_id} · etapa ${etapa} · ${accion}`, etapa, visita, domiciliario]
        );
    }
}

module.exports = { moverStock, verificarSinMovimientosHistoricos };
