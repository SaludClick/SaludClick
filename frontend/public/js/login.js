import { setSession, consumirDestinoPendiente } from "./auth.js";
import { apiUrl } from "./api.js";
import { paginaInicio } from './roles.js';

// ==========================================
// CONFIGURACIÓN DE RECAPTCHA V2 CHECKBOX
// ==========================================

let RECAPTCHA_SITE_KEY = window.SALUDCLICK_RECAPTCHA_SITE_KEY || "";
let recaptchaLoadPromise = null;
let recaptchaWidgetId = null;
let recaptchaToken = "";

function mostrarErrorRecaptcha(message) {
    const target = document.getElementById("recaptchaError");
    if (target) target.textContent = message;
}

function reiniciarRecaptcha() {
    recaptchaToken = "";
    if (recaptchaWidgetId !== null && window.grecaptcha?.reset) window.grecaptcha.reset(recaptchaWidgetId);
}

function opcionesRecaptcha() {
    return {
        sitekey: RECAPTCHA_SITE_KEY,
        callback(token) { recaptchaToken = token; mostrarErrorRecaptcha(""); },
        "expired-callback"() { recaptchaToken = ""; mostrarErrorRecaptcha("La verificacion expiro. Marca la casilla otra vez."); },
        "error-callback"() {
            recaptchaToken = "";
            mostrarErrorRecaptcha("Google no pudo inicializar el captcha. Verifica que la clave sea de reCAPTCHA v2 Checkbox y que localhost este autorizado.");
        }
    };
}

function cargarRecaptcha() {
    if (recaptchaWidgetId !== null && window.grecaptcha?.reset) return Promise.resolve();
    if (recaptchaLoadPromise) return recaptchaLoadPromise;

    recaptchaLoadPromise = Promise.resolve().then(async () => {
        if (!RECAPTCHA_SITE_KEY) {
            const response = await fetch("/recaptcha-config.json", {
                headers: { Accept: "application/json" },
                credentials: "same-origin"
            });
            if (!response.ok) throw new Error("No fue posible cargar la clave pública de reCAPTCHA.");
            const config = await response.json();
            if (typeof config.siteKey !== "string" || !config.siteKey.trim()) {
                throw new Error("Falta PUBLIC_RECAPTCHA_SITE_KEY en la configuración Astro.");
            }
            RECAPTCHA_SITE_KEY = config.siteKey.trim();
            window.SALUDCLICK_RECAPTCHA_SITE_KEY = RECAPTCHA_SITE_KEY;
        }
    }).then(() => new Promise((resolve, reject) => {
        let script = null;
        const timeoutId = window.setTimeout(() => fail("La carga de reCAPTCHA tardo demasiado."), 15000);
        function fail(message) {
            window.clearTimeout(timeoutId);
            script?.remove();
            recaptchaLoadPromise = null;
            reject(new Error(message));
        }
        function render() {
            if (!window.grecaptcha?.ready) return fail("No fue posible inicializar reCAPTCHA v2.");
            window.grecaptcha.ready(() => {
                if (!window.grecaptcha?.render) return fail("No fue posible inicializar el checkbox de reCAPTCHA v2.");
                try {
                    recaptchaWidgetId = window.grecaptcha.render("loginRecaptcha", opcionesRecaptcha());
                    window.clearTimeout(timeoutId);
                    resolve();
                } catch (error) {
                    const detail = error instanceof Error ? error.message : "";
                    fail(detail
                        ? `Google no pudo renderizar reCAPTCHA v2: ${detail}`
                        : "La clave no es compatible con reCAPTCHA v2 Checkbox o el dominio no esta autorizado.");
                }
            });
        }
        if (window.grecaptcha?.ready && window.grecaptcha?.render) return render();
        script = document.createElement("script");
        script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
        script.async = true;
        script.onload = render;
        script.onerror = () => fail("No fue posible cargar reCAPTCHA. Revisa tu conexion.");
        document.head.appendChild(script);
    })).catch((error) => {
        recaptchaLoadPromise = null;
        throw error;
    });
    return recaptchaLoadPromise;
}// ==========================================
// FUNCIÓN PARA OBTENER RUTA SEGÚN ROL
// ==========================================


// ==========================================
// GUARDAR SESIÓN Y REDIRIGIR
// ==========================================

function iniciarSesion(
    resultado,
    recordar = true,
    continuarAccion = false
) {
    setSession(
        resultado.token,
        resultado.usuario,
        recordar
    );

    alert(`¡Bienvenido, ${resultado.usuario.nombre || "Usuario"}!`);

    const destinoPendiente = continuarAccion
        ? consumirDestinoPendiente()
        : null;

    const rutaDestino =
        destinoPendiente || paginaInicio(resultado.usuario);

    window.location.href = rutaDestino;
}

// ==========================================
// LOGIN NORMAL
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("formLogin");

    if (!form) {
        console.error("No se encontró el formulario formLogin.");
        return;
    }
    cargarRecaptcha().catch((error) => mostrarErrorRecaptcha(error.message));

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");
        const recordarInput = document.getElementById("recordar");

        const correo =
            emailInput?.value.trim().toLowerCase() || "";

        const password = passwordInput?.value || "";

        if (!correo || !password) {
            alert("Por favor ingresa tu correo y contraseña.");
            return;
        }

        try {
            if (!recaptchaToken) {
                mostrarErrorRecaptcha("Marca la casilla No soy un robot para continuar.");
                return;
            }

            const respuesta = await fetch(apiUrl("/api/auth/login"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    correo,
                    password,
                    recaptchaToken
                })
            });

            const resultado = await respuesta.json();
            reiniciarRecaptcha();

            if (
                !respuesta.ok ||
                !resultado.ok ||
                typeof resultado.token !== "string" ||
                !resultado.token.trim() ||
                !resultado.usuario
            ) {
                alert(
                    resultado.mensaje ||
                    "Error al iniciar sesión. Verifica tus credenciales."
                );
                return;
            }

            const recordar = recordarInput
                ? recordarInput.checked
                : true;

            iniciarSesion(resultado, recordar, true);

        } catch (error) {
            reiniciarRecaptcha();
            console.error("Error en login:", error);

            alert(
                error.message ||
                "No fue posible conectar con el servidor."
            );
        }
    });
});

// ==========================================
// LOGIN CON GOOGLE
// ==========================================

window.handleGoogleCredentialResponse = async function (response) {
    if (!response || !response.credential) {
        console.error("Google no entregó credential:", response);

        alert("Google no devolvió una credencial válida.");
        return;
    }

    if (!recaptchaToken) {
        mostrarErrorRecaptcha("Marca la casilla No soy un robot antes de continuar con Google.");
        return;
    }

    try {
        const respuesta = await fetch(apiUrl("/api/auth/google"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                credential: response.credential,
                recaptchaToken
            })
        });

        const resultado = await respuesta.json();
        reiniciarRecaptcha();

        if (!respuesta.ok || !resultado.ok) {
            console.error("Error Google:", resultado);

            alert(
                resultado.mensaje ||
                "No fue posible iniciar sesión con Google."
            );
            return;
        }

        iniciarSesion(resultado, true, true);

    } catch (error) {
        reiniciarRecaptcha();
        console.error("Error en Google Login:", error);

        alert("No fue posible conectar con el servidor.");
    }
};

// ==========================================
// DIAGNÓSTICO DEL CALLBACK DE GOOGLE
// ==========================================

console.log(
    "Callback de Google disponible:",
    typeof window.handleGoogleCredentialResponse
);
