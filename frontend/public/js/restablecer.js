import { apiUrl } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("restablecerForm");
    const token = new URLSearchParams(window.location.search).get("token");
    const activacion = new URLSearchParams(window.location.search).get('activacion') === '1';
    if (activacion) {
        document.querySelector('h3').textContent = 'Activa tu cuenta';
        document.querySelector('h3 + p').textContent = 'Verifica tu correo estableciendo una contraseña de al menos 12 caracteres.';
        document.getElementById('nuevaPassword').minLength = 12;
        document.getElementById('nuevaPassword').placeholder = 'Mínimo 12 caracteres';
    }

    if (!token) {
        alert("El enlace de recuperación no es válido.");
        window.location.href = "login.html";
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const password = document.getElementById("nuevaPassword").value;
        const confirmar = document.getElementById("confirmarPassword").value;
        const boton = form.querySelector("button[type=submit]");

        if (activacion && (password.length < 12 || new TextEncoder().encode(password).length > 72)) {
            alert('Usa una contraseña de al menos 12 caracteres y máximo 72 bytes.');
            return;
        }

        if (password.length < 6) {
            alert("La contraseña debe tener al menos 6 caracteres.");
            return;
        }
        if (password !== confirmar) {
            alert("Las contraseñas no coinciden.");
            return;
        }

        boton.disabled = true;
        try {
            const respuesta = await fetch(apiUrl("/api/auth/restablecer"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password })
            });
            const resultado = await respuesta.json();

            if (!respuesta.ok || !resultado.ok) {
                alert(resultado.mensaje || "No fue posible cambiar la contraseña.");
                return;
            }

            alert("Contraseña actualizada correctamente. Ahora puedes iniciar sesión.");
            window.location.href = "login.html";
        } catch (error) {
            console.error(error);
            alert("No fue posible conectar con el servidor.");
        } finally {
            boton.disabled = false;
        }
    });
});
