const express = require("express");
const { validarJWT } = require("../middlewares/auth.middleware");
const controller = require("../controllers/chat.controller");
const router = express.Router();
router.use(validarJWT);
router.get("/conversaciones", controller.listar);
router.post("/conversaciones", controller.crear);
router.get("/conversaciones/:id/mensajes", controller.historial);
module.exports = router;
