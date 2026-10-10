const repo = require('../repositories/medication.repository');
async function listar(req, res) {
    try { res.json({ ok: true, medicamentos: await repo.listar() }); }
    catch (error) { res.status(500).json({ ok: false, mensaje: 'No se pudo cargar el catálogo.' }); }
}
module.exports = { listar };
