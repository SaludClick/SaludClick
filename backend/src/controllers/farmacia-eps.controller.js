const service = require('../services/farmacia-eps.service');
function handle(action) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { res.json({ ok: true, ...await action(req) }); }
        catch (error) {
            const schema = ['42P01','42703'].includes(error.code);
            const conflict = ['23505','40001','40P01'].includes(error.code);
            const status = schema ? 503 : conflict ? 409 : [400,403,404,409,503].includes(error.status) ? error.status : 503;
            res.status(status).json({ ok: false,
                codigo: schema ? 'FARMACIA_EPS_SCHEMA_PENDING' : conflict ? 'FARMACIA_EPS_CONFLICTO' : error.codigo || 'FARMACIA_EPS_NO_DISPONIBLE',
                mensaje: schema ? 'La integración EPS requiere completar el esquema autorizado.' : conflict ? 'Otra operación cambió la vinculación. Actualiza antes de continuar.' : error.codigo ? error.message : 'No se pudo consultar la vinculación o sus pacientes. Inténtalo nuevamente.' });
        }
    };
}
module.exports = {
    eps: handle(req => service.eps(req.farmacia, req.query)),
    usuarios: handle(req => service.usuarios(req.farmacia, req.query)),
    administrar: handle(req => service.administrar(req.usuario, req.params.id, req.query)),
    vincular: handle(req => service.vincular(req.usuario, req.params.id, req.query, req.body))
};
