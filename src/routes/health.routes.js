const express = require("express");
const router = express.Router();

const healthController = require("../controllers/health.controller");

console.log("healthController =", healthController);

router.get("/", healthController.health);

module.exports = router;