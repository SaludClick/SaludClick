
import { setSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const emailInput = document.querySelector('input[type="email"]');
        const passwordInput = document.querySelector('input[type="password"]');

        const correo = emailInput?.value.trim().toLowerCase() || "";
        const password = passwordInput?.value.trim() || "";

        // Validaciones básicas
        if (!correo || !password) {
            alert("Por favor ingresa tu correo y contraseña.");
            return;
        }

        try {
            const respuesta = await fetch("http://localhost:3000/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    correo,
                    password
                })
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok || !resultado.ok) {
                alert(resultado.mensaje || "Error al iniciar sesión.");
                return;
            }

            // Guardar el JWT y los datos del usuario
            setSession(resultado.token, resultado.usuario);

            alert(`¡Bienvenido, ${resultado.usuario.nombre}!`);

            // Redirigir al dashboard
            window.location.href = "pages/dashboard.html";

        } catch (error) {
            console.error("Error:", error);
            alert("No fue posible conectar con el servidor.");
        }
    });
});