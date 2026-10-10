document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("restablecerForm");
    const token = new URLSearchParams(window.location.search).get("token");

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
            const respuesta = await fetch("/api/auth/restablecer", {
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
