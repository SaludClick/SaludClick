
const verificarRecaptcha = async (req, res, next) => {
    try {
        const secret = process.env.RECAPTCHA_SECRET_KEY;
        const token = req.body?.recaptchaToken;

        if (!secret) {
            console.error("Falta configurar RECAPTCHA_SECRET_KEY");

            return res.status(500).json({
                ok: false,
                mensaje: "La protección de seguridad no está configurada."
            });
        }

        if (typeof token !== "string" || !token.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: "Debes completar la validación de seguridad."
            });
        }

        const parametros = new URLSearchParams({
            secret,
            response: token
        });

        const respuesta = await fetch(
            "https://www.google.com/recaptcha/api/siteverify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: parametros
            }
        );

        if (!respuesta.ok) {
            throw new Error("No fue posible verificar reCAPTCHA con Google");
        }

        const resultado = await respuesta.json();

        const valido =
            resultado.success === true &&
            resultado.action === "login" &&
            typeof resultado.score === "number" &&
            resultado.score >= 0.5;

        if (!valido) {
            console.warn("Validación reCAPTCHA rechazada:", {
                success: resultado.success,
                action: resultado.action,
                score: resultado.score,
                errorCodes: resultado["error-codes"]
            });

            return res.status(403).json({
                ok: false,
                mensaje: "No se pudo validar la solicitud. Inténtalo nuevamente."
            });
        }

        next();
    } catch (error) {
        console.error("Error verificando reCAPTCHA:", error.message);

        return res.status(503).json({
            ok: false,
            mensaje: "No se pudo verificar la seguridad. Inténtalo nuevamente."
        });
    }
};

module.exports = { verificarRecaptcha };
