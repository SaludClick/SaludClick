
const router = require("express").Router();
const { requireFarmacia } = require("../middlewares/farmacia.middleware");
const controller = require('../controllers/farmacia.controller');
const existencias = require('../controllers/farmacia-existencias.controller');
const notifications = require('../controllers/farmacia-notificaciones.controller');
const { requireFarmaciaNotificaciones, requireFarmaciaVigente } = require('../middlewares/farmacia-notificaciones.middleware');

router.get('/notificaciones', requireFarmaciaNotificaciones, notifications.listar);
router.get('/notificaciones/no-leidas/count', requireFarmaciaNotificaciones, notifications.contar);
router.patch('/notificaciones/leer-todas', requireFarmaciaNotificaciones, notifications.leerTodas);
router.patch('/notificaciones/:id/leida', requireFarmaciaNotificaciones, notifications.leer);

router.get('/pedidos', requireFarmacia, requireFarmaciaVigente, controller.pedidos);
router.get('/pedidos/:id', requireFarmacia, requireFarmaciaVigente, controller.detallePedido);
router.get('/inventario', requireFarmacia, requireFarmaciaVigente, existencias.inventario);
router.get('/inventario/:id', requireFarmacia, requireFarmaciaVigente, existencias.detalle);
router.get('/medicamentos', requireFarmacia, requireFarmaciaVigente, existencias.medicamentos);
router.get('/medicamentos/:id', requireFarmacia, requireFarmaciaVigente, existencias.detalle);
router.patch('/pedidos/:id/estado', requireFarmacia, requireFarmaciaVigente, controller.avanzarPedido);

router.get("/verificar-acceso", requireFarmacia, controller.verificarAcceso);
router.get("/dashboard", requireFarmacia, requireFarmaciaVigente, controller.dashboard);

module.exports = router;
