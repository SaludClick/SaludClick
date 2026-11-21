const { crearRepositorio } = require('../repositories/eps-notificaciones.repository');
const repo = crearRepositorio();

function entero(valor, maximo = 2147483647) {
    return typeof valor === 'string' && /^[1-9]\d{0,9}$/.test(valor) && Number(valor) <= maximo
        ? Number(valor) : null;
}

function responder(accion) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const usuarioId = entero(String(req.usuario?.id));
        if (!usuarioId) return res.status(403).json({ ok: false, mensaje: 'Acceso EPS denegado.' });
        try {
            const resultado = await accion(req, usuarioId);
            if (resultado?.invalida) return res.status(400).json({ ok: false, mensaje: 'Parámetros de notificaciones no válidos.' });
            if (!resultado) return res.status(403).json({ ok: false, mensaje: 'La cuenta no tiene una vinculación EPS vigente.' });
            if (resultado.encontrada === false) return res.status(404).json({ ok: false, mensaje: 'Notificación no encontrada.' });
            return res.json({ ok: true, ...resultado });
        } catch {
            return res.status(503).json({ ok: false, mensaje: 'No fue posible consultar o actualizar las notificaciones.' });
        }
    };
}

const invalida = { invalida: true };
function sinParametros(req) {
    return !Object.keys(req.query).length && !Object.keys(req.body ?? {}).length;
}

const listar = responder((req, id) => {
    const { estado = 'todas', pagina = '1', tamano = '25', ...otros } = req.query;
    const page = entero(pagina, 100000);
    const size = entero(tamano, 50);
    if (!page || !size || !['todas', 'leidas', 'no_leidas'].includes(estado) || Object.keys(otros).length) return invalida;
    return repo.listar(id, { estado, pagina: page, tamano: size });
});

module.exports = {
    listar,
    contar: responder((req, id) => sinParametros(req) ? repo.contar(id) : invalida),
    leerTodas: responder((req, id) => sinParametros(req) ? repo.leer(id) : invalida),
    leer: responder((req, id) => {
        const aviso = entero(req.params.id);
        return aviso && sinParametros(req) ? repo.leer(id, aviso) : invalida;
    })
};
