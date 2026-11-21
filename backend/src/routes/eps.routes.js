const router = require("express").Router();
const { requireEps } = require("../middlewares/eps.middleware");
const controller = require("../controllers/eps.controller");
const afiliados = require("../controllers/eps-afiliados.controller");
const solicitudes = require("../controllers/eps-solicitudes.controller");
const farmacias = require("../controllers/eps-farmacias.controller");
const notificaciones = require("../controllers/eps-notificaciones.controller");
const perfil = require("../controllers/eps-perfil.controller");

router.get("/verificar-acceso", requireEps, controller.verificarAcceso);
router.get("/dashboard/resumen", requireEps, solicitudes.resumen);
router.get("/reportes/resumen", requireEps, solicitudes.reportes);
router.get("/perfil", requireEps, perfil.obtener);
router.put("/perfil", requireEps, perfil.guardar);
router.get("/afiliados", requireEps, afiliados.listar);
router.get("/afiliados/:id", requireEps, afiliados.detalle);
router.get("/solicitudes", requireEps, solicitudes.listar);
router.post("/solicitudes/busqueda", requireEps, solicitudes.buscarDocumento);
router.get("/solicitudes/:id", requireEps, solicitudes.detalle);
router.get("/farmacias", requireEps, farmacias.listar);
router.get("/farmacias/:id", requireEps, farmacias.detalle);
router.get("/notificaciones", requireEps, notificaciones.listar);
router.get("/notificaciones/no-leidas/count", requireEps, notificaciones.contar);
router.patch("/notificaciones/leer-todas", requireEps, notificaciones.leerTodas);
router.patch("/notificaciones/:id/leida", requireEps, notificaciones.leer);

module.exports = router;
