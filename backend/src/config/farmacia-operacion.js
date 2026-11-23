// La bandera no concede permisos: cada operación exige asignación/permisos persistentes.
const habilitada = () => process.env.FARMACIA_OPERACION_ENABLED === 'true';
const fallo = (status, codigo, mensaje = codigo) => Object.assign(new Error(mensaje), { status, codigo });
function disponible() {
    if (!habilitada()) throw fallo(503, 'FARMACIA_ACTIVACION_PENDIENTE', 'La operación requiere activar el esquema revisado y sus autorizaciones. No se muestran datos globales.');
}
module.exports = { habilitada, disponible, fallo };
