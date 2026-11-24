const { Router } = require("express");
const { validarJWT } = require("../middlewares/auth.middleware");
const { createDispensacion } = require("../services/dispensacion.service");
const { id, text } = require("../validators/administrative.validator");

function createRouter({
    service,
    enabled = () => process.env.DISPENSACION_ETAPAS_ENABLED === "true"
} = {}) {
    const router = Router();
    const operations = () => service ??= createDispensacion(require("../config/database"));
    router.use((req, res, next) => {
        res.set("Cache-Control", "no-store");
        if (!enabled()) return res.status(404).json({ ok: false, mensaje: "Dispensación por etapas no habilitada." });
        return next();
    }, validarJWT);
    const handle = action => async (req, res) => {
        try {
            const datos = await action(req, operations());
            return res.json({ ok: true, datos });
        } catch (error) {
            if (error.public) return res.status(error.status).json({ ok: false, mensaje: error.message });
            if (["23505", "23514", "40001", "40P01"].includes(error.code)) {
                return res.status(409).json({ ok: false, mensaje: "La operación entró en conflicto. Consulta su estado e inténtalo de nuevo." });
            }
            console.error("Error en dispensación.", error.code || error.name);
            return res.status(503).json({ ok: false, mensaje: "No fue posible completar la operación." });
        }
    };
    router.put("/instituciones/:ips", handle((req, svc) =>
        svc.configurarIps(req.usuario, text(req.params.ips, "IPS", 80), req.body)));
    router.put("/instituciones/:ips/personal/:usuario", handle((req, svc) =>
        svc.habilitarIps(req.usuario, text(req.params.ips, "IPS", 80), id(req.params.usuario), req.body)));
    router.put("/farmacia/personal/:usuario", handle((req, svc) =>
        svc.habilitarFarmacia(req.usuario, id(req.params.usuario), req.body)));
    router.get("/mis-visitas", handle((req, svc) => svc.misVisitas(req.usuario)));
    router.get("/solicitudes/:id", handle((req, svc) => svc.consultar(req.usuario, id(req.params.id))));
    router.get("/solicitudes/:id/documentos", handle((req, svc) => svc.documentos(req.usuario, id(req.params.id), false)));
    router.get("/solicitudes/:id/constancias", handle((req, svc) => svc.documentos(req.usuario, id(req.params.id), true)));
    router.post("/solicitudes/:id/etapas/:accion", handle((req, svc) =>
        svc.procesar(req.usuario, id(req.params.id), req.params.accion, req.get("Idempotency-Key"), req.body)));
    return router;
}

module.exports = { createRouter };
