const { id, sinQuery } = require('./farmacia-solicitudes.validator');
const invalid = () => Object.assign(new Error('Filtros de existencias no válidos.'), { status: 400 });
function positive(value, fallback, max) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > max) throw invalid();
    return Number(value);
}
function listado(query = {}) {
    if (Object.keys(query).some(key => !['buscar', 'disponibilidad', 'formula', 'pagina', 'tamano'].includes(key))) throw invalid();
    const pagina = positive(query.pagina, 1, 100000), take = positive(query.tamano, 25, 50);
    const buscar = query.buscar ?? '';
    if (typeof buscar !== 'string' || buscar.length > 150 || /[\u0000-\u001f\u007f]/.test(buscar)) throw invalid();
    const disponibilidad = query.disponibilidad ?? 'todas', formula = query.formula ?? 'todas';
    if (!['todas', 'disponibles', 'agotados', 'inactivos', 'inconsistentes', 'desconocidos'].includes(disponibilidad) ||
        !['todas', 'requiere', 'no-requiere', 'desconocido'].includes(formula)) throw invalid();
    return { pagina, take, skip: (pagina - 1) * take, buscar: buscar.trim(), disponibilidad, formula };
}
module.exports = { listado, id, sinQuery };
