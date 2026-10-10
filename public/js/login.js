import { setSession, consumirDestinoPendiente } from "./auth.js";

// ==========================================
// FUNCIÓN PARA OBTENER RUTA SEGÚN ROL
// ==========================================

function obtenerRutaPorRol(usuario) {
    const rolId = Number(usuario?.rol_id);

    switch (rolId) {
        case 1: // Administrador
        case 3: // Farmacia / Personal
            return "pages/admin.html";
        case 2: // Paciente / Cliente
            return "pages/dashboard.html";
        default:
            return "index.html";
    }
}

// ==========================================
// FUNCIÓN PARA GUARDAR SESIÓN Y REDIRIGIR
// ==========================================

function iniciarSesion(resultado, recordar = true, continuarAccion = false) {
    setSession(
        resultado.token,
        resultado.usuario,
        recordar
    );

    alert(`¡Bienvenido, ${resultado.usuario.nombre || "Usuario"}!`);

    // Prioriza una ruta pendiente grabada previamente; si no hay, asigna según su rol
    const destinoPendiente = continuarAccion ? consumirDestinoPendiente() : null;
    const rutaDestino = destinoPendiente || obtenerRutaPorRol(resultado.usuario);

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

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");
        const recordarInput = document.getElementById("recordar");

        const correo = emailInput?.value.trim().toLowerCase() || "";
        const password = passwordInput?.value || "";

        if (!correo || !password) {
            alert("Por favor ingresa tu correo y contraseña.");
            return;
        }

        try {
            const respuesta = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ correo, password })
            });

            const resultado = await respuesta.json();

            if (
                !respuesta.ok ||
                !resultado.ok ||
                typeof resultado.token !== "string" ||
                !resultado.token.trim() ||
                !resultado.usuario
            ) {
                alert(
                    resultado.mensaje ||
                    "Error al iniciar sesión. Verifique sus credenciales."
                );
                return;
            }

            const recordar = recordarInput ? recordarInput.checked : true;
            iniciarSesion(resultado, recordar, true);

        } catch (error) {
            console.error("Error en login:", error);
            alert("No fue posible conectar con el servidor.");
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

    try {
        const respuesta = await fetch("/api/auth/google", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                credential: response.credential
            })
        });

        const resultado = await respuesta.json();

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
        console.error("Error en Google Login:", error);
        alert("No fue posible conectar con el servidor.");
    }
};