const express = require("express");

const router = express.Router();

const { requirePaciente } = require("../middlewares/paciente.middleware");

const controller = require("../controllers/order.controller");

// Los pedidos pertenecen exclusivamente a pacientes.
router.use(requirePaciente);

// Listar pedidos del usuario
router.get("/", controller.listarPedidos);

// Ver detalle de un pedido
router.get("/:id", controller.detallePedido);

// Crear pedido
router.post("/", controller.crearPedido);

// Eliminar pedido del historial
router.delete("/:id", controller.eliminarPedido);

module.exports = router;