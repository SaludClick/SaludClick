const medicationService = require('../services/medication.service');
async function listar(req, res) {
    res.set('Cache-Control', 'no-store');
    try { res.json({ ok: true, medicamentos: await medicationService.listar({ soloPublicados: true }) }); }
    catch (error) { res.status(500).json({ ok: false, mensaje: 'No se pudo cargar el catálogo.' }); }
}

async function publico(req, res) {
    res.set('Cache-Control', 'no-store');
    const { buscar = '', pagina = '1' } = req.query;
    if (typeof buscar !== 'string' || buscar.length > 150 || typeof pagina !== 'string' || !/^[1-9]\d{0,5}$/.test(pagina)) {
        return res.status(400).json({ ok: false, mensaje: 'La búsqueda o la página no es válida.' });
    }
    try { res.json({ ok: true, ...await medicationService.buscarPublicados(buscar.trim(), Number(pagina)) }); }
    catch { res.status(500).json({ ok: false, mensaje: 'No se pudo cargar el catálogo.' }); }
}
async function foto(req,res) {
    res.set('Cache-Control','no-store');
    try {
        const contenido=await medicationService.foto(req.params.archivo);
        if(!contenido)return res.sendStatus(404);
        res.type('image/webp').set('Content-Security-Policy',"default-src 'none'; sandbox").send(Buffer.from(contenido));
    } catch {
        res.sendStatus(503);
    }
}
module.exports = { listar, publico, foto };
