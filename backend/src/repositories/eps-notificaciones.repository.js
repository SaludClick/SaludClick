const { buscarEntidadVigente } = require('./eps-afiliados.repository');

const avisos = {
    ACTIVACION: ['Activación de la cuenta', 'Se registró la activación de tu cuenta EPS.'],
    PERFIL: ['Perfil actualizado', 'Se registró un cambio en tu perfil.', '#perfil'],
    SOLICITUD: ['Solicitud actualizada', 'Consulta las solicitudes autorizadas de tu EPS.', '#solicitudes'],
    SOLICITUD_NUEVA: ['Nueva solicitud', 'Una nueva solicitud de medicamentos corresponde a tu EPS.', '#solicitudes'],
    SOLICITUD_ESTADO: ['Estado de solicitud actualizado', 'Cambió el estado de una solicitud de tu EPS.', '#solicitudes'],
    FARMACIA: ['Convenio actualizado', 'Consulta los convenios de tu EPS.', '#farmacias'],
    FARMACIA_VINCULADA: ['Farmacia vinculada', 'Se activó un convenio de farmacia para tu EPS.', '#farmacias'],
    FARMACIA_DESVINCULADA: ['Farmacia desvinculada', 'Se desactivó un convenio de farmacia de tu EPS.', '#farmacias']
};
const tabla = 'eps_notificaciones_compartidas';
const ambito = 'usuario_id=$1 AND eps_id=$2 AND rol_destinatario=4 AND tipo=ANY($3::text[])';

function crearRepositorio(db) {
    async function consultar(usuarioId, escritura, operacion) {
        const client = await (db || require('../config/database')).connect();
        try {
            await client.query(escritura ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const eps = await buscarEntidadVigente(usuarioId, client);
            const resultado = eps && await operacion(client, [usuarioId, eps.id, Object.keys(avisos)]);
            await client.query('COMMIT');
            return resultado;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async function noLeidas(client, params) {
        const { rows: [fila] } = await client.query(
            `SELECT count(*)::int AS cifra FROM ${tabla} WHERE ${ambito} AND leida_at IS NULL`, params);
        return fila.cifra;
    }

    function listar(usuarioId, { estado, pagina, tamano }) {
        return consultar(usuarioId, false, async (client, params) => {
            const filtro = `AND ($4 = 'todas' OR ($4 = 'leidas') = (leida_at IS NOT NULL))`;
            const { rows: [{ total }] } = await client.query(
                `SELECT count(*)::int AS total FROM ${tabla} WHERE ${ambito} ${filtro}`, [...params, estado]);
            const { rows } = await client.query(`
                SELECT id,tipo,created_at AS fecha,leida_at FROM ${tabla} WHERE ${ambito} ${filtro}
                ORDER BY id DESC LIMIT $5 OFFSET $6`, [...params, estado, tamano, (pagina - 1) * tamano]);
            const notificaciones = rows.map(fila => {
                const [titulo, mensaje, enlace] = avisos[fila.tipo];
                return { ...fila, titulo, mensaje, enlace: enlace ?? null };
            });
            return { notificaciones, noLeidas: await noLeidas(client, params),
                paginacion: { pagina, tamano, total, paginas: Math.ceil(total / tamano) } };
        });
    }

    function leer(usuarioId, id) {
        return consultar(usuarioId, true, async (client, params) => {
            const criterio = id === undefined ? '' : 'AND id=$4';
            const valores = id === undefined ? params : [...params, id];
            if (id !== undefined) {
                const { rows } = await client.query(`SELECT id FROM ${tabla} WHERE ${ambito} ${criterio}`, valores);
                if (!rows.length) return { encontrada: false };
            }
            // Escribir primero el recibo legado, igual que EPS v1. Su trigger
            // actualiza la proyecci?n compartida en la misma transacci?n.
            await client.query(`
                INSERT INTO eps_lecturas(evento_id, usuario_id, leida_at)
                SELECT e.id, n.usuario_id, COALESCE(n.leida_at, now())
                FROM ${tabla} n
                JOIN eps_eventos e ON e.eps_id=n.eps_id AND n.clave='EPS_EVENTO:'||e.id::text
                WHERE n.usuario_id=$1 AND n.eps_id=$2 AND n.rol_destinatario=4
                  AND n.tipo=ANY($3::text[]) ${id === undefined ? '' : 'AND n.id=$4'}
                ORDER BY e.id
                ON CONFLICT(evento_id, usuario_id) DO NOTHING`, valores);
            await client.query(`UPDATE ${tabla} SET leida_at=now() WHERE ${ambito} ${criterio} AND leida_at IS NULL`, valores);
            return { noLeidas: await noLeidas(client, params) };
        });
    }

    return { listar, leer, contar: id => consultar(id, false, async (client, params) => ({ noLeidas: await noLeidas(client, params) })) };
}

module.exports = { crearRepositorio };
