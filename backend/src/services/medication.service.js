const medicationRepository = require('../repositories/medication.repository');

async function listar() {
    return medicationRepository.listar();
}

module.exports = { listar };
