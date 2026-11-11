
const router = require("express").Router();
const { requireFarmacia } = require("../middlewares/farmacia.middleware");
const controller = require("../controllers/farmacia.controller");

router.get("/verificar-acceso", requireFarmacia, controller.verificarAcceso);
router.get("/dashboard", requireFarmacia, controller.dashboard);

module.exports = router;
