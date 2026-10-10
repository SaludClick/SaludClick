// ============================================================
// Programa: SaludClick
// Archivo: medicamentos.js
// Descripción: Catálogo y carrito temporal de medicamentos.
// ============================================================

import {
    checkAuthGuard,
    initAuth
} from './auth.js';

import {
    STORAGE_KEY,
    MAX_CANTIDAD,
    CATALOGO,
    IMAGEN_MEDICAMENTO_RESPALDO,
    setCatalogo,
    leerEstado,
    actualizarPedido,
    totalUnidades
} from './pedido-temporal.js';

import {
    apiFetch
} from './api.js';


if (checkAuthGuard()) {

    document.addEventListener(
        'DOMContentLoaded',
        async () => {

            initAuth();


            const detalle =
                document.getElementById(
                    'detallePedido'
                );

            const mensaje =
                document.getElementById(
                    'mensajePedido'
                );

            const confirmar =
                document.getElementById(
                    'confirmarPedido'
                );

            const vaciar =
                document.getElementById(
                    'vaciarPedido'
                );

            const total =
                document.getElementById(
                    'totalSeleccionado'
                );

            const catalogo =
                document.getElementById(
                    'catalogoMedicamentos'
                );

            const buscador =
                document.getElementById(
                    'buscadorMedicamentos'
                );

            const filtroCategoria =
                document.getElementById(
                    'filtroCategoriaMedicamentos'
                );


            let catalogoActual = [];


            // =================================================
            // MENSAJE
            // =================================================

            const avisar = texto => {

                if (mensaje) {
                    mensaje.textContent =
                        texto;
                }
            };


            // =================================================
            // CARGAR CATÁLOGO
            // =================================================

            try {

                const respuesta =
                    await apiFetch(
                        '/api/medicamentos'
                    );


                const items =
                    (
                        respuesta.medicamentos ||
                        []
                    ).map(
                        medicamento => {

                            const stock =
                                Number(
                                    medicamento.stock
                                ) || 0;


                            const estado =
                                String(
                                    medicamento.estado ||
                                    ''
                                ).toUpperCase();


                            return {

                                id:
                                    Number(
                                        medicamento.id
                                    ),

                                nombre:
                                    medicamento.nombre,

                                categoria:
                                    medicamento.categoria ||
                                    'Sin categoría',

                                categoriaId:
                                    medicamento.categoria_id,

                                presentacion:
                                    medicamento.descripcion ||
                                    'Presentación estándar',

                                empaque:
                                    '',

                                imagen:
                                    medicamento.imagen ||
                                    IMAGEN_MEDICAMENTO_RESPALDO,

                                disponible:
                                    estado ===
                                        'DISPONIBLE'
                                    &&
                                    stock > 0,

                                precio:
                                    Number(
                                        medicamento.precio
                                    ) || 0,

                                stock:
                                    stock
                            };
                        }
                    );


                catalogoActual =
                    items;


                window.saludClickCatalogo =
                    items;


                /*
                 * Guardamos el catálogo remoto
                 * para que pedido-temporal.js
                 * encuentre los mismos IDs.
                 */

                setCatalogo(
                    items
                );


                catalogo.replaceChildren();


                // =================================================
                // CATEGORÍAS
                // =================================================

                const categorias =
                    [
                        ...new Map(
                            items.map(
                                medicamento =>
                                    [
                                        medicamento.categoriaId,
                                        medicamento.categoria
                                    ]
                            )
                        ).entries()
                    ].sort(
                        (a, b) =>
                            String(a[1]).localeCompare(
                                String(b[1]),
                                'es'
                            )
                    );


                categorias.forEach(
                    ([id, nombre]) => {

                        const option =
                            document.createElement(
                                'option'
                            );

                        option.value =
                            String(id);

                        option.textContent =
                            nombre;

                        filtroCategoria.append(
                            option
                        );
                    }
                );


                // =================================================
                // TABLA
                // =================================================

                items.forEach(
                    medicamento => {

                        const fila =
                            catalogo.insertRow();


                        fila.dataset.categoriaId =
                            String(
                                medicamento.categoriaId ||
                                ''
                            );


                        const img =
                            document.createElement(
                                'img'
                            );


                        img.className =
                            'tabla-medicamento-imagen';


                        img.src =
                            medicamento.imagen;


                        img.alt =
                            medicamento.nombre;


                        img.addEventListener(
                            'error',
                            () => {

                                img.src =
                                    IMAGEN_MEDICAMENTO_RESPALDO;

                            },
                            {
                                once: true
                            }
                        );


                        const cell =
                            fila.insertCell();


                        cell.append(
                            img,
                            document.createTextNode(
                                medicamento.nombre
                            )
                        );


                        fila.insertCell()
                            .textContent =
                            medicamento.categoria;


                        fila.insertCell()
                            .textContent =
                            medicamento.presentacion;


                        fila.insertCell()
                            .textContent =
                            medicamento.disponible
                                ? `Disponible (${medicamento.stock})`
                                : 'Agotado';


                        fila.cells[3].className =
                            medicamento.disponible
                                ? 'disponible'
                                : 'agotado';


                        const action =
                            fila.insertCell();


                        const button =
                            document.createElement(
                                'button'
                            );


                        button.type =
                            'button';


                        button.className =
                            'btn-tabla';


                        button.dataset.medicamentoId =
                            medicamento.id;


                        button.disabled =
                            !medicamento.disponible;


                        button.textContent =
                            medicamento.disponible
                                ? 'Agregar'
                                : 'Agotado';


                        action.append(
                            button
                        );
                    }
                );


            } catch (error) {

                avisar(
                    error.message
                );


                catalogo.innerHTML =
                    '<tr>' +
                    '<td colspan="5">' +
                    'No fue posible cargar el catálogo.' +
                    '</td>' +
                    '</tr>';
            }


            // =================================================
            // MOSTRAR CARRITO
            // =================================================

            function renderizar(
                estado
            ) {

                detalle.replaceChildren();


                total.textContent =
                    totalUnidades(
                        estado.borrador
                    );


                confirmar.disabled =
                    estado.borrador.length === 0;


                vaciar.disabled =
                    estado.borrador.length === 0;


                if (
                    !estado.borrador.length
                ) {

                    const fila =
                        detalle.insertRow();


                    const celda =
                        fila.insertCell();


                    celda.colSpan = 3;

                    celda.textContent =
                        'Todavía no has agregado medicamentos.';

                    return;
                }


                estado.borrador.forEach(
                    linea => {

                        const id =
                            Number(
                                linea.id
                            );


                        const med =
                            catalogoActual.find(
                                medicamento =>
                                    Number(
                                        medicamento.id
                                    ) === id
                            )
                            ||
                            CATALOGO.find(
                                medicamento =>
                                    Number(
                                        medicamento.id
                                    ) === id
                            );


                        if (!med) {
                            return;
                        }


                        const fila =
                            detalle.insertRow();


                        fila.insertCell()
                            .textContent =
                            `${med.nombre} ${
                                med.presentacion || ''
                            }`;


                        const controles =
                            fila.insertCell();


                        const input =
                            document.createElement(
                                'input'
                            );


                        input.type =
                            'number';


                        input.min =
                            '1';


                        input.max =
                            String(
                                Math.min(
                                    MAX_CANTIDAD,
                                    med.stock ||
                                    MAX_CANTIDAD
                                )
                            );


                        input.value =
                            linea.cantidad;


                        const crearBoton =
                            (
                                texto,
                                funcion
                            ) => {

                                const boton =
                                    document.createElement(
                                        'button'
                                    );

                                boton.type =
                                    'button';

                                boton.textContent =
                                    texto;

                                boton.addEventListener(
                                    'click',
                                    funcion
                                );

                                return boton;
                            };


                        controles.append(

                            crearBoton(
                                '-',
                                () =>
                                    ejecutar(
                                        'cantidad',
                                        id,
                                        linea.cantidad - 1
                                    )
                            ),

                            input,

                            crearBoton(
                                '+',
                                () =>
                                    ejecutar(
                                        'cantidad',
                                        id,
                                        linea.cantidad + 1
                                    )
                            )
                        );


                        input.addEventListener(
                            'change',
                            () =>
                                ejecutar(
                                    'cantidad',
                                    id,
                                    Number(
                                        input.value
                                    )
                                )
                        );


                        fila.insertCell()
                            .append(

                                crearBoton(
                                    'Eliminar',
                                    () =>
                                        ejecutar(
                                            'eliminar',
                                            id
                                        )
                                )
                            );
                    }
                );
            }


            // =================================================
            // CARGAR CARRITO
            // =================================================

            function cargar() {

                try {

                    const estado =
                        leerEstado(
                            localStorage
                        );


                    renderizar(
                        estado
                    );

                } catch (error) {

                    avisar(
                        error.message
                    );
                }
            }


            // =================================================
            // EJECUTAR ACCIÓN
            // =================================================

            function ejecutar(
                accion,
                id,
                cantidad
            ) {

                try {

                    const estado =
                        actualizarPedido(
                            localStorage,
                            accion,
                            Number(id),
                            cantidad
                        );


                    renderizar(
                        estado
                    );


                    if (
                        accion ===
                        'confirmar'
                    ) {

                        avisar(
                            'Pedido guardado temporalmente.'
                        );

                    } else {

                        avisar(
                            'Pedido actualizado.'
                        );
                    }


                } catch (error) {

                    cargar();

                    avisar(
                        error.message
                    );
                }
            }


            // =================================================
            // AGREGAR MEDICAMENTO
            // =================================================

            catalogo.addEventListener(
                'click',
                event => {

                    const boton =
                        event.target.closest(
                            '.btn-tabla[data-medicamento-id]'
                        );


                    if (
                        boton &&
                        !boton.disabled
                    ) {

                        ejecutar(
                            'agregar',
                            Number(
                                boton.dataset.medicamentoId
                            )
                        );
                    }
                }
            );


            // =================================================
            // IR A PEDIDOS
            // =================================================

            confirmar.addEventListener(
                'click',
                () => {

                    window.location.href =
                        'pedidos.html#checkout';
                }
            );


            // =================================================
            // VACIAR
            // =================================================

            vaciar.addEventListener(
                'click',
                () => {

                    ejecutar(
                        'vaciar'
                    );
                }
            );


            // =================================================
            // BUSCADOR
            // =================================================

            const normalizar =
                texto =>
                    texto
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(
                            /[\u0300-\u036f]/g,
                            ''
                        );


            function buscar() {

                const q =
                    normalizar(
                        buscador.value.trim()
                    );


                const categoria =
                    filtroCategoria.value;


                catalogo
                    .querySelectorAll('tr')
                    .forEach(
                        fila => {

                            const texto =
                                normalizar(
                                    fila.cells[0]
                                        ?.textContent ||
                                    ''
                                );


                            const cat =
                                String(
                                    fila.dataset.categoriaId ||
                                    ''
                                );


                            fila.hidden =
                                !(
                                    texto.includes(q)
                                    &&
                                    (
                                        !categoria
                                        ||
                                        cat === categoria
                                    )
                                );
                        }
                    );
            }


            buscador.addEventListener(
                'input',
                buscar
            );


            document
                .getElementById(
                    'buscarMedicamentos'
                )
                .addEventListener(
                    'click',
                    buscar
                );


            document
                .getElementById(
                    'limpiarMedicamentos'
                )
                .addEventListener(
                    'click',
                    () => {

                        buscador.value =
                            '';

                        filtroCategoria.value =
                            '';

                        buscar();
                    }
                );


            filtroCategoria.addEventListener(
                'change',
                buscar
            );


            // =================================================
            // BÚSQUEDA POR URL
            // =================================================

            const q =
                new URLSearchParams(
                    location.search
                ).get(
                    'buscar'
                );


            if (q) {

                buscador.value =
                    q;

                buscar();
            }


            // =================================================
            // CAMBIOS EN STORAGE
            // =================================================

            window.addEventListener(
                'storage',
                event => {

                    if (
                        event.key ===
                            STORAGE_KEY
                        ||
                        event.key === null
                    ) {

                        cargar();
                    }
                }
            );


            // =================================================
            // CARGAR
            // =================================================

            cargar();
        }
    );
}