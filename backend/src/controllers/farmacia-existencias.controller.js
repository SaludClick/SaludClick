const service = require('../services/farmacia-existencias.service');
function handle(operation) {
    return async (req, res) => {
        try { res.json({ ok: true, ...await operation(req) }); }
        catch (error) {
            const status = [400, 404].includes(error.status) ? error.status : 500;
            res.status(status).json({ ok: false, mensaje: status === 500 ? 'No se pudo consultar la información de existencias.' : error.message });
        }
    };
}
module.exports = { inventario: handle(req => service.listar(req.query)),
    medicamentos: handle(req => service.listar(req.query, true)),
    detalle: handle(req => service.detalle(req.params.id, req.query)) };
