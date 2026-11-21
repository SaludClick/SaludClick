const { publicMessage } = require("../utils/public-error");
const authService = require("../services/auth.service");
const userService = require("../services/user.service");

// ==========================================
// REGISTRO
// ==========================================

const register = async (req, res) => {
    try {
        const respuesta = await authService.register(req.body);

        return res.status(201).json(respuesta);

    } catch (error) {
        return res.status(400).json({
            ok: false,
            mensaje: publicMessage(error, "No se pudo registrar la cuenta.")
        });
    }
};

// ==========================================
// LOGIN NORMAL
// ==========================================

const login = async (req, res) => {
    try {
        const respuesta = await authService.login(req.body);

        return res.status(200).json(respuesta);

    } catch (error) {
        return res.status(400).json({
            ok: false,
            mensaje: publicMessage(error, "No se pudo iniciar sesión.")
        });
    }
};

// ==========================================
// LOGIN CON GOOGLE
// ==========================================

const googleLogin = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                ok: false,
                mensaje: "Token de Google requerido"
            });
        }

        const respuesta = await authService.googleLogin(
            credential
        );

        return res.status(200).json(respuesta);

    } catch (error) {
        console.error("Error en login con Google.");

        return res.status(401).json({
            ok: false,
            mensaje: "No se pudo iniciar sesión con Google"
        });
    }
};

// ==========================================
// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
// ==========================================

const solicitarRecuperacion = async (req, res) => {
    try {
        const correo = typeof req.body?.correo === "string" ? req.body.correo.trim().toLowerCase() : "";

        if (!correo || correo.length > 254) {
            throw new Error(
                "El correo es obligatorio."
            );
        }

        await authService.solicitarRecuperacion(
            correo
        );

        return res.status(200).json({
            ok: true,
            mensaje:
                "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."
        });

    } catch (error) {
        console.error("Error en recuperación.");

        /*
         * Respuesta genérica para evitar
         * revelar si un correo existe.
         */
        return res.status(200).json({
            ok: true,
            mensaje:
                "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."
        });
    }
};

// ==========================================
// RESTABLECER CONTRASEÑA
// ==========================================

const restablecerPassword = async (req, res) => {
    try {
        await authService.restablecerPassword(
            req.body.token,
            req.body.password
        );

        return res.status(200).json({
            ok: true,
            mensaje:
                "Contraseña actualizada correctamente."
        });

    } catch (error) {
        return res.status(400).json({
            ok: false,
            mensaje: publicMessage(error, "No se pudo restablecer la contraseña.")
        });
    }
};

// ==========================================
// PERFIL
// ==========================================

const profile = async (req, res) => {
    const usuario = await userService.profile(req.usuario.id);
    return res.status(200).json({ ok: true, usuario });
};

// ==========================================
// ACTUALIZAR PERFIL
// ==========================================
const updateProfile = async (req, res) => {
    try {
        const usuario = await userService.updateProfile(req.usuario.id, req.body || {});
        res.json({ ok: true, mensaje: "Perfil actualizado correctamente.", usuario });
    } catch (error) {
        if (req.farmacia) return res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar el perfil. Revisa los datos e inténtalo nuevamente.' });
        res.status(400).json({ ok: false, mensaje: publicMessage(error, "No se pudo actualizar el perfil.") });
    }
};

// ==========================================
// EXPORTACIONES
// ==========================================

module.exports = {
    register,
    login,
    googleLogin,
    solicitarRecuperacion,
    restablecerPassword,
    profile,
    updateProfile
};
