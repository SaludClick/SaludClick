const { createRepository } = require('../repositories/farmacia-eps.repository');
const validator = require('../validators/farmacia-eps.validator');
function createService(repository = createRepository()) {
    return {
        eps(user, query) { validator.sinQuery(query); return repository.consultar(user.id); },
        usuarios(user, query) { return repository.consultar(user.id, validator.listado(query)); },
        administrar(actor, rawId, query) { validator.sinQuery(query); return repository.administrar(actor.id, validator.id(rawId)); },
        vincular(actor, rawId, query, body) { validator.sinQuery(query); return repository.vincular(actor.id, validator.id(rawId), validator.vinculacion(body)); }
    };
}
module.exports = { createService, ...createService() };
