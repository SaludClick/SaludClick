const router = require("express").Router();
const { requireUsuario } = require("../middlewares/role.middleware");
const { requireAdmin } = require("../middlewares/admin.middleware");
const controller = require("../controllers/dashboard.controller");
router.get("/me", requireUsuario, controller.usuario);
const {createController}=require("../controllers/administrative.controller");
router.get("/admin", requireAdmin, (req,res)=>createController().dashboard(req,res));
module.exports = router;
