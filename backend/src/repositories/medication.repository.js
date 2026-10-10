const pool = require('../config/database');
async function listar() {
    const [rows] = await pool.query(`SELECT m.id, m.nombre, m.descripcion, m.categoria_id, c.nombre AS categoria, c.descripcion AS categoria_descripcion, m.precio, m.stock, m.imagen, m.estado FROM medicamentos m JOIN categorias c ON c.id = m.categoria_id ORDER BY c.nombre, m.nombre`);
    return rows;
}
module.exports = { listar };
