document.addEventListener("DOMContentLoaded", () => {

    const form = document.querySelector("form");

    if (!form) return;

    form.addEventListener("submit", (e) => {

        e.preventDefault();

        const email =
            document.querySelector('input[type="email"]').value.trim();

        const password =
            document.querySelector('input[type="password"]').value.trim();

        if (email === "" || password === "") {

            alert("Por favor completa todos los campos.");
            return;

        }

        const usuarioGuardado = JSON.parse(
            localStorage.getItem("usuarioSaludClick")
        );

        if (!usuarioGuardado) {

            alert("No existe ningún usuario registrado.");
            return;

        }

        if (
            email === usuarioGuardado.email &&
            password === usuarioGuardado.password
        ) {

            localStorage.setItem("sesionActiva", "true");

            alert("Inicio de sesión exitoso.");

            window.location.href = "pages/dashboard.html";

        } else {

            alert("Correo o contraseña incorrectos.");

        }

    });

});