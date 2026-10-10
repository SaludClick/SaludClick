const express = require("express");
const router = express.Router();

const healthRoutes = require("./health.routes");
const authRoutes = require("./auth.routes");
const orderRoutes = require("./order.routes");
const medicationRoutes = require("./medication.routes");
const dashboardRoutes = require("./dashboard.routes");
const formulaRoutes = require("./formula.routes");
const adminRoutes = require("./admin.routes");

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/pedidos", orderRoutes);
router.use("/medicamentos", medicationRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/formulas", formulaRoutes);
router.use("/admin", adminRoutes);

module.exports = router;