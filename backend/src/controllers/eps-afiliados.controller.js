const { buscarEntidadVigente } = require('../repositories/eps-afiliados.repository');
const { leerAutorizados } = require('../repositories/afiliados-origen.repository');

const caracteresInvalidos = /[\u0000-\u001f\u007f]/;

function entero(valor, defecto, maximo) {
    if (valor === undefined) return defecto;
    if (typeof valor !== 'string' || !/^[1-9]\d{0,5}$/.test(valor) || Number(valor) > maximo) {
        return null;
    }
    return Number(valor);
}

function crearControlador({ buscarEntidad = buscarEntidadVigente, leer = leerAutorizados } = {}) {
    function conEntidad(accion) {
        return async (req, res) => {
            res.set('Cache-Control', 'no-store');
            const usuarioId = Number(req.usuario?.id);
            try {
                const idValido = Number.isInteger(usuarioId) && usuarioId > 0 && usuarioId <= 2147483647;
                const eps = idValido && await buscarEntidad(usuarioId);
                if (!eps) return res.status(403).json({ ok: false, mensaje: 'La cuenta no tiene una vinculación EPS vigente.' });
                return await accion(req, res, eps);
            } catch {
                return res.status(503).json({ ok: false, mensaje: 'No fue posible consultar la fuente original de afiliados.' });
            }
        };
    }

    const listar = conEntidad(async (req, res, eps) => {
        const { buscar = '', pagina, tamano, ...otros } = req.query;
        const page = entero(pagina, 1, 100000);
        const take = entero(tamano, 25, 50);
        if (Object.keys(otros).length || typeof buscar !== 'string' || buscar.length > 150 ||
            caracteresInvalidos.test(buscar) || !page || !take) {
            return res.status(400).json({ ok: false, mensaje: 'Los parámetros de búsqueda o paginación no son válidos.' });
        }
        const { pacientes, total, totalActivos } = await leer(String(eps.id), { buscar: buscar.trim(), pagina: page, take });
        return res.json({
            ok: true, eps, totalActivos,
            afiliados: pacientes.map(paciente => representar(paciente, eps)),
            paginacion: { pagina: page, tamano: take, total, paginas: Math.ceil(total / take) }
        });
    });

    const detalle = conEntidad(async (req, res, eps) => {
        const { id } = req.params;
        if (!id || id.length > 256 || caracteresInvalidos.test(id) || Object.keys(req.query).length) {
            return res.status(400).json({ ok: false, mensaje: 'El identificador o los parámetros no son válidos.' });
        }
        const { pacientes } = await leer(String(eps.id), { identificador: id, take: 1 });
        if (!pacientes.length) return res.status(404).json({ ok: false, mensaje: 'Afiliado no encontrado.' });
        return res.json({ ok: true, afiliado: representar(pacientes[0], eps) });
    });

    return { listar, detalle };
}

function representar({ identificador, nombres, apellidos, documento, tipo_documento, correo, estado }, eps) {
    return { id: identificador, nombres, apellidos, documento, tipo_documento, correo, estado, eps_id: String(eps.id) };
}

module.exports = { crearControlador, ...crearControlador() };
