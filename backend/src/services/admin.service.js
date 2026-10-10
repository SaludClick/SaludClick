const adminRepository = require("../repositories/admin.repository");
const { validarEstadoPedido } = require("../validators/admin.validator");

async function listarPedidos() {
    return adminRepository.pedidos();
}

async function actualizarEstadoPedido(idEntrada, estadoEntrada) {
    const { id, estado } = validarEstadoPedido(idEntrada, estadoEntrada);
    return adminRepository.estadoPedido(id, estado);
}

module.exports = { listarPedidos, actualizarEstadoPedido };
