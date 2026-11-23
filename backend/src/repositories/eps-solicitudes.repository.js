const { buscarEntidadVigente } = require('./eps-afiliados.repository');
const { leerAutorizados } = require('./afiliados-origen.repository');
const { clave, autorizados } = require('../services/farmacia-identidad.rules');
const { resumenConvenios } = require('./eps-farmacias.repository');

const MAX_AFILIADOS = 50000;
const pedidosAcreditados = `
    FROM solicitudes s
    JOIN afiliado_cuentas_origen a ON a.usuario_id = s.usuario_id AND a.eps_id = $1
    WHERE s.usuario_id = ANY($2::int[])`;
const columnasResumen = `s.id, s.fecha AT TIME ZONE 'UTC' AS fecha, s.estado,
    (SELECT jsonb_build_object('id', f.id, 'nombre',
         nullif(concat_ws(' ', nullif(btrim(f.nombre), ''), nullif(btrim(f.apellido), '')), ''))
     FROM farmacia_asignaciones fa
     JOIN usuarios f ON f.id = fa.farmacia_id AND f.rol_id = 3 AND f.estado = 'ACTIVO'
     WHERE fa.solicitud_id = s.id AND fa.activa AND EXISTS (
         SELECT 1 FROM eps_farmacias ef
         WHERE ef.eps_id = a.eps_id AND ef.farmacia_id = f.id AND ef.activa
     )) AS farmacia`;
const columnas = `${columnasResumen}, a.afiliado_id AS afiliado,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('nombre', m.nombre, 'cantidad', d.cantidad) ORDER BY d.id)
        FROM detalle_solicitud d JOIN medicamentos m ON m.id = d.medicamento_id
        WHERE d.solicitud_id = s.id), '[]'::jsonb) AS medicamentos,
    EXISTS (
        SELECT 1 FROM farmacia_formulas_autorizadas g
        JOIN formulas_medicas fm ON fm.id = g.formula_id AND fm.usuario_id = s.usuario_id
        WHERE g.solicitud_id = s.id AND g.autorizado_por = s.usuario_id
          AND g.activa AND fm.estado <> 'ELIMINADA'
    ) AS formula_asociada`;

function crearRepositorio({ db, leerOrigen = leerAutorizados } = {}) {
    async function consultar(usuarioId, busquedaDocumento, accion, estadisticas = false) {
        const c = await (db || require('../config/database')).connect();
        try {
            await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const eps = await buscarEntidadVigente(usuarioId, c);
            if (!eps) return null;

            const { rows: cuentas } = await c.query(`
                SELECT a.usuario_id, a.afiliado_id, u.tipo_documento, u.cedula
                FROM afiliado_cuentas_origen a
                JOIN usuarios u ON u.id = a.usuario_id
                WHERE a.eps_id = $1 AND a.verificado_at IS NOT NULL
                  AND u.rol_id = 2 AND u.estado = 'ACTIVO'`, [eps.id]);
            const { pacientes, total, afiliados } = await leerOrigen(String(eps.id), { take: MAX_AFILIADOS + 1, estadisticas });
            if (total > MAX_AFILIADOS || pacientes.length !== total) {
                throw new Error('No se pudo comprobar el conjunto de afiliados activos de la EPS.');
            }
            const idsOriginales = new Set(autorizados(pacientes, cuentas));
            const usuariosAcreditados = cuentas
                .filter(cuenta => idsOriginales.has(cuenta.afiliado_id) &&
                    (!busquedaDocumento || clave(cuenta.tipo_documento, cuenta.cedula) === busquedaDocumento))
                .map(cuenta => cuenta.usuario_id);
            const originales = new Map(pacientes.map(paciente => [paciente.identificador, paciente]));
            const representar = solicitud => {
                const { nombres, apellidos, tipo_documento, documento } = originales.get(solicitud.afiliado);
                return { ...solicitud, paciente: { nombres, apellidos, tipo_documento, documento } };
            };
            return { eps, ...await accion(c, [eps.id, usuariosAcreditados], representar, afiliados) };
        } finally {
            try {
                await c.query('ROLLBACK');
            } finally {
                c.release();
            }
        }
    }

    function listar(usuarioId, { numero, estado, pagina, tamano, documento }) {
        return consultar(usuarioId, documento, async (c, params, representar) => {
            let consulta = pedidosAcreditados;
            if (numero) consulta += ` AND s.id = $${params.push(numero)}`;
            if (estado) consulta += ` AND s.estado = $${params.push(estado)}`;
            const { rows: [{ total }] } = await c.query(`SELECT count(*)::int AS total ${consulta}`, params);
            const limite = params.push(tamano);
            const offset = params.push((pagina - 1) * tamano);
            const { rows: solicitudes } = await c.query(`
                SELECT ${columnas} ${consulta}
                ORDER BY s.fecha DESC NULLS LAST, s.id DESC LIMIT $${limite} OFFSET $${offset}`, params);
            return { solicitudes: solicitudes.map(representar), paginacion: { pagina, tamano, total, paginas: Math.ceil(total / tamano) } };
        });
    }

    function detalle(usuarioId, id) {
        return consultar(usuarioId, null, async (c, params, representar) => {
            const { rows: [solicitud] } = await c.query(
                `SELECT ${columnas} ${pedidosAcreditados} AND s.id = $3`, [...params, id]);
            if (!solicitud) return { solicitud: null };
            const { rows: historial } = await c.query(`
                SELECT created_at AS fecha, estado_anterior, estado
                FROM farmacia_solicitud_eventos
                WHERE solicitud_id = $1 AND farmacia_id = $2
                ORDER BY created_at, id`, [id, solicitud.farmacia?.id ?? null]);
            return { solicitud: { ...representar(solicitud), historial } };
        });
    }

    function resumen(usuarioId, periodo) {
        return consultar(usuarioId, null, async (c, params, _representar, afiliados) => {
            let consulta = pedidosAcreditados;
            if (periodo?.desde) {
                consulta += ` AND s.fecha >= ($${params.push(periodo.desde)}::date::timestamp AT TIME ZONE 'America/Bogota' AT TIME ZONE 'UTC')`;
            }
            if (periodo?.hasta) {
                consulta += ` AND s.fecha < (($${params.push(periodo.hasta)}::date + 1)::timestamp AT TIME ZONE 'America/Bogota' AT TIME ZONE 'UTC')`;
            }
            const { rows: estados } = await c.query(`
                SELECT s.estado, count(*)::int AS total ${consulta}
                GROUP BY s.estado ORDER BY s.estado::text`, params);
            const { rows: meses } = await c.query(`
                SELECT to_char(s.fecha AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota','YYYY-MM') AS mes,
                       count(*)::int AS total ${consulta}
                GROUP BY 1 ORDER BY 1`, params);
            const recientes = periodo ? [] : (await c.query(`
                SELECT ${columnasResumen} ${pedidosAcreditados}
                ORDER BY s.fecha DESC NULLS LAST, s.id DESC LIMIT 5`, params)).rows;
            return {
                afiliados, farmacias: await resumenConvenios(c, params[0], Boolean(periodo)),
                solicitudes: { total: estados.reduce((total, fila) => total + fila.total, 0), estados, meses, recientes }
            };
        }, true);
    }

    return { listar, detalle, resumen };
}

module.exports = { crearRepositorio };
