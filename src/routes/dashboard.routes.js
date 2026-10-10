const router = require("express").Router();
const { validarJWT } = require("../middlewares/auth.middleware");
const { requireAdmin } = require("../middlewares/admin.middleware");
const controller = require("../controllers/dashboard.controller");
router.get("/me", validarJWT, controller.usuario);
router.get("/admin", requireAdmin, controller.admin);
module.exports = router;
