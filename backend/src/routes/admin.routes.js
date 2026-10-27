
const router = require("express").Router();
const { requireAdmin } = require("../middlewares/admin.middleware");
const c = require("../controllers/admin.controller");

// Gestión existente de pedidos.
router.get("/pedidos", requireAdmin, c.pedidos);
router.patch("/pedidos/:id", requireAdmin, c.estadoPedido);

// Gestión de cuentas de usuarios y farmacias.
router.get("/cuentas", requireAdmin, c.cuentas);
router.delete("/cuentas/:id", requireAdmin, c.eliminarCuenta);

module.exports = router;
