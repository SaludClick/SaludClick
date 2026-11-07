function createRecaptchaMiddleware({
    getSecret = () => process.env.RECAPTCHA_SECRET_KEY,
    getAllowedHostnames = () => process.env.RECAPTCHA_ALLOWED_HOSTNAMES,
    fetchImpl = (...args) => globalThis.fetch(...args),
    logger = console
} = {}) {
    return async function verificarRecaptcha(req, res, next) {
        try {
            const token = req.body?.recaptchaToken;

            if (typeof token !== "string" || !token.trim()) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Debes completar la validación de seguridad."
                });
            }

            const secret = getSecret();
            if (!secret) {
                logger.error("Falta configurar RECAPTCHA_SECRET_KEY");
                return res.status(500).json({
                    ok: false,
                    mensaje: "La protección de seguridad no está configurada."
                });
            }

            const allowedHostnames = String(getAllowedHostnames() || "")
                .split(",")
                .map((hostname) => hostname.trim().toLowerCase().replace(/\.$/, ""))
                .filter((hostname) => hostname && !/[\s/:*]/.test(hostname));
            if (!allowedHostnames.length) {
                logger.error("Falta configurar RECAPTCHA_ALLOWED_HOSTNAMES");
                return res.status(500).json({
                    ok: false,
                    mensaje: "La protección de seguridad no está configurada."
                });
            }

            const parametros = new URLSearchParams({ secret, response: token });
            const respuesta = await fetchImpl(
                "https://www.google.com/recaptcha/api/siteverify",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: parametros
                }
            );

            if (!respuesta.ok) {
                throw new Error("No fue posible verificar reCAPTCHA con Google");
            }

            const resultado = await respuesta.json();
            const hostname = typeof resultado.hostname === "string"
                ? resultado.hostname.trim().toLowerCase().replace(/\.$/, "")
                : "";
            // reCAPTCHA v2 Checkbox returns success and hostname (action/score belong to v3).
            const valido = resultado.success === true && allowedHostnames.includes(hostname);

            if (!valido) {
                logger.warn("Validación reCAPTCHA rechazada:", {
                    success: resultado.success,
                    errorCodes: resultado["error-codes"]
                });
                return res.status(403).json({
                    ok: false,
                    mensaje: "No se pudo validar la solicitud. Inténtalo nuevamente."
                });
            }

            return next();
        } catch (error) {
            logger.error("Error verificando reCAPTCHA:", error.message);
            return res.status(503).json({
                ok: false,
                mensaje: "No se pudo verificar la seguridad. Inténtalo nuevamente."
            });
        }
    };
}

const verificarRecaptcha = createRecaptchaMiddleware();

module.exports = { createRecaptchaMiddleware, verificarRecaptcha };
