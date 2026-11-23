const pool = require('../config/database');
const { identificar } = require('../services/farmacia-foto.service');
const select = (conMinimo=false) => `SELECT m.id, m.nombre, m.descripcion, m.presentacion, m.requiere_formula, m.categoria_id,
    c.nombre AS categoria, c.descripcion AS categoria_descripcion, m.precio, m.stock, m.imagen, m.estado
    ${conMinimo?", COALESCE((to_jsonb(m)->>'stock_minimo')::int,0) AS stock_minimo":''}
    FROM medicamentos m JOIN categorias c ON c.id = m.categoria_id`;
const publicados = `(m.estado = 'DISPONIBLE' AND m.stock >= 0 OR m.estado = 'AGOTADO' AND m.stock = 0)
    AND COALESCE((to_jsonb(m)->>'stock_minimo')::int, 0) >= 0
    AND btrim(m.nombre) <> ''`;
async function listar({ soloPublicados = false } = {}) {
    const { rows } = await pool.query(`${select(soloPublicados)}${soloPublicados ? ` WHERE ${publicados}` : ''} ORDER BY c.nombre, m.nombre, m.id`);
    return rows;
}
async function buscarPublicados(buscar, pagina) {
    const tamano = 12;
    const { rows } = await pool.query(`${select(true)} WHERE ${publicados} AND strpos(lower(m.nombre), lower($1)) > 0
        ORDER BY m.nombre, m.id LIMIT $2 OFFSET $3`, [buscar, tamano + 1, (pagina - 1) * tamano]);
    return {
        medicamentos: rows.slice(0, tamano).map(({id,nombre,descripcion,presentacion,precio,imagen,estado,stock,stock_minimo}) => {
            const disponible=estado==='DISPONIBLE'&&stock>0;
            const precioReal=Number(precio);
            return {id,nombre,descripcion,presentacion,precio:Number.isFinite(precioReal)&&precioReal>0?precioReal:null,imagen,disponible,stockBajo:disponible&&stock<=stock_minimo};
        }),
        siguiente: rows.length > tamano
    };
}
async function foto(archivo) {
    const photo = identificar(archivo);
    if (!photo) return null;
    const { rows } = await pool.query(`SELECT CASE
        WHEN EXISTS (SELECT 1 FROM medicamentos WHERE imagen=$1)
        AND EXISTS (SELECT 1 FROM pg_largeobject_metadata WHERE oid=$2::oid)
        THEN lo_get($2::oid) END AS contenido`, [photo.url,photo.oid]);
    return rows[0]?.contenido ?? null;
}
module.exports = { listar, buscarPublicados, foto };
