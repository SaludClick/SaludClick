const { fallo, habilitada } = require('./farmacia-operacion');

function disponible() {
    if (!habilitada() && process.env.FARMACIA_CATALOGO_ENABLED !== 'true') {
        throw fallo(503, 'FARMACIA_CATALOGO_PENDIENTE', 'La gestión de medicamentos está pendiente de activación.');
    }
}

module.exports = { disponible };
