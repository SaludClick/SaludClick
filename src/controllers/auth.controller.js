const authService = require("../services/auth.service");

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
            mensaje: error.message
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
            mensaje: error.message
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
        console.error(
            "Error en login con Google:",
            error.message
        );

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
        const correo = String(
            req.body.correo || ""
        )
            .trim()
            .toLowerCase();

        if (!correo) {
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
        console.error(
            "Error en recuperación:",
            error.message
        );

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
            mensaje: error.message
        });
    }
};

// ==========================================
// PERFIL
// ==========================================

const profile = async (req, res) => {
    const usuario = await authService.profile(req.usuario.id);
    return res.status(200).json({ ok: true, usuario });
};

// ==========================================
// ACTUALIZAR PERFIL
// ==========================================
const updateProfile = async (req, res) => {
    try {
        const data = req.body || {};
        const nombre = String(data.nombre || "").trim();
        const apellido = String(data.apellido || "").trim();
        if (!nombre || !apellido) throw new Error("Nombre y apellido son obligatorios.");
        const usuario = await authService.updateProfile(req.usuario.id, {
            nombre, apellido, telefono: String(data.telefono || "").trim(),
            tipoDocumento: String(data.tipoDocumento || "").trim(), ciudad: String(data.ciudad || "").trim()
        });
        res.json({ ok: true, mensaje: "Perfil actualizado correctamente.", usuario });
    } catch (error) { res.status(400).json({ ok: false, mensaje: error.message }); }
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