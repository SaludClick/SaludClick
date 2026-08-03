import { setSession } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
    // Buscamos el formulario principal
    const form = document.querySelector("form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        // Obtener los inputs mediante el selector o ID directo
        const emailInput = document.querySelector('input[type="email"]');
        const passwordInput = document.querySelector('input[type="password"]');

        const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
        const password = passwordInput ? passwordInput.value.trim() : "";

        // 1. Validar que los campos no estén vacíos
        if (!email || !password) {
            alert("Por favor ingresa tu correo y contraseña.");
            return;
        }

        // 2. Obtener datos guardados previamente en el registro
        const usuarioGuardado = JSON.parse(localStorage.getItem("usuarioSaludClick"));

        // 3. Evaluar credenciales
        if (usuarioGuardado && usuarioGuardado.email.toLowerCase() === email) {
            
            // Validar contraseña si el usuario ya está registrado
            if (usuarioGuardado.password && usuarioGuardado.password !== password) {
                alert("Contraseña incorrecta. Inténtalo de nuevo.");
                return;
            }

            // Inicio de sesión exitoso con el usuario existente
            const token = "token_" + Date.now();
            setSession(token, usuarioGuardado);
            alert(`¡Bienvenido de nuevo, ${usuarioGuardado.nombre || "Usuario"}!`);
            window.location.href = "pages/dashboard.html";

        } else {
            // Si el usuario no existe previamente en registro, se autogenera una sesión demo
            const nombreGenerado = email.split("@")[0];
            const nuevoUsuario = { 
                nombre: nombreGenerado.charAt(0).toUpperCase() + nombreGenerado.slice(1), 
                email: email 
            };
            
            const token = "token_" + Date.now();
            setSession(token, nuevoUsuario);
            
            alert("¡Bienvenido a SaludClick!");
            window.location.href = "pages/dashboard.html";
        }
    });
});