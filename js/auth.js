document.addEventListener("DOMContentLoaded", () => {

    const sesionActiva = localStorage.getItem("sesionActiva");

    if (!sesionActiva) {

        alert("Debes iniciar sesión.");

        window.location.href = "../login.html";

    }

});