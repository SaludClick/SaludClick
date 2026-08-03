document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        // Selección por tipos de input según la estructura del formulario HTML
        const inputs = form.querySelectorAll("input");
        const nombre = inputs[0]?.value.trim();
        const email = inputs[1]?.value.trim().toLowerCase();
        
        const passwords = form.querySelectorAll('input[type="password"]');
        const password = passwords[0] ? passwords[0].value.trim() : "";
        const confirmar = passwords[1] ? passwords[1].value.trim() : "";

        const aceptoTerminos = document.getElementById("aceptoTerminos");

if (!aceptoTerminos.checked) {
    alert("Debes aceptar los Términos y Condiciones y la Política de Privacidad para continuar.");
    return;
}

        const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!nombre || !email || !password || !confirmar) {
            alert("Todos los campos son obligatorios.");
            return;
        }

        if (!regexEmail.test(email)) {
            alert("Correo electrónico inválido.");
            return;
        }

        if (password.length < 8) {
            alert("La contraseña debe tener mínimo 8 caracteres.");
            return;
        }

        if (password !== confirmar) {
            alert("Las contraseñas no coinciden.");
            return;
        }

        // Guardar el objeto en localStorage con la clave "usuarioSaludClick"
        const usuario = {
            nombre: nombre,
            email: email,
            password: password
        };

        localStorage.setItem("usuarioSaludClick", JSON.stringify(usuario));
        alert("¡Registro exitoso! Ahora puedes iniciar sesión.");
        window.location.href = "login.html";
    });
});