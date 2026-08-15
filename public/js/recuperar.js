document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("recuperarForm");
    const inputEmail = document.getElementById("emailRecuperar");

    if (!form) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const email = inputEmail.value.trim().toLowerCase();
        const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!regexEmail.test(email)) {
            alert("Por favor, ingresa un correo electrónico válido.");
            return;
        }

        // Simulación de verificación con el usuario en localStorage
        const usuarioGuardado = localStorage.getItem("usuarioSaludClick");
        let usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : null;

        if (usuario && usuario.email === email) {
            alert(`¡Éxito! Hemos enviado un enlace de restablecimiento al correo: ${email}`);
        } else {
            // Por seguridad se muestra el mismo mensaje o se alerta sobre el registro
            alert(`Si la cuenta existe en SaludClick, se enviarán las instrucciones a: ${email}`);
        }

        // Redirigir de vuelta al login
        window.location.href = "login.html";
    });
});