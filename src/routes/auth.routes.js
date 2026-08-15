const express = require("express");
const router = express.Router();

const { validarJWT } = require("../middlewares/auth.middleware");

const authController = require("../controllers/auth.controller");

console.log(authController);

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/profile", validarJWT, authController.profile);

module.exports = router;