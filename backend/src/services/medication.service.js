const medicationRepository = require('../repositories/medication.repository');

async function listar(options) {
    return medicationRepository.listar(options);
}

module.exports = { listar, buscarPublicados: (...args) => medicationRepository.buscarPublicados(...args),
    foto: archivo => medicationRepository.foto(archivo) };
