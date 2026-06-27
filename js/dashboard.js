document.addEventListener("DOMContentLoaded", () => {

    const usuario = JSON.parse(
        localStorage.getItem("usuarioSaludClick")
    );

    const bienvenida =
        document.getElementById("bienvenida");

    if (usuario && bienvenida) {

        bienvenida.textContent =
            `Bienvenido, ${usuario.nombre}`;

    }

    const pedidos =
        JSON.parse(
            localStorage.getItem("pedidosSaludClick")
        ) || [];

    const totalPedidos =
        document.getElementById("totalPedidos");

    if (totalPedidos) {

        totalPedidos.textContent =
            pedidos.length;

    }

});