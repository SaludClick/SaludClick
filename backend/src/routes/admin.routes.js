
const router = require("express").Router();
const { requireAdmin } = require("../middlewares/admin.middleware");
const c = require("../controllers/admin.controller");
const pacientes = require("../controllers/pacientes-autorizados.controller");

// Registro maestro de pacientes autorizados, sin crear cuentas de usuario.
router.get("/pacientes", requireAdmin, pacientes.listar);
router.post("/pacientes", requireAdmin, pacientes.crear);
router.get("/pacientes/:id", requireAdmin, pacientes.consultar);
router.patch("/pacientes/:id", requireAdmin, pacientes.actualizar);

// Gestión existente de pedidos.
router.get("/pedidos", requireAdmin, c.pedidos);
router.patch("/pedidos/:id", requireAdmin, c.estadoPedido);

// Gestión de cuentas de usuarios y farmacias.
router.post("/cuentas", requireAdmin, c.crearCuenta);
router.get("/cuentas", requireAdmin, c.cuentas);
router.delete("/cuentas/:id", requireAdmin, c.eliminarCuenta);

module.exports = router;
