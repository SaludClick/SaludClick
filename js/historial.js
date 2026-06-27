document.addEventListener("DOMContentLoaded", () => {

    const tabla =
        document.getElementById("tablaHistorial");

    if (!tabla) return;

    const pedidos =
        JSON.parse(
            localStorage.getItem("pedidosSaludClick")
        ) || [];

    tabla.innerHTML = "";

    pedidos.forEach((pedido) => {

        tabla.innerHTML += `
            <tr>
                <td>${pedido.id}</td>
                <td>${pedido.medicamento}</td>
                <td>${pedido.fecha}</td>
                <td class="estado-entregado">
                    ${pedido.estado}
                </td>
            </tr>
        `;

    });

});