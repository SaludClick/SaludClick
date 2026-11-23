const { UMBRAL_BAJO } = require('../config/farmacia-inventario');
const repository = require('../repositories/farmacia-existencias.repository');
const validator = require('../validators/farmacia-existencias.validator');
function presentar(medicamento,catalogo=false) {
    const { stock, estado, requiere_formula } = medicamento;
    let disponibilidad;
    if (stock < 0 || (estado === 'AGOTADO' && stock > 0)) disponibilidad = 'INCONSISTENTE';
    else if (estado === 'INACTIVO') disponibilidad = 'INACTIVO';
    else if (estado === null) disponibilidad = 'DESCONOCIDA';
    else disponibilidad = stock === 0 ? 'AGOTADO' : 'DISPONIBLE';
    return { ...medicamento, disponibilidad, stockBajo: disponibilidad === 'DISPONIBLE' && stock <= (catalogo?medicamento.stock_minimo??0:UMBRAL_BAJO),
        requisitoFormula: requiere_formula === true ? 'REQUIERE' : requiere_formula === false ? 'NO_REQUIERE' : 'DESCONOCIDO' };
}
async function listar(query, catalogo = false) {
    const options = validator.listado(query);
    const { medicamentos, total, resumen } = await repository.listar(options, catalogo);
    return { medicamentos: medicamentos.map(med=>presentar(med,catalogo)), resumen,
        alcance: { tipo: 'CATALOGO_GLOBAL', titularidadVerificada: false, movimientosHabilitados: false, umbralOrientativo: UMBRAL_BAJO },
        paginacion: { pagina: options.pagina, tamano: options.take, total, paginas: Math.ceil(total / options.take) } };
}
async function detalle(rawId, query = {}, catalogo = false) {
    const id = validator.id(rawId); validator.sinQuery(query);
    const medicamento = await repository.detalle(id,catalogo);
    if (!medicamento) throw Object.assign(new Error('Medicamento no encontrado.'), { status: 404 });
    return { medicamento: presentar(medicamento,catalogo) };
}
module.exports = { listar, detalle, presentar };
