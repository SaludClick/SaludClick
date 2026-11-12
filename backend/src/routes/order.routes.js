const express = require("express");

const router = express.Router();

const { requireUsuario } = require("../middlewares/role.middleware");

const controller = require("../controllers/order.controller");

// Todas las rutas requieren usuario autenticado
router.use(requireUsuario);

// Listar pedidos del usuario
router.get("/", controller.listarPedidos);

// Ver detalle de un pedido
router.get("/:id", controller.detallePedido);

// Crear pedido
router.post("/", controller.crearPedido);

// Eliminar pedido del historial
router.delete("/:id", controller.eliminarPedido);

module.exports = router;
