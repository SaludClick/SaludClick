
const router = require("express").Router();
const { requireFarmacia } = require("../middlewares/farmacia.middleware");
const controller = require('../controllers/farmacia.controller');
const existencias = require('../controllers/farmacia-existencias.controller');
const notifications = require('../controllers/farmacia-notificaciones.controller');
const { requireFarmaciaNotificaciones, requireFarmaciaVigente, requireFarmaciaSolicitudes } = require('../middlewares/farmacia-notificaciones.middleware');
const eps = require('../controllers/farmacia-eps.controller');
const { requirePedidoScope } = require('../middlewares/farmacia-pedidos-scope.middleware');
const operacion = require('../controllers/farmacia-operacion.controller');
const stock = require('../controllers/farmacia-stock.controller');
router.get('/existencias',requireFarmacia,requireFarmaciaVigente,stock.listar);
router.get('/existencias/reporte.xlsx',requireFarmacia,requireFarmaciaVigente,stock.exportar);
router.get('/existencias/:id',requireFarmacia,requireFarmaciaVigente,stock.detalle);
router.post('/perfil/password',requireFarmacia,requireFarmaciaVigente,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{require('../validators/farmacia-operacion.validator').objeto(req.query,[]);res.json({ok:true,...await require('../services/farmacia-password.service').createService().cambiar(req.farmacia,req.body)});}catch(e){operacion.error(res,e);}
});
router.get('/dashboard/estadisticas',requireFarmacia,requireFarmaciaVigente,operacion.estadisticas);
router.get('/dashboard/usuarios-vinculados',requireFarmacia,requireFarmaciaVigente,operacion.usuariosVinculados);
router.get('/medicamentos/permisos',requireFarmacia,requireFarmaciaVigente,operacion.permisos);
router.post('/medicamentos',requireFarmacia,requireFarmaciaVigente,operacion.crear);
router.patch('/medicamentos/:id',requireFarmacia,requireFarmaciaVigente,operacion.editar);
router.delete('/medicamentos/:id',requireFarmacia,requireFarmaciaVigente,operacion.retirar);
router.get('/pedidos/:id/formulas/:formulaId',requireFarmacia,requireFarmaciaSolicitudes,requirePedidoScope,operacion.formula);
router.get('/inventario/reporte.xlsx',requireFarmacia,requireFarmaciaVigente,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try {
        const buffer=await require('../services/farmacia-excel.service').exportar(req.query);
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.set('Content-Disposition',`attachment; filename="Inventario_SaludClick_${new Date().toISOString().slice(0,10)}.xlsx"`);
        res.send(buffer);
    }catch(e){operacion.error(res,e);}
});
router.get('/eps', requireFarmacia, requireFarmaciaVigente, eps.eps);
router.get('/usuarios', requireFarmacia, requireFarmaciaVigente, eps.usuarios);

router.get('/notificaciones', requireFarmaciaNotificaciones, notifications.listar);
router.get('/notificaciones/no-leidas/count', requireFarmaciaNotificaciones, notifications.contar);
router.patch('/notificaciones/leer-todas', requireFarmaciaNotificaciones, notifications.leerTodas);
router.patch('/notificaciones/:id/leida', requireFarmaciaNotificaciones, notifications.leer);

router.get('/pedidos', requireFarmacia, requireFarmaciaSolicitudes, requirePedidoScope, operacion.listar);
router.get('/pedidos/:id', requireFarmacia, requireFarmaciaSolicitudes, requirePedidoScope, operacion.detalle);
router.get('/inventario', requireFarmacia, requireFarmaciaVigente, existencias.inventario);
router.get('/inventario/:id', requireFarmacia, requireFarmaciaVigente, existencias.detalle);
router.get('/medicamentos', requireFarmacia, requireFarmaciaVigente, existencias.medicamentos);
router.get('/medicamentos/:id', requireFarmacia, requireFarmaciaVigente, existencias.detalleMedicamento);
router.patch('/pedidos/:id/estado', requireFarmacia, requireFarmaciaSolicitudes, requirePedidoScope, operacion.avanzar);

router.get("/verificar-acceso", requireFarmacia, requireFarmaciaVigente, controller.verificarAcceso);
router.get("/dashboard", requireFarmacia, requireFarmaciaVigente, controller.dashboard);

module.exports = router;
