const { buscarEntidadVigente } = require('../repositories/eps-afiliados.repository');
const campos = { nombre: 100, apellido: 100, telefono: 20, ciudad: 100 };
const cuenta = 'u.id, u.nombre, u.apellido, u.correo, u.telefono, u.ciudad, u.estado';
const entidad = "jsonb_build_object('id', e.id, 'nombre', e.nombre, 'correo', e.correo, 'telefono', e.telefono, 'ciudad', e.ciudad, 'direccion', e.direccion) AS eps";
const ambito = "u.id=$1 AND u.rol_id=4 AND u.estado='ACTIVO' AND a.usuario_id=u.id AND a.activo AND e.id=a.eps_id AND e.activa";

function validar(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(campo => !Object.hasOwn(campos, campo))) return null;
    const valores = Object.keys(campos).map(campo => typeof body[campo] === 'string' ? body[campo].trim() : null);
    if (!valores[0] || !valores[1] || valores.some((valor, indice) =>
        valor === null || valor.length > Object.values(campos)[indice] || /[\u0000-\u001f\u007f]/.test(valor))) return null;
    return valores;
}

function responder(edicion) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = Number(req.usuario?.id);
        if (!Number.isInteger(id) || id < 1 || id > 2147483647) return res.status(403).json({ ok: false, mensaje: 'Acceso denegado.' });
        const valores = edicion ? validar(req.body) : [];
        if (!valores || Object.keys(req.query).length) {
            return res.status(400).json({ ok: false, mensaje: 'Verifica los campos editables del perfil.' });
        }
        try {
            const db = require('../config/database');
            const consulta = edicion
                ? `UPDATE usuarios u SET nombre=$2, apellido=$3, telefono=$4, ciudad=$5, updated_at=now()
                   FROM eps_accesos a, eps_entidades e WHERE ${ambito} RETURNING ${cuenta}, ${entidad}`
                : `SELECT ${cuenta}, ${entidad} FROM usuarios u, eps_accesos a, eps_entidades e WHERE ${ambito}`;
            const { rows: [fila] } = await db.query(consulta, [id, ...valores]);
            if (!fila) return res.status(403).json({ ok: false, mensaje: 'La cuenta no tiene una vinculación EPS vigente.' });
            const { eps, ...usuario } = fila;
            return res.json({ ok: true, usuario, eps });
        } catch {
            return res.status(503).json({ ok: false, mensaje: 'No fue posible consultar o guardar el perfil EPS.' });
        }
    };
}

async function protegerPerfilCompartido(req, res, next) {
    const { rol, rol_id } = req.usuario ?? {};
    if (![rol, rol_id].some(valor => Number(valor) === 4)) return next();
    const id = Number(req.usuario?.id);
    const rolesCoherentes = rol === undefined || rol_id === undefined || Number(rol) === Number(rol_id);
    try {
        if (rolesCoherentes && Number.isInteger(id) && id > 0 && id <= 2147483647 &&
            await buscarEntidadVigente(id)) return next();
        return res.status(403).json({ ok: false, mensaje: 'La cuenta no tiene una vinculación EPS vigente.' });
    } catch {
        return res.status(503).json({ ok: false, mensaje: 'No fue posible verificar el vínculo EPS.' });
    }
}

module.exports = { obtener: responder(false), guardar: responder(true), protegerPerfilCompartido };
