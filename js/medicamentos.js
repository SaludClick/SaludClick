document.addEventListener("DOMContentLoaded", () => {

    const botones =
        document.querySelectorAll(".btn-tabla");

    botones.forEach((boton) => {

        if (boton.disabled) return;

        boton.addEventListener("click", () => {

            const fila = boton.closest("tr");

            const medicamento =
                fila.cells[0].textContent;

            const presentacion =
                fila.cells[1].textContent;

            const pedidos =
                JSON.parse(
                    localStorage.getItem("pedidosSaludClick")
                ) || [];

            const nuevoPedido = {

                id: Date.now(),

                medicamento,

                presentacion,

                fecha:
                    new Date().toLocaleDateString(),

                estado:
                    "En Preparación"

            };

            pedidos.push(nuevoPedido);

            localStorage.setItem(
                "pedidosSaludClick",
                JSON.stringify(pedidos)
            );

            alert(
                `${medicamento} solicitado correctamente.`
            );

        });

    });

});