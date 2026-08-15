document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("registroForm");

    if (!form) return;

    form.addEventListener("submit", async (e) => {

        e.preventDefault();

        const nombreCompleto = document.getElementById("nombre").value.trim();
        const correo = document.getElementById("correo").value.trim().toLowerCase();
        const tipoDocumento = document.getElementById("tipoDocumento").value;
        const numeroDocumento = document.getElementById("numeroDocumento").value.trim();
        const password = document.getElementById("password").value.trim();
        const confirmarPassword = document.getElementById("confirmarPassword").value.trim();
        const aceptoTerminos = document.getElementById("aceptoTerminos");

        const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!nombreCompleto || !correo || !numeroDocumento || !password || !confirmarPassword) {
            alert("Todos los campos son obligatorios.");
            return;
        }

        if (!regexEmail.test(correo)) {
            alert("Correo electrónico inválido.");
            return;
        }

        if (password.length < 8) {
            alert("La contraseña debe tener mínimo 8 caracteres.");
            return;
        }

        if (password !== confirmarPassword) {
            alert("Las contraseñas no coinciden.");
            return;
        }

        if (!aceptoTerminos.checked) {
            alert("Debes aceptar los Términos y Condiciones.");
            return;
        }

        const partes = nombreCompleto.split(" ");

        const nombre = partes.shift() || "";
        const apellido = partes.join(" ") || "";

        try {

            const respuesta = await fetch("http://localhost:3000/api/auth/register", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    nombre,
                    apellido,
                    correo,
                    telefono: numeroDocumento,
                    password
                })

            });

            const resultado = await respuesta.json();

            if (resultado.ok) {

                alert("¡Cuenta creada correctamente!");

                form.reset();

                window.location.href = "login.html";

            } else {

                alert(resultado.mensaje);

            }

        } catch (error) {

            console.error(error);

            alert("No fue posible conectar con el servidor.");

        }

    });

});