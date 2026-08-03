import { checkAuthGuard, initAuth, getCurrentUser } from "./auth.js";

checkAuthGuard();

document.addEventListener("DOMContentLoaded", () => {
    initAuth();

    const usuario = getCurrentUser() || {};

    const inputNombre = document.getElementById("nombre");
    const inputEmail = document.getElementById("email");
    const inputTipoDoc = document.getElementById("tipoDocumento");
    const inputNumDoc = document.getElementById("numeroDocumento");
    const inputTelefono = document.getElementById("telefono");
    const inputCiudad = document.getElementById("ciudad");

    if (inputNombre) inputNombre.value = usuario.nombre || "";
    if (inputEmail) inputEmail.value = usuario.email || "";
    if (inputTipoDoc) inputTipoDoc.value = usuario.tipoDocumento || "";
    if (inputNumDoc) inputNumDoc.value = usuario.numeroDocumento || "";
    if (inputTelefono) inputTelefono.value = usuario.telefono || "";
    if (inputCiudad) inputCiudad.value = usuario.ciudad || "";

    const form = document.querySelector("form");

    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();

            usuario.nombre = inputNombre.value.trim();
            usuario.email = inputEmail.value.trim();
            usuario.tipoDocumento = inputTipoDoc.value.trim();
            usuario.numeroDocumento = inputNumDoc.value.trim();
            usuario.telefono = inputTelefono.value.trim();
            usuario.ciudad = inputCiudad.value.trim();

            localStorage.setItem("usuarioSaludClick", JSON.stringify(usuario));

            const nombreHeader = document.getElementById("nombreUsuario");
            if (nombreHeader) nombreHeader.textContent = usuario.nombre || "Usuario";

            alert("Perfil actualizado correctamente.");
        });
    }
});