const operacion = require('./farmacia-operacion');
const ESTADOS_OPERATIVOS = Object.freeze(['APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA']);
const SIGUIENTE = Object.freeze({ APROBADA: 'PREPARANDO', PREPARANDO: 'LISTA', LISTA: 'ENTREGADA' });
const habilitadas = () => operacion.habilitada() || process.env.FARMACIA_SOLICITUDES_ENABLED === 'true';
function disponibles() {
    if (!habilitadas()) throw operacion.fallo(503, 'FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE',
        'La consulta y gestión de solicitudes están pendientes de activar la verificación de asignaciones por farmacia.');
}
module.exports = { ESTADOS_OPERATIVOS, SIGUIENTE, habilitadas, disponibles };
