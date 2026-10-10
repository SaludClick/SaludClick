import { API_BASE_URL } from "./api.js";
document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("registroForm");

    if (!form) return;

    form.addEventListener("submit", async (e) => {

        e.preventDefault();

        const nombreCompleto = document.getElementById("nombre").value.trim();
        const correo = document.getElementById("correo").value.trim().toLowerCase();
        const tipoDocumento = document.getElementById("tipoDocumento").value;
        const numeroDocumento = document.getElementById("numeroDocumento").value.trim();
        const telefono = document.getElementById("telefono").value.trim();
        const password = document.getElementById("password").value.trim();
        const confirmarPassword = document.getElementById("confirmarPassword").value.trim();
        const aceptoTerminos = document.getElementById("aceptoTerminos");

        const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!nombreCompleto || !correo || !numeroDocumento || !telefono || !password || !confirmarPassword) {
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

            const respuesta = await fetch(`${API_BASE_URL}/api/auth/register`, {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    nombre,
                    apellido,
                    correo,
                    telefono,
                    tipoDocumento,
                    numeroDocumento,
                    password
                })

            });

            const resultado = await respuesta.json();

            if (respuesta.ok && resultado.ok) {

                alert("¡Cuenta creada correctamente!");

                form.reset();

                window.location.href = "login.html";

            } else {

                alert(resultado.mensaje || "No fue posible crear la cuenta: el servicio de datos no está disponible.");

            }

        } catch (error) {

            console.error(error);

            alert("No fue posible conectar con el servidor.");

        }

    });

});
document.querySelectorAll("[data-aviso-legal]").forEach(enlace => {
    enlace.addEventListener("click", event => {
        event.preventDefault();
        const aviso = document.getElementById("avisoLegal");
        aviso.hidden = false;
        aviso.textContent = "Este documento todavía no está publicado. Solicita información en contacto@saludclick.com antes de registrar tus datos.";
        aviso.scrollIntoView({ behavior: "smooth", block: "center" });
    });
});
