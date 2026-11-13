const express = require("express");

const router = express.Router();

const { validarJWT } = require("../middlewares/auth.middleware");
const { requireAdmin } = require("../middlewares/admin.middleware");

const authController = require("../controllers/auth.controller");
const {createController:createAdministrativeController}=require('../controllers/administrative.controller');
const {
    verificarRecaptcha
} = require("../middlewares/recaptcha.middleware");

// El registro de cuentas queda disponible únicamente para administradores.
router.post("/register", requireAdmin, (req,res)=>createAdministrativeController().createUser(req,res));

// Inicio de sesión
router.post("/login", verificarRecaptcha, authController.login);

// Inicio de sesión con Google
router.post("/google", verificarRecaptcha, authController.googleLogin);

// Recuperación de contraseña
router.post("/recuperar", authController.solicitarRecuperacion);

// Restablecimiento de contraseña
router.post("/restablecer", authController.restablecerPassword);

// Perfil protegido
router.get("/profile", validarJWT, authController.profile);
router.put("/profile", validarJWT, authController.updateProfile);

module.exports = router;
