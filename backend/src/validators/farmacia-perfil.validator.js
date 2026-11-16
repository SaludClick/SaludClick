const invalid = mensaje => Object.assign(new Error(mensaje), { status: 400 });
const campos = new Set(['nombre', 'apellido', 'telefono', 'tipoDocumento', 'numeroDocumento', 'cedula', 'ciudad']);
const controles = /[\u0000-\u001f\u007f]/;
function validarPerfilFarmacia(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !campos.has(key))) {
        throw invalid('El perfil contiene campos no permitidos.');
    }
    const datos = {};
    for (const key of campos) {
        if (!Object.hasOwn(body, key)) continue;
        if (typeof body[key] !== 'string' || controles.test(body[key])) throw invalid('Los campos del perfil deben contener texto válido.');
        datos[key] = body[key].trim();
    }
    for (const key of ['nombre', 'apellido']) {
        if (!datos[key] || datos[key].length > 100 || !/^[\p{L}\p{M}]+(?:[ '\u2019.-][\p{L}\p{M}]+)*$/u.test(datos[key])) {
            throw invalid('Nombre y apellido deben contener letras y tener entre 1 y 100 caracteres.');
        }
    }
    if (datos.telefono && (datos.telefono.length > 20 || !/^\+?[0-9 ()-]+$/.test(datos.telefono) || !/^[0-9]{7,15}$/.test(datos.telefono.replace(/\D/g, '')))) {
        throw invalid('El teléfono debe contener entre 7 y 15 dígitos y como máximo 20 caracteres.');
    }
    if (datos.tipoDocumento && !/^[\p{L}\p{N} .-]{1,10}$/u.test(datos.tipoDocumento)) throw invalid('El tipo de documento debe tener como máximo 10 caracteres válidos.');
    for (const key of ['numeroDocumento', 'cedula']) {
        if (datos[key] && !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,29}$/.test(datos[key])) throw invalid('El documento debe tener como máximo 30 caracteres alfanuméricos, puntos o guiones.');
    }
    if (datos.numeroDocumento !== undefined && datos.cedula !== undefined && datos.numeroDocumento !== datos.cedula) throw invalid('Los números de documento no coinciden.');
    if (datos.ciudad?.length > 100) throw invalid('La ciudad debe tener como máximo 100 caracteres.');
    return datos;
}
function validarPerfilFarmaciaSiCorresponde(req, res, next) {
    if (!req.farmacia) return next();
    try { req.body = validarPerfilFarmacia(req.body); next(); }
    catch (error) { res.status(400).json({ ok: false, mensaje: error.message }); }
}
module.exports = { validarPerfilFarmacia, validarPerfilFarmaciaSiCorresponde };
