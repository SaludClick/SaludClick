const { ESTADOS_OPERATIVOS, SIGUIENTE } = require('../config/farmacia-solicitudes');
const invalid = mensaje => Object.assign(new Error(mensaje), { status: 400 });
function entero(value, max, mensaje) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > max) throw invalid(mensaje);
    return Number(value);
}
const id = value => entero(value, 2147483647, 'Identificador de solicitud no válido.');
function listado(query = {}) {
    if (Object.keys(query).some(key => !['pagina', 'tamano', 'estado', 'id'].includes(key))) throw invalid('Filtro de solicitudes no permitido.');
    const pagina = entero(query.pagina ?? '1', 100000, 'Página no válida.');
    const take = entero(query.tamano ?? '25', 50, 'Tamaño de página no válido (máximo 50).');
    const estado = query.estado ?? '';
    if (typeof estado !== 'string' || (estado !== '' && estado !== 'todas' && !ESTADOS_OPERATIVOS.includes(estado))) throw invalid('Estado de solicitud no permitido.');
    return { pagina, take, skip: (pagina - 1) * take, estado, id: query.id === undefined || query.id === '' ? undefined : id(query.id) };
}
function transicion(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['estadoActual', 'estado'].includes(key)) ||
        !Object.hasOwn(SIGUIENTE, body.estadoActual) || SIGUIENTE[body.estadoActual] !== body.estado) {
        throw invalid('Solo se permiten avances consecutivos: aprobado, preparando, listo y entregado.');
    }
    return body;
}
function sinQuery(query = {}) { if (Object.keys(query).length) throw invalid('Esta operación no admite filtros.'); }
module.exports = { id, listado, transicion, sinQuery };
