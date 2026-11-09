
const express = require("express");
const router = express.Router();

const { validarJWT } = require("../middlewares/auth.middleware");

const authController = require("../controllers/auth.controller");

const {
    verificarRecaptcha
} = require("../middlewares/recaptcha.middleware");

// ==========================================
// RATE LIMIT - RECUPERACIÓN DE CONTRASEÑA
// ==========================================

const rateLimit = require("express-rate-limit");

const recuperarPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 3,                 // Máximo 3 solicitudes
    standardHeaders: "draft-8",
    legacyHeaders: false,

    message: {
        ok: false,
        mensaje: "Has superado el límite de solicitudes de recuperación. Inténtalo nuevamente en 15 minutos."
    }
});

// ==========================================
// REGISTRO
// ==========================================

router.post("/register", authController.register);

// ==========================================
// INICIO DE SESIÓN
// ==========================================

router.post("/login", verificarRecaptcha, authController.login);

// ==========================================
// LOGIN CON GOOGLE
// ==========================================

router.post("/google", verificarRecaptcha, authController.googleLogin);

// ==========================================
// RECUPERACIÓN DE CONTRASEÑA
// ==========================================

router.post(
    "/recuperar",
    recuperarPasswordLimiter,
    authController.solicitarRecuperacion
);

// ==========================================
// RESTABLECIMIENTO DE CONTRASEÑA
// ==========================================

router.post("/restablecer", authController.restablecerPassword);

// ==========================================
// PERFIL PROTEGIDO
// ==========================================

router.get("/profile", validarJWT, authController.profile);

router.put("/profile", validarJWT, authController.updateProfile);

// ==========================================
// EXPORTAR RUTAS
// ==========================================

module.exports = router;
