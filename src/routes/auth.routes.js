const express = require("express");

const router = express.Router();

const { validarJWT } = require("../middlewares/auth.middleware");

const authController = require("../controllers/auth.controller");

// Registro
router.post("/register", authController.register);

// Inicio de sesión
router.post("/login", authController.login);

// Inicio de sesión con Google
router.post("/google", authController.googleLogin);

// Recuperación de contraseña
router.post("/recuperar", authController.solicitarRecuperacion);

// Restablecimiento de contraseña
router.post("/restablecer", authController.restablecerPassword);

// Perfil protegido
router.get("/profile", validarJWT, authController.profile);
router.put("/profile", validarJWT, authController.updateProfile);

module.exports = router;