const router = require("express").Router();
const { requireAdmin } = require("../middlewares/admin.middleware");
const c = require("../controllers/admin.controller");

router.get("/pedidos", requireAdmin, c.pedidos);
router.patch("/pedidos/:id", requireAdmin, c.estadoPedido);

module.exports = router;