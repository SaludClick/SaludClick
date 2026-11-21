const { crearRepositorio } = require('../repositories/eps-solicitudes.repository');
const { clave } = require('../services/farmacia-identidad.rules');

const estados = new Set(['PENDIENTE', 'APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA', 'CANCELADA']);

function fechaValida(valor) {
    if (valor === undefined) return true;
    if (typeof valor !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(valor)) return false;
    const fecha = new Date(valor + 'T00:00:00Z');
    return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function entero(valor, maximo = 2147483647) {
    return typeof valor === 'string' && /^[1-9]\d{0,9}$/.test(valor) && Number(valor) <= maximo
        ? Number(valor) : null;
}

function filtros({ pagina = '1', tamano = '25', numero, estado = '', ...otros }) {
    const page = entero(pagina, 100000);
    const size = entero(tamano, 50);
    const id = numero === undefined ? null : entero(numero);
    if (!page || !size || (numero !== undefined && !id) || (estado !== '' && !estados.has(estado)) ||
        Object.keys(otros).length) return null;
    return { pagina: page, tamano: size, numero: id, estado };
}

function crearControlador(repo = crearRepositorio()) {
    function responder(accion) {
        return async (req, res) => {
            res.set('Cache-Control', 'no-store');
            const id = entero(String(req.usuario?.id));
            if (!id) return res.status(403).json({ ok: false, mensaje: 'Acceso EPS denegado.' });
            try {
                const resultado = await accion(req, id);
                if (resultado === null) {
                    return res.status(403).json({ ok: false, mensaje: 'La cuenta no tiene una vinculación EPS vigente.' });
                }
                if (resultado.status) {
                    return res.status(resultado.status).json({ ok: false, mensaje: resultado.mensaje });
                }
                return res.json({ ok: true, ...resultado });
            } catch {
                return res.status(503).json({ ok: false, mensaje: 'No fue posible verificar las solicitudes de tu EPS.' });
            }
        };
    }

    const listar = responder((req, id) => {
        const opciones = filtros(req.query);
        if (!opciones) return { status: 400, mensaje: 'Los filtros o la paginación no son válidos.' };
        return repo.listar(id, opciones);
    });

    const buscarDocumento = responder((req, id) => {
        const { tipo_documento, documento, ...campos } = req.body || {};
        const opciones = filtros(campos);
        const identidad = clave(tipo_documento, documento);
        if (Object.keys(req.query).length || !opciones || !identidad) {
            return { status: 400, mensaje: 'El tipo, documento o filtros de búsqueda no son válidos.' };
        }
        return repo.listar(id, { ...opciones, documento: identidad });
    });

    const detalle = responder(async (req, id) => {
        const numero = entero(req.params.id);
        if (!numero || Object.keys(req.query).length) return { status: 400, mensaje: 'Número de solicitud no válido.' };
        const resultado = await repo.detalle(id, numero);
        if (resultado && !resultado.solicitud) return { status: 404, mensaje: 'Solicitud no encontrada.' };
        return resultado;
    });

    const resumen = responder((req, id) => Object.keys(req.query).length
        ? { status: 400, mensaje: 'El resumen no admite parámetros.' }
        : repo.resumen(id));

    const reportes = responder((req, id) => {
        const { desde, hasta, ...otros } = req.query;
        if (Object.keys(otros).length || !fechaValida(desde) || !fechaValida(hasta) || (desde && hasta && desde > hasta)) {
            return { status: 400, mensaje: 'El período del reporte no es válido.' };
        }
        return repo.resumen(id, { desde, hasta });
    });

    return { listar, buscarDocumento, detalle, resumen, reportes };
}

module.exports = { crearControlador, ...crearControlador() };
