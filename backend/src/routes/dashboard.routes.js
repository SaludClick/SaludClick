const router = require("express").Router();
const { requireUsuario } = require("../middlewares/role.middleware");
const { requireAdmin } = require("../middlewares/admin.middleware");
const controller = require("../controllers/dashboard.controller");
router.get("/me", requireUsuario, controller.usuario);
router.get("/admin", requireAdmin, controller.admin);
module.exports = router;
