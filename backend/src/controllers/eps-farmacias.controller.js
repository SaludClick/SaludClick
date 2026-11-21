const { crearRepositorio } = require('../repositories/eps-farmacias.repository');

function entero(valor, maximo = 2147483647) {
    return typeof valor === 'string' && /^[1-9]\d{0,9}$/.test(valor) && Number(valor) <= maximo
        ? Number(valor) : null;
}

function crearControlador(repo = crearRepositorio()) {
    function responder(operacion) {
        return async (req, res) => {
            res.set('Cache-Control', 'no-store');
            const usuarioId = entero(String(req.usuario?.id));
            if (!usuarioId) return res.status(403).json({ ok: false, mensaje: 'Acceso EPS denegado.' });
            try {
                const resultado = await operacion(req, usuarioId);
                if (!resultado) {
                    return res.status(403).json({ ok: false, mensaje: 'La cuenta no tiene una vinculación EPS vigente.' });
                }
                if (resultado.status) {
                    return res.status(resultado.status).json({ ok: false, mensaje: resultado.mensaje });
                }
                return res.json({ ok: true, ...resultado });
            } catch {
                return res.status(503).json({ ok: false, mensaje: 'No fue posible consultar los convenios de tu EPS.' });
            }
        };
    }

    const listar = responder((req, usuarioId) => {
        const { buscar = '', pagina = '1', tamano = '25', ...otros } = req.query;
        const page = entero(pagina, 100000);
        const size = entero(tamano, 50);
        if (typeof buscar !== 'string' || buscar.length > 150 || /[\u0000-\u001f\u007f]/.test(buscar) ||
            !page || !size || Object.keys(otros).length) {
            return { status: 400, mensaje: 'La búsqueda o paginación no es válida.' };
        }
        return repo.listar(usuarioId, { buscar: buscar.trim(), pagina: page, tamano: size });
    });

    const detalle = responder(async (req, usuarioId) => {
        const id = entero(req.params.id);
        if (!id || Object.keys(req.query).length) return { status: 400, mensaje: 'El ID de farmacia no es válido.' };
        const resultado = await repo.detalle(usuarioId, id);
        if (resultado && !resultado.farmacia) return { status: 404, mensaje: 'Farmacia vinculada no encontrada.' };
        return resultado;
    });

    return { listar, detalle };
}

module.exports = { crearControlador, ...crearControlador() };
