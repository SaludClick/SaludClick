const router = require("express").Router();
const { requirePaciente } = require("../middlewares/paciente.middleware");
const { requireAdmin } = require("../middlewares/admin.middleware");
const controller = require("../controllers/dashboard.controller");
const {createController}=require('../controllers/administrative.controller');
router.get("/me", requirePaciente, controller.usuario);
router.get("/admin", requireAdmin, (req,res)=>createController().dashboard(req,res));
module.exports = router;
