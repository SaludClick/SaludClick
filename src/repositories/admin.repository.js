const pool=require("../config/database");
async function pedidos(){
 const [rows]=await pool.query(`SELECT s.id,s.fecha,s.estado,s.tipo_entrega,CONCAT(u.nombre,' ',u.apellido) usuario,u.correo,
 COALESCE(SUM(ds.subtotal),0) total,COALESCE(p.estado,'SIN PAGO') pago
 FROM solicitudes s JOIN usuarios u ON u.id=s.usuario_id LEFT JOIN detalle_solicitud ds ON ds.solicitud_id=s.id
 LEFT JOIN pagos p ON p.solicitud_id=s.id GROUP BY s.id,p.id ORDER BY s.fecha DESC LIMIT 50`);
 return rows;
}
async function estadoPedido(id,estado){
 const [r]=await pool.query("UPDATE solicitudes SET estado=? WHERE id=?",[estado,id]); return r.affectedRows;
}
module.exports={pedidos,estadoPedido};
