
const router = require("express").Router();
const { requireFarmacia } = require("../middlewares/farmacia.middleware");
const controller = require('../controllers/farmacia.controller');

router.get('/pedidos', requireFarmacia, controller.pedidos);
router.get('/inventario', requireFarmacia, controller.inventario);
router.patch('/pedidos/:id/estado', requireFarmacia, controller.avanzarPedido);

router.get("/verificar-acceso", requireFarmacia, (req, res) => {
    res.json({
        ok: true,
        mensaje: "Acceso autorizado al panel de farmacia."
    });
});

module.exports = router;
