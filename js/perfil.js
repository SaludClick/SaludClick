document.addEventListener("DOMContentLoaded", () => {

    const usuario = JSON.parse(
        localStorage.getItem("usuarioSaludClick")
    );

    if (!usuario) return;

    document.getElementById("nombre").value =
        usuario.nombre || "";

    document.getElementById("email").value =
        usuario.email || "";

    document.getElementById("tipoDocumento").value =
        usuario.tipoDocumento || "";

    document.getElementById("numeroDocumento").value =
        usuario.numeroDocumento || "";

    document.getElementById("telefono").value =
        usuario.telefono || "";

    document.getElementById("ciudad").value =
        usuario.ciudad || "";

    const form = document.querySelector("form");

    form.addEventListener("submit", (e) => {

        e.preventDefault();

        usuario.nombre =
            document.getElementById("nombre").value;

        usuario.email =
            document.getElementById("email").value;

        usuario.tipoDocumento =
            document.getElementById("tipoDocumento").value;

        usuario.numeroDocumento =
            document.getElementById("numeroDocumento").value;

        usuario.telefono =
            document.getElementById("telefono").value;

        usuario.ciudad =
            document.getElementById("ciudad").value;

        localStorage.setItem(
            "usuarioSaludClick",
            JSON.stringify(usuario)
        );

        alert("Perfil actualizado correctamente.");

    });

});