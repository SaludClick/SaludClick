const repository = require('../repositories/farmacia-notificaciones.repository');
const validator = require('../validators/farmacia-notificaciones.validator');
const { habilitadas } = require('../config/farmacia-notificaciones');

const solicitudId = ref => Number(/^solicitud:([1-9]\d*):/.exec(ref)?.[1]);
const referenciaStock = ref => {
    const match = /^stock:(catalogo|inventario):([1-9]\d*):[1-9]\d*$/.exec(ref);
    return match && { origen: match[1], id: Number(match[2]) };
};
const idValido = id => Number.isInteger(id) && id > 0 && id <= 2147483647;
const disponibles = async get => {
    try { return await get(); }
    catch (error) {
        if ([403,404,503].includes(error.status)) return [];
        throw error;
    }
};

async function contextoSolicitudes(user, rows) {
    if (!require('../config/farmacia-solicitudes').habilitadas()) return [];
    const ids = [...new Set(rows.map(n => solicitudId(n.referencia_evento)).filter(idValido))];
    if (!ids.length) return [];
    const repo = require('../repositories/farmacia-operacion.repository').createRepository();
    return disponibles(() => repo.contextoNotificaciones(user.id, ids));
}

async function contextoMedicamentos(user, rows) {
    const refs = rows.map(n => referenciaStock(n.referencia_evento)).filter(ref => ref && idValido(ref.id));
    const catalogo = new Set(), inventario = new Set();
    if (refs.some(ref => ref.origen === 'catalogo')) {
        const repo = require('../repositories/farmacia-catalogo.repository').createCatalogoRepository();
        const { ambitos } = await repo.permisos(user.id);
        for (const scope of ambitos) catalogo.add(scope.medicamento_id);
    }
    if (require('../config/farmacia-stock').habilitado() && refs.some(ref => ref.origen === 'inventario')) {
        const ids = [...new Set(refs.filter(ref => ref.origen === 'inventario').map(ref => ref.id))];
        const repo = require('../repositories/farmacia-operacion.repository').createRepository();
        const autorizados = await disponibles(() => repo.scoped(user.id,false,async c => (await c.query(
            'SELECT medicamento_id FROM farmacia_existencias WHERE farmacia_id=$1 AND medicamento_id=ANY($2::int[])',
            [user.id, ids])).rows));
        for (const row of autorizados) inventario.add(row.medicamento_id);
    }
    return { catalogo, inventario };
}

function createService(repo = repository, enabled = habilitadas, contexto = contextoSolicitudes) {
    function available() {
        if (!enabled()) throw Object.assign(new Error('Las notificaciones de Farmacia aún no están disponibles.'), { status: 503, codigo: 'FARMACIA_NOTIFICACIONES_NO_DISPONIBLES' });
    }
    return {
        async listar(user, query) {
            const options = validator.listar(query); available();
            const { notificaciones, total, noLeidas } = await repo.listar(user.id, options);
            const [autorizadas, medicamentos] = await Promise.all([
                contexto(user,notificaciones), contextoMedicamentos(user,notificaciones)
            ]);
            const enriched = notificaciones.map(n => {
                const solicitud = autorizadas.find(s => s.id === solicitudId(n.referencia_evento)) || null;
                const stock = referenciaStock(n.referencia_evento);
                const medicamento = stock && medicamentos[stock.origen].has(stock.id) ? stock : null;
                return { ...n, solicitud, medicamento };
            });
            return { notificaciones:enriched, noLeidas, paginacion: { pagina: options.pagina, tamano: options.take, total, paginas: Math.ceil(total / options.take) } };
        },
        async contar(user, query) {
            validator.sinParametros(query); available();
            return { noLeidas: await repo.contar(user.id) };
        },
        async leer(user, rawId, query, body) {
            const id = validator.id(rawId); validator.sinParametros(query, body); available();
            const notificacion = await repo.leer(user.id, id);
            if (!notificacion) throw Object.assign(new Error('Notificación no encontrada.'), { status: 404 });
            return { notificacion };
        },
        async leerTodas(user, query, body) {
            validator.sinParametros(query, body); available();
            return { actualizadas: await repo.leerTodas(user.id) };
        }
    };
}
module.exports = { createService, ...createService() };
