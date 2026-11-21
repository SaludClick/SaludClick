const express = require("express");

const router = express.Router();

const { validarJWT } = require("../middlewares/auth.middleware");
const { farmaciaVigenteSiCorresponde } = require('../middlewares/farmacia-session.middleware');
const { validarPerfilFarmaciaSiCorresponde } = require('../validators/farmacia-perfil.validator');
const { requireAdmin } = require("../middlewares/admin.middleware");
const { protegerPerfilCompartido } = require("../controllers/eps-perfil.controller");

const authController = require("../controllers/auth.controller");
const { recoveryRateLimit } = require("../middlewares/recovery-rate-limit.middleware");
const {createController:createAdministrativeController}=require('../controllers/administrative.controller');
const {
    verificarRecaptcha
} = require("../middlewares/recaptcha.middleware");

// El registro de cuentas queda disponible únicamente para administradores.
router.post("/register", requireAdmin, (req,res)=>createAdministrativeController().createUser(req,res));

// Inicio de sesión
const limitarInicio = recoveryRateLimit(30);
router.post("/login", limitarInicio, verificarRecaptcha, authController.login);

// Inicio de sesión con Google
router.post("/google", limitarInicio, verificarRecaptcha, authController.googleLogin);

// Recuperación de contraseña
router.post("/recuperar", recoveryRateLimit(20), authController.solicitarRecuperacion);

// Restablecimiento de contraseña
router.post("/restablecer", recoveryRateLimit(30), authController.restablecerPassword);

// Perfil protegido
router.get("/profile", validarJWT, protegerPerfilCompartido, farmaciaVigenteSiCorresponde, authController.profile);
router.put("/profile", validarJWT, protegerPerfilCompartido, farmaciaVigenteSiCorresponde, validarPerfilFarmaciaSiCorresponde, authController.updateProfile);

module.exports = router;
