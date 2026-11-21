const { buscarEntidadVigente } = require('./eps-afiliados.repository');

const nombre = "nullif(concat_ws(' ', nullif(btrim(u.nombre), ''), nullif(btrim(u.apellido), '')), '')";
const convenios = `
    FROM eps_farmacias f
    JOIN usuarios u ON u.id = f.farmacia_id AND u.rol_id = 3
    WHERE f.eps_id = $1`;
const columnas = `u.id, ${nombre} AS nombre, f.activa, f.vinculada_at`;

async function resumenConvenios(client, epsId, completo = false) {
    const { rows: [conteo] } = await client.query(
        `SELECT count(*)::int AS total, count(*) FILTER(WHERE f.activa)::int AS activas ${convenios}`, [epsId]);
    const { rows: recientes } = await client.query(
        `SELECT ${columnas} ${convenios} ORDER BY f.activa DESC, nombre NULLS LAST, u.id ${completo ? '' : 'LIMIT 5'}`, [epsId]);
    return { ...conteo, recientes };
}

function crearRepositorio(db) {
    async function consultar(usuarioId, operacion) {
        const client = await (db || require('../config/database')).connect();
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const eps = await buscarEntidadVigente(usuarioId, client);
            if (!eps) return null;
            return { eps, ...await operacion(client, eps.id) };
        } finally {
            try {
                await client.query('ROLLBACK');
            } finally {
                client.release();
            }
        }
    }

    function listar(usuarioId, { buscar, pagina, tamano }) {
        return consultar(usuarioId, async (client, epsId) => {
            const filtro = `${convenios} AND ($2 = '' OR strpos(lower(${nombre}), lower($2)) > 0)`;
            const { rows: [{ total }] } = await client.query(`SELECT count(*)::int AS total ${filtro}`, [epsId, buscar]);
            const { rows: farmacias } = await client.query(
                `SELECT ${columnas} ${filtro} ORDER BY nombre NULLS LAST, u.id LIMIT $3 OFFSET $4`,
                [epsId, buscar, tamano, (pagina - 1) * tamano]);
            return { farmacias, paginacion: { pagina, tamano, total, paginas: Math.ceil(total / tamano) } };
        });
    }

    function detalle(usuarioId, farmaciaId) {
        return consultar(usuarioId, async (client, epsId) => {
            const { rows: [farmacia] } = await client.query(
                `SELECT ${columnas} ${convenios} AND u.id = $2`, [epsId, farmaciaId]);
            return { farmacia: farmacia ?? null };
        });
    }

    return { listar, detalle };
}

module.exports = { crearRepositorio, resumenConvenios };
