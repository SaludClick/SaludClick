const router = require("express").Router();
const { requireFarmacia } = require("../middlewares/farmacia.middleware");
const controller = require('../controllers/farmacia.controller');
const notifications = require('../controllers/farmacia-notificaciones.controller');
const { requireFarmaciaNotificaciones, requireFarmaciaVigente } = require('../middlewares/farmacia-notificaciones.middleware');

router.get('/notificaciones', requireFarmaciaNotificaciones, notifications.listar);
router.get('/notificaciones/no-leidas/count', requireFarmaciaNotificaciones, notifications.contar);
router.patch('/notificaciones/leer-todas', requireFarmaciaNotificaciones, notifications.leerTodas);
router.patch('/notificaciones/:id/leida', requireFarmaciaNotificaciones, notifications.leer);

router.get('/pedidos', requireFarmacia, controller.pedidos);
router.get('/inventario', requireFarmacia, controller.inventario);
router.patch('/pedidos/:id/estado', requireFarmacia, controller.avanzarPedido);

router.get("/verificar-acceso", requireFarmacia, controller.verificarAcceso);
router.get("/dashboard", requireFarmacia, controller.dashboard);

module.exports = router;
