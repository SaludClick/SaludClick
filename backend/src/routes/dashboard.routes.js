const router = require("express").Router();
const { requirePaciente } = require("../middlewares/paciente.middleware");
const { requireAdmin } = require("../middlewares/admin.middleware");
const controller = require("../controllers/dashboard.controller");
router.get("/me", requirePaciente, controller.usuario);
router.get("/admin", requireAdmin, controller.admin);
module.exports = router;
