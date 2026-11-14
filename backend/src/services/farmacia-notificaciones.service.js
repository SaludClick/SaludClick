const repository = require('../repositories/farmacia-notificaciones.repository');
const validator = require('../validators/farmacia-notificaciones.validator');
const { habilitadas } = require('../config/farmacia-notificaciones');

function createService(repo = repository, enabled = habilitadas) {
    function available() {
        if (!enabled()) throw Object.assign(new Error('Las notificaciones de Farmacia aún no están disponibles.'), { status: 503, codigo: 'FARMACIA_NOTIFICACIONES_NO_DISPONIBLES' });
    }
    return {
        async listar(user, query) {
            const options = validator.listar(query); available();
            const { notificaciones, total, noLeidas } = await repo.listar(user.id, options);
            return { notificaciones, noLeidas, paginacion: { pagina: options.pagina, tamano: options.take, total, paginas: Math.ceil(total / options.take) } };
        },
        async contar(user, query) {
            validator.sinParametros(query); available();
            return { noLeidas: await repo.contar(user.id) };
        },
        async leer(user, rawId, query, body) {
            const id = validator.id(rawId); validator.sinParametros(query, body); available();
            const notificacion = await repo.leer(user.id, id);
            if (!notificacion) throw Object.assign(new Error('Notificación no encontrada.'), { status: 404 });
            return { notificacion };
        },
        async leerTodas(user, query, body) {
            validator.sinParametros(query, body); available();
            return { actualizadas: await repo.leerTodas(user.id) };
        }
    };
}
module.exports = { createService, ...createService() };
