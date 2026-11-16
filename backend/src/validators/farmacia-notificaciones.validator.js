const invalid = () => Object.assign(new Error('Parámetros de notificaciones no válidos.'), { status: 400 });
function positive(value, fallback, max) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > max) throw invalid();
    return Number(value);
}
function listar(query = {}) {
    if (Object.keys(query).some(key => !['pagina', 'tamano', 'estado'].includes(key))) throw invalid();
    const pagina = positive(query.pagina, 1, 100000);
    const take = positive(query.tamano, 20, 50);
    const estado = query.estado ?? 'todas';
    if (!['todas', 'no-leidas', 'leidas'].includes(estado)) throw invalid();
    return { pagina, take, skip: (pagina - 1) * take, estado };
}
const id = value => positive(value, undefined, 2147483647);
function sinParametros(query = {}, body) {
    if (Object.keys(query).length || (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length))) throw invalid();
}
module.exports = { listar, id, sinParametros };
