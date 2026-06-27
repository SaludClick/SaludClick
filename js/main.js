document.addEventListener("DOMContentLoaded", () => {

    const botonesConsultar =
        document.querySelectorAll(".card button");

    botonesConsultar.forEach((boton) => {

        boton.addEventListener("click", () => {

            alert(
                "Esta funcionalidad estará disponible en próximas versiones."
            );

        });

    });

    const logout = document.getElementById("logout");

    if (logout) {

        logout.addEventListener("click", (e) => {

            e.preventDefault();

            localStorage.removeItem("sesionActiva");

            alert("Sesión cerrada correctamente.");

            window.location.href = "../login.html";

        });

    }

});