import { API_BASE_URL } from "./api.js";
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("recuperarForm");
    const inputEmail = document.getElementById("emailRecuperar");
    const boton = form?.querySelector("button[type=submit]");

    if (!form) return;

    // Crear o ubicar el contenedor de mensajes dinámicos
    let mensajeBox = document.getElementById("recuperarMensaje");
    if (!mensajeBox) {
        mensajeBox = document.createElement("div");
        mensajeBox.id = "recuperarMensaje";
        mensajeBox.className = "mt-3 small text-center";
        form.appendChild(mensajeBox);
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const correo = inputEmail.value.trim().toLowerCase();
        const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Limpiar mensajes previos
        mensajeBox.className = "mt-3 small text-center";
        mensajeBox.textContent = "";

        if (!regexEmail.test(correo)) {
            mostrarMensaje("Por favor, ingresa un correo electrónico válido.", "text-danger");
            return;
        }

        boton.disabled = true;
        boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i> Enviando...';

        try {
            const respuesta = await fetch(`${API_BASE_URL}/api/auth/recuperar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ correo })
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok || !resultado.ok) {
                mostrarMensaje(
                    resultado.mensaje || "No fue posible recuperar la cuenta: el servicio no está disponible.", 
                    "text-danger"
                );
                return;
            }

            mostrarMensaje(
                resultado.mensaje || "Si el correo está registrado, recibirás las instrucciones.", 
                "text-success fw-semibold"
            );

            // Redireccionar tras 2.5 segundos para que el usuario lea el mensaje
            setTimeout(() => {
                window.location.href = "login.html";
            }, 2500);

        } catch (error) {
            console.error(error);
            mostrarMensaje("No fue posible conectar con el servidor.", "text-danger");
        } finally {
            boton.disabled = false;
            boton.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> Enviar Enlace de Recuperación';
        }
    });

    function mostrarMensaje(texto, claseColor) {
        mensajeBox.className = `mt-3 small text-center ${claseColor}`;
        mensajeBox.textContent = texto;
    }
});