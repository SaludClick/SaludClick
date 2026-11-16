const pool = require('../config/database');
const error = (status, codigo, mensaje) => Object.assign(new Error(mensaje), { status, codigo });
const INDEX_NAME = 'eps_farmacias_una_eps_activa_key';
// Validate the actual constraint, not merely an index with a familiar name.
const INDEX_SQL = `SELECT i.indisunique AND i.indisvalid AND i.indisready
    AND i.indnkeyatts=1 AND i.indnatts=1
    AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='farmacia_id')
    AND pg_get_expr(i.indpred,i.indrelid) IN ('activa','(activa = true)') AS valido
    FROM pg_index i WHERE i.indexrelid=to_regclass('public.${INDEX_NAME}')
    AND i.indrelid='public.eps_farmacias'::regclass`;
function createRepository(db = pool) {
    async function transaction(readonly, operation) {
        const client = await db.connect();
        try {
            await client.query(readonly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
            const result = await operation(client);
            await client.query('COMMIT'); return result;
        } catch (e) { try { await client.query('ROLLBACK'); } catch {} throw e; }
        finally { client.release(); }
    }
    async function account(client, id, role) {
        const { rows } = await client.query('SELECT id,rol_id,estado FROM usuarios WHERE id=$1', [id]);
        if (!rows[0] || rows[0].rol_id !== role || rows[0].estado !== 'ACTIVO') throw error(403, 'CUENTA_NO_VIGENTE', 'La cuenta no tiene acceso vigente a esta operación.');
    }
    async function links(client, farmaciaId, lockRows = false) {
        const { rows } = await client.query(`SELECT f.id,f.eps_id,f.version,e.nombre,e.activa AS eps_activa
            FROM eps_farmacias f LEFT JOIN eps_entidades e ON e.id=f.eps_id
            WHERE f.farmacia_id=$1 AND f.activa=true ORDER BY f.id LIMIT 2${lockRows ? ' FOR UPDATE OF f' : ''}`, [farmaciaId]);
        if (rows.length > 1) throw error(409, 'FARMACIA_EPS_AMBIGUA', 'La cuenta tiene más de una vinculación activa. Se requiere revisión administrativa.');
        return rows[0] || null;
    }
    function scope(link) {
        if (!link) return { estado: 'SIN_VINCULO', eps: null, mensaje: 'No tienes una EPS vinculada. Solicita la vinculación al personal administrativo autorizado.' };
        if (link.eps_activa !== true) return { estado: 'EPS_NO_VIGENTE', eps: null, mensaje: 'La EPS vinculada no está vigente. No se pueden consultar sus pacientes.' };
        return { estado: 'VINCULADA', eps: { id: link.eps_id, nombre: link.nombre }, mensaje: 'Consulta limitada a tu EPS vinculada.' };
    }
    async function consultar(farmaciaId, options) {
        return transaction(true, async client => {
            await account(client, farmaciaId, 3);
            const vinculacion = scope(await links(client, farmaciaId));
            if (!options) return { vinculacion };
            const paginacion = { pagina: options.pagina, tamano: options.take, total: 0, paginas: 0 };
            if (!vinculacion.eps) return { vinculacion, pacientes: [], totalActivos: 0, paginacion };
            const epsId = vinculacion.eps.id;
            const where = `a.eps_id=$1 AND lower(btrim(a.estado))='activo'`;
            const search = `($2='' OR strpos(lower(concat_ws(' ',a.nombres,a.apellidos)),lower($2))>0)`;
            const counts = await client.query(`SELECT count(*)::int AS activos,
                count(*) FILTER (WHERE ${search})::int AS filtrados FROM afiliados a WHERE ${where}`, [epsId, options.buscar]);
            const { rows } = await client.query(`SELECT a.nombres,a.apellidos,a.estado FROM afiliados a
                WHERE ${where} AND ${search} ORDER BY a.apellidos,a.nombres,a.id LIMIT $3 OFFSET $4`, [epsId, options.buscar, options.take, options.skip]);
            paginacion.total = counts.rows[0].filtrados;
            paginacion.paginas = Math.ceil(paginacion.total / options.take);
            return { vinculacion, pacientes: rows, totalActivos: counts.rows[0].activos, paginacion };
        });
    }
    async function administrar(actorId, farmaciaId) {
        return transaction(true, async client => {
            await account(client, actorId, 1); await account(client, farmaciaId, 3);
            const link = await links(client, farmaciaId);
            const { rows } = await client.query(INDEX_SQL);
            const eps = await client.query('SELECT id,nombre FROM eps_entidades WHERE activa=true ORDER BY nombre,id');
            return { vinculoActual: link ? { id: link.id, version: link.version, epsId: link.eps_id, epsVigente: link.eps_activa } : null,
                epsDisponibles: eps.rows, escrituraHabilitada: rows[0]?.valido === true };
        });
    }
    async function vincular(actorId, farmaciaId, input) {
        return transaction(false, async client => {
            // A common row lock serializes changes even when no link exists yet.
            // Lock actors and targets in deterministic order, then revalidate both.
            const locked = await client.query('SELECT id,rol_id,estado FROM usuarios WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE', [[actorId, farmaciaId]]);
            const actor = locked.rows.find(u => u.id === actorId), farmacia = locked.rows.find(u => u.id === farmaciaId);
            if (actor?.rol_id !== 1 || actor.estado !== 'ACTIVO' || farmacia?.rol_id !== 3 || farmacia.estado !== 'ACTIVO') throw error(403, 'CUENTA_NO_VIGENTE', 'Se requiere un administrador y una cuenta Farmacia activos.');
            if (!(await client.query(INDEX_SQL)).rows[0]?.valido) throw error(503, 'FARMACIA_EPS_SCHEMA_PENDING', 'La vinculación requiere instalar primero la protección de una sola EPS activa. No se realizaron cambios.');
            const eps = await client.query('SELECT id,nombre FROM eps_entidades WHERE id=$1 AND activa=true FOR SHARE', [input.epsId]);
            if (!eps.rows[0]) throw error(400, 'EPS_NO_VIGENTE', 'Selecciona una EPS existente y vigente.');
            const current = await links(client, farmaciaId, true);
            if (current ? (!input.vinculoActual || current.id !== input.vinculoActual.id || current.version !== input.vinculoActual.version) : input.vinculoActual !== null) throw error(409, 'FARMACIA_EPS_CONFLICTO', 'La vinculación cambió. Consulta su estado actual antes de guardar.');
            if (current?.eps_id === input.epsId) return { vinculoActual: { id: current.id, version: current.version, epsId: current.eps_id }, sinCambios: true };
            await client.query('UPDATE eps_farmacias SET activa=false,version=version+1 WHERE farmacia_id=$1 AND activa=true', [farmaciaId]);
            const saved = await client.query(`INSERT INTO eps_farmacias(eps_id,farmacia_id,activa,version,vinculada_at)
                VALUES($1,$2,true,1,now()) ON CONFLICT(eps_id,farmacia_id)
                DO UPDATE SET activa=true,version=eps_farmacias.version+1,vinculada_at=now()
                RETURNING id,eps_id,version`, [input.epsId, farmaciaId]);
            await client.query(`INSERT INTO administrative_audit(actor_id,accion,entidad,registro_id,resultado,campos)
                VALUES($1,'VINCULAR_EPS','FARMACIA',$2,'EXITO',ARRAY['eps_id','activa'])`, [actorId, String(farmaciaId)]);
            const value = saved.rows[0];
            return { vinculoActual: { id: value.id, version: value.version, epsId: value.eps_id }, sinCambios: false };
        });
    }
    return { consultar, administrar, vincular };
}
module.exports = { createRepository, INDEX_NAME };
