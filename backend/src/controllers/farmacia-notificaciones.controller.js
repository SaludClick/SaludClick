const service = require('../services/farmacia-notificaciones.service');
function handle(operation, changed = false) {
    return async (req, res) => {
        try {
            const result = await operation(req);
            // The database already committed; a transport failure cannot undo a read.
            if (changed) Promise.resolve().then(() => req.app.get('farmaciaNotificationEvents')?.([req.farmacia.id])).catch(() => {});
            res.json({ ok: true, ...result });
        } catch (error) {
            const schema = ['P2021', 'P2022', '42P01', '42703'].includes(error.code);
            const status = schema ? 503 : [400, 404, 503].includes(error.status) ? error.status : 500;
            res.status(status).json({ ok: false,
                codigo: status === 503 ? 'FARMACIA_NOTIFICACIONES_NO_DISPONIBLES' : undefined,
                mensaje: status === 503 ? 'Las notificaciones de Farmacia aún no están disponibles.' : status === 500 ? 'No se pudo completar la operación de notificaciones.' : error.message
            });
        }
    };
}
module.exports = {
    listar: handle(req => service.listar(req.farmacia, req.query)),
    contar: handle(req => service.contar(req.farmacia, req.query)),
    leer: handle(req => service.leer(req.farmacia, req.params.id, req.query, req.body), true),
    leerTodas: handle(req => service.leerTodas(req.farmacia, req.query, req.body), true)
};
