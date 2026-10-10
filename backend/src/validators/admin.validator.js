const ESTADOS_PEDIDO = new Set([
    "PENDIENTE",
    "APROBADA",
    "PREPARANDO",
    "LISTA",
    "ENTREGADA",
    "CANCELADA"
]);

function validarEstadoPedido(idEntrada, estadoEntrada) {
    const id = Number(idEntrada);
    const estado = String(estadoEntrada || "");

    if (!Number.isInteger(id) || !ESTADOS_PEDIDO.has(estado)) {
        throw new Error("Datos inválidos.");
    }

    return { id, estado };
}

module.exports = { ESTADOS_PEDIDO, validarEstadoPedido };
