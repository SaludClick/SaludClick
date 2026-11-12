
const router = require("express").Router();
const { requireFarmacia } = require("../middlewares/farmacia.middleware");
const controller = require('../controllers/farmacia.controller');

router.get('/pedidos', requireFarmacia, controller.pedidos);
router.get('/inventario', requireFarmacia, controller.inventario);
router.patch('/pedidos/:id/estado', requireFarmacia, controller.avanzarPedido);

router.get("/verificar-acceso", requireFarmacia, controller.verificarAcceso);
router.get("/dashboard", requireFarmacia, controller.dashboard);

module.exports = router;
