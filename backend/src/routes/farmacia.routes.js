
const router = require("express").Router();
const { requireFarmacia } = require("../middlewares/farmacia.middleware");

router.get("/verificar-acceso", requireFarmacia, (req, res) => {
    res.json({
        ok: true,
        mensaje: "Acceso autorizado al panel de farmacia."
    });
});

module.exports = router;
