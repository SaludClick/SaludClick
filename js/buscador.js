document.addEventListener("DOMContentLoaded", () => {

    const buscador =
        document.getElementById("buscadorMedicamentos");

    if (!buscador) return;

    buscador.addEventListener("keyup", () => {

        const texto =
            buscador.value.toLowerCase();

        const filas =
            document.querySelectorAll(
                ".tabla-medicamentos tbody tr"
            );

        filas.forEach((fila) => {

            const contenido =
                fila.textContent.toLowerCase();

            if (contenido.includes(texto)) {

                fila.style.display = "";

            } else {

                fila.style.display = "none";

            }

        });

    });

});