const invalid = mensaje => Object.assign(new Error(mensaje), { status: 400, codigo: 'FARMACIA_EPS_DATOS_INVALIDOS' });
function sinQuery(query = {}) { if (Object.keys(query).length) throw invalid('Esta operación no admite seleccionar una EPS desde el navegador.'); }
function id(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) throw invalid('Identificador de Farmacia no válido.');
    return Number(value);
}
function listado(query = {}) {
    if (Object.keys(query).some(key => !['buscar', 'pagina', 'tamano','inicial','tipo_documento'].includes(key))) throw invalid('Solo se permite buscar y paginar dentro de tu EPS vinculada.');
    const entero = (raw, fallback, max) => {
        if (raw === undefined) return fallback;
        if (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw) || Number(raw) > max) throw invalid('Paginación no válida.');
        return Number(raw);
    };
    const buscar = query.buscar ?? '';
    if (typeof buscar !== 'string' || buscar.length > 150 || /[\u0000-\u001f\u007f]/.test(buscar)) throw invalid('La búsqueda debe tener como máximo 150 caracteres válidos.');
    const pagina = entero(query.pagina, 1, 100000), take = entero(query.tamano, 25, 50);
    const inicial=query.inicial??'';if(typeof inicial!=='string'||(inicial&&!/^[A-Za-zÁÉÍÓÚÑáéíóúñ]$/.test(inicial)))throw invalid('Inicial de apellido no válida.');
    const tipo_documento=query.tipo_documento??'';
    if(typeof tipo_documento!=='string'||(tipo_documento&&!/^[A-Za-z]{1,10}$/.test(tipo_documento)))throw invalid('Tipo de documento no válido.');
    return { buscar: buscar.trim(),inicial,tipo_documento:tipo_documento.toUpperCase(), pagina, take, skip: (pagina - 1) * take };
}
function vinculacion(body) {
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !['epsId', 'vinculoActual'].includes(key)) || !Object.hasOwn(body, 'vinculoActual')) throw invalid('Indica la EPS y el vínculo actual consultado antes de guardar.');
    if (typeof body.epsId !== 'string' || !body.epsId.trim() || body.epsId.length > 80 || /[\u0000-\u001f\u007f]/.test(body.epsId)) throw invalid('Identificador de EPS no válido.');
    const actual = body.vinculoActual;
    if (actual !== null && (!actual || typeof actual !== 'object' || Array.isArray(actual) || Object.keys(actual).length !== 2 || !Number.isInteger(actual.id) || actual.id < 1 || actual.id > 2147483647 || !Number.isInteger(actual.version) || actual.version < 1 || actual.version > 2147483647)) throw invalid('La versión del vínculo actual no es válida.');
    return { epsId: body.epsId.trim(), vinculoActual: actual };
}
module.exports = { id, sinQuery, listado, vinculacion };
