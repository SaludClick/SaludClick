document.addEventListener("DOMContentLoaded", () => {

    const form = document.querySelector("form");

    if (!form) return;

    form.addEventListener("submit", (e) => {

        e.preventDefault();

        const nombre =
            document.querySelector('input[type="text"]').value.trim();

        const email =
            document.querySelector('input[type="email"]').value.trim();

        const passwords =
            document.querySelectorAll('input[type="password"]');

        const password =
            passwords[0].value.trim();

        const confirmar =
            passwords[1].value.trim();

        if (
            nombre === "" ||
            email === "" ||
            password === "" ||
            confirmar === ""
        ) {

            alert("Todos los campos son obligatorios.");
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

        const usuario = {
            nombre,
            email,
            password
        };

        localStorage.setItem(
            "usuarioSaludClick",
            JSON.stringify(usuario)
        );

        alert("Registro exitoso.");

        window.location.href = "login.html";
        
    });
    const regexEmail =
/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!regexEmail.test(email)) {

    alert("Correo electrónico inválido.");
    return;

}

});