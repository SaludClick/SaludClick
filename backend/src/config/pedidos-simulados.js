function habilitados() {
    return process.env.PEDIDOS_SIMULADOS === 'true';
}

module.exports = { habilitados };
