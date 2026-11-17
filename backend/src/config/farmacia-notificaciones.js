// Enable only after the reviewed migration has been applied by an authorized operator.
const habilitadas = () => process.env.FARMACIA_NOTIFICACIONES_ENABLED === 'true';
module.exports = { habilitadas };
