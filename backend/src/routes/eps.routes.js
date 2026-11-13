const router = require("express").Router();
const { requireEps } = require("../middlewares/eps.middleware");
const controller = require("../controllers/eps.controller");

router.get("/verificar-acceso", requireEps, controller.verificarAcceso);

module.exports = router;
