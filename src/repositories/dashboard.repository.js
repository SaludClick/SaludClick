const pool = require("../config/database");

async function statsUsuario(usuarioId) {
    const [[pedidos]] = await pool.query(
        `SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN estado NOT IN ('ENTREGADA','CANCELADA') THEN 1 ELSE 0 END),0) activos
         FROM solicitudes WHERE usuario_id = ?`, [usuarioId]);
    const [[formulas]] = await pool.query(
        `SELECT COUNT(*) total FROM formulas_medicas WHERE usuario_id = ? AND estado <> 'ELIMINADA'`, [usuarioId]);
    const [[gasto]] = await pool.query(
        `SELECT COALESCE(SUM(monto),0) total FROM pagos WHERE usuario_id = ? AND estado='APROBADO'`, [usuarioId]);
    return { pedidos: Number(pedidos.total), pedidosActivos: Number(pedidos.activos), formulas: Number(formulas.total), totalPagado: Number(gasto.total) };
}

async function statsAdmin() {
    const [[usuarios]] = await pool.query(`SELECT COUNT(*) total, COALESCE(SUM(estado='ACTIVO'),0) activos FROM usuarios`);
    const [[pedidos]] = await pool.query(`SELECT COUNT(*) total, COALESCE(SUM(estado IN ('PENDIENTE','APROBADA','PREPARANDO','LISTA')),0) activos FROM solicitudes`);
    const [[ventas]] = await pool.query(`SELECT COALESCE(SUM(monto),0) total FROM pagos WHERE estado='APROBADO'`);
    const [[inventario]] = await pool.query(`SELECT COUNT(*) total, COALESCE(SUM(estado='DISPONIBLE'),0) disponibles, COALESCE(SUM(stock),0) unidades FROM medicamentos`);
    const [[formulas]] = await pool.query(`SELECT COUNT(*) total, COALESCE(SUM(estado='PENDIENTE'),0) pendientes FROM formulas_medicas`);
    const [ventasMes] = await pool.query(
        `SELECT DATE_FORMAT(p.created_at,'%Y-%m') periodo, COUNT(*) pedidos, COALESCE(SUM(p.monto),0) ventas
         FROM pagos p WHERE p.estado='APROBADO' AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
         GROUP BY DATE_FORMAT(p.created_at,'%Y-%m') ORDER BY periodo`);
    const [estados] = await pool.query(`SELECT estado, COUNT(*) cantidad FROM solicitudes GROUP BY estado ORDER BY cantidad DESC`);
    return {
        usuarios: { total: Number(usuarios.total), activos: Number(usuarios.activos) },
        pedidos: { total: Number(pedidos.total), activos: Number(pedidos.activos) },
        ventas: Number(ventas.total),
        inventario: { total: Number(inventario.total), disponibles: Number(inventario.disponibles), unidades: Number(inventario.unidades) },
        formulas: { total: Number(formulas.total), pendientes: Number(formulas.pendientes) },
        ventasMes, estados
    };
}

module.exports = { statsUsuario, statsAdmin };
