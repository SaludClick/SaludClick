// ============================================================
// Programa: SaludClick
// Archivo: pedidos.js
// Descripción: Finalización de pedidos y pago simulado.
// ============================================================

import { checkAuthGuard, initAuth } from './auth.js';

import {
    leerEstado,
    STORAGE_KEY,
    setCatalogo
} from './pedido-temporal.js';

import { apiFetch } from './api.js';


if (checkAuthGuard()) {

    document.addEventListener(
        'DOMContentLoaded',
        async () => {

            initAuth();


            // =================================================
            // ELEMENTOS
            // =================================================

            const rows =
                document.getElementById('carritoPedido');

            const totalEl =
                document.getElementById('totalPedido');

            const msg =
                document.getElementById('mensajeCheckout');

            const btn =
                document.getElementById('pagarPedido');

            const resultado =
                document.getElementById('resultadoPago');

            const tipoEntrega =
                document.getElementById('tipoEntrega');

            const direccion =
                document.getElementById('direccion');

            const observaciones =
                document.getElementById('observaciones');

            const titular =
                document.getElementById('titular');

            const numero =
                document.getElementById('numero');

            const vencimiento =
                document.getElementById('vencimiento');

            const cvv =
                document.getElementById('cvv');


            let catalogo = [];


            // =================================================
            // DINERO
            // =================================================

            const money = numero => {

                return new Intl.NumberFormat(
                    'es-CO',
                    {
                        style: 'currency',
                        currency: 'COP',
                        maximumFractionDigits: 0
                    }
                ).format(
                    Number(numero) || 0
                );
            };


            // =================================================
            // MENSAJES
            // =================================================

            function setMensaje(
                texto,
                error = false
            ) {

                if (!msg) return;

                msg.textContent = texto;

                msg.classList.toggle(
                    'error',
                    error
                );
            }


            // =================================================
            // LEER CARRITO
            // =================================================

            function leerCarrito() {

                try {

                    return leerEstado(
                        localStorage
                    );

                } catch (error) {

                    setMensaje(
                        error.message,
                        true
                    );

                    return null;
                }
            }


            // =================================================
            // BUSCAR MEDICAMENTO
            // =================================================

            function buscarMedicamento(id) {

                const numericId =
                    Number(id);

                return catalogo.find(
                    medicamento =>
                        Number(medicamento.id)
                        === numericId
                );
            }


            // =================================================
            // MOSTRAR CARRITO
            // =================================================

            function renderCart() {

                const state =
                    leerCarrito();

                rows.replaceChildren();


                if (!state) {

                    totalEl.textContent =
                        money(0);

                    btn.disabled = true;

                    return;
                }


                if (
                    !Array.isArray(state.borrador) ||
                    state.borrador.length === 0
                ) {

                    const tr =
                        rows.insertRow();

                    const td =
                        tr.insertCell();

                    td.colSpan = 4;

                    td.innerHTML =
                        'El carrito está vacío. ' +
                        '<a href="medicamentos.html">' +
                        'Agregar medicamentos' +
                        '</a>';

                    totalEl.textContent =
                        money(0);

                    btn.disabled = true;

                    return;
                }


                let total = 0;

                let productosMostrados = 0;


                state.borrador.forEach(
                    item => {

                        const med =
                            buscarMedicamento(
                                item.id
                            );

                        /*
                         * Si por alguna razón el producto
                         * no está en el catálogo remoto,
                         * intentamos recuperar el producto
                         * desde la información guardada.
                         */

                        if (!med) {
                            return;
                        }


                        const cantidad =
                            Number(item.cantidad);


                        const precio =
                            Number(med.precio) || 0;


                        const subtotal =
                            precio * cantidad;


                        total += subtotal;

                        productosMostrados++;


                        const row =
                            rows.insertRow();


                        row.insertCell()
                            .textContent =
                            med.nombre ||
                            'Medicamento';


                        row.insertCell()
                            .textContent =
                            cantidad;


                        row.insertCell()
                            .textContent =
                            money(precio);


                        row.insertCell()
                            .textContent =
                            money(subtotal);
                    }
                );


                if (productosMostrados === 0) {

                    const tr =
                        rows.insertRow();

                    const td =
                        tr.insertCell();

                    td.colSpan = 4;

                    td.textContent =
                        'No se encontraron los medicamentos del carrito. ' +
                        'Regresa a Medicamentos y vuelve a agregarlos.';

                    totalEl.textContent =
                        money(0);

                    btn.disabled = true;

                    return;
                }


                totalEl.textContent =
                    money(total);


                /*
                 * AQUÍ estaba uno de los problemas:
                 * si existen productos válidos,
                 * el botón debe quedar habilitado.
                 */

                btn.disabled = false;
            }


            // =================================================
            // CARGAR CATÁLOGO
            // =================================================

            async function cargarCatalogo() {

                try {

                    const respuesta =
                        await apiFetch(
                            '/api/medicamentos'
                        );


                    catalogo =
                        Array.isArray(
                            respuesta.medicamentos
                        )
                            ? respuesta.medicamentos.map(
                                medicamento => ({

                                    ...medicamento,

                                    id:
                                        Number(
                                            medicamento.id
                                        ),

                                    precio:
                                        Number(
                                            medicamento.precio
                                        ) || 0,

                                    stock:
                                        Number(
                                            medicamento.stock
                                        ) || 0,

                                    disponible:
                                        String(
                                            medicamento.estado ||
                                            ''
                                        ).toUpperCase()
                                        === 'DISPONIBLE'
                                        &&
                                        Number(
                                            medicamento.stock
                                        ) > 0
                                })
                            )
                            : [];


                    catalogo =
                        catalogo.filter(
                            medicamento =>
                                Number.isInteger(
                                    medicamento.id
                                )
                                &&
                                medicamento.id > 0
                        );


                    setCatalogo(
                        catalogo
                    );


                    return true;

                } catch (error) {

                    setMensaje(
                        `No se pudo cargar el catálogo: ${error.message}`,
                        true
                    );

                    catalogo = [];

                    setCatalogo([]);

                    return false;
                }
            }


            // =================================================
            // ENTREGA
            // =================================================

            function actualizarDireccion() {

                const domicilio =
                    tipoEntrega.value ===
                    'DOMICILIO';


                direccion.disabled =
                    !domicilio;


                direccion.required =
                    domicilio;


                direccion.placeholder =
                    domicilio
                        ? 'Ingresa la dirección de entrega'
                        : 'No requerida para recoger en farmacia';


                if (!domicilio) {

                    direccion.value = '';
                }
            }


            // =================================================
            // VALIDAR FORMULARIO
            // =================================================

            function validarFormulario() {

                const state =
                    leerCarrito();


                if (
                    !state ||
                    !state.borrador ||
                    !state.borrador.length
                ) {

                    throw new Error(
                        'Agrega al menos un medicamento antes de pagar.'
                    );
                }


                if (
                    tipoEntrega.value ===
                    'DOMICILIO'
                    &&
                    direccion.value.trim().length < 8
                ) {

                    throw new Error(
                        'Para domicilio debes ingresar una dirección válida.'
                    );
                }


                if (
                    titular.value.trim().length < 3
                ) {

                    throw new Error(
                        'Ingresa el nombre del titular de la tarjeta.'
                    );
                }


                const digits =
                    numero.value.replace(
                        /\D/g,
                        ''
                    );


                if (digits.length !== 16) {

                    throw new Error(
                        'El número de tarjeta debe tener 16 dígitos. Usa 4242 4242 4242 4242.'
                    );
                }


                if (
                    !/^\d{2}\/\d{2}$/.test(
                        vencimiento.value.trim()
                    )
                ) {

                    throw new Error(
                        'El vencimiento debe tener el formato MM/AA. Ejemplo: 12/30.'
                    );
                }


                if (
                    !/^\d{3,4}$/.test(
                        cvv.value.trim()
                    )
                ) {

                    throw new Error(
                        'El CVV debe tener 3 o 4 dígitos.'
                    );
                }


                return state;
            }


            // =================================================
            // EVENTO ENTREGA
            // =================================================

            tipoEntrega.addEventListener(
                'change',
                actualizarDireccion
            );


            // =================================================
            // FORMATO TARJETA
            // =================================================

            numero.addEventListener(
                'input',
                () => {

                    const digits =
                        numero.value
                            .replace(/\D/g, '')
                            .slice(0, 16);


                    numero.value =
                        digits
                            .replace(
                                /(.{4})/g,
                                '$1 '
                            )
                            .trim();
                }
            );


            // =================================================
            // FORMATO VENCIMIENTO
            // =================================================

            vencimiento.addEventListener(
                'input',
                () => {

                    const digits =
                        vencimiento.value
                            .replace(/\D/g, '')
                            .slice(0, 4);


                    vencimiento.value =
                        digits.length > 2
                            ? `${digits.slice(0, 2)}/${digits.slice(2)}`
                            : digits;
                }
            );


            // =================================================
            // CVV
            // =================================================

            cvv.addEventListener(
                'input',
                () => {

                    cvv.value =
                        cvv.value
                            .replace(/\D/g, '')
                            .slice(0, 4);
                }
            );


            // =================================================
            // PAGAR
            // =================================================

            btn.addEventListener(
                'click',
                async () => {

                    if (btn.disabled) {
                        return;
                    }


                    resultado.hidden =
                        true;

                    resultado.replaceChildren();


                    setMensaje('');


                    try {

                        const state =
                            validarFormulario();


                        btn.disabled = true;

                        btn.classList.add(
                            'loading'
                        );


                        setMensaje(
                            'Procesando pago simulado...'
                        );


                        const payload = {

                            items:
                                state.borrador.map(
                                    item => ({

                                        id:
                                            Number(
                                                item.id
                                            ),

                                        cantidad:
                                            Number(
                                                item.cantidad
                                            )
                                    })
                                ),


                            tipoEntrega:
                                tipoEntrega.value,


                            direccion:
                                direccion.value.trim(),


                            observaciones:
                                observaciones.value.trim(),


                            pago: {

                                titular:
                                    titular.value.trim(),

                                numero:
                                    numero.value.replace(
                                        /\D/g,
                                        ''
                                    ),

                                vencimiento:
                                    vencimiento.value.trim(),

                                cvv:
                                    cvv.value.trim()
                            }
                        };


                        const result =
                            await apiFetch(
                                '/api/pedidos',
                                {
                                    method: 'POST',

                                    body:
                                        JSON.stringify(
                                            payload
                                        )
                                }
                            );


                        /*
                         * SOLAMENTE después de que
                         * el servidor confirme el pedido
                         * vaciamos el carrito.
                         */

                        localStorage.setItem(
                            STORAGE_KEY,
                            JSON.stringify({

                                version: 1,

                                borrador: [],

                                confirmados: []
                            })
                        );


                        setMensaje(
                            `Pago aprobado. Pedido #${result.solicitudId} creado correctamente.`
                        );


                        const box =
                            document.createElement(
                                'div'
                            );


                        box.className =
                            'success-box';


                        box.innerHTML = `

                            <strong>
                                Pago aprobado
                            </strong>
                            <br>

                            Pedido #${result.solicitudId}
                            <br>

                            Referencia:
                            ${result.pago.referencia}
                            <br>

                            Tarjeta:
                            ${result.pago.marca}
                            terminada en
                            ${result.pago.ultimos_digitos}
                            <br>

                            Total:
                            ${money(result.total)}

                        `;


                        resultado.appendChild(
                            box
                        );


                        resultado.hidden =
                            false;


                        titular.value = '';
                        numero.value = '';
                        vencimiento.value = '';
                        cvv.value = '';


                        renderCart();


                        await cargarPedidos();


                    } catch (error) {

                        console.error(
                            'Error al crear pedido:',
                            error
                        );


                        setMensaje(
                            error.message ||
                            'No se pudo crear el pedido.',
                            true
                        );


                        btn.disabled =
                            false;

                    } finally {

                        btn.classList.remove(
                            'loading'
                        );
                    }
                }
            );


            // =================================================
            // MIS PEDIDOS
            // =================================================

            async function cargarPedidos() {

                const table =
                    document.getElementById(
                        'tablaPedidos'
                    );


                table.replaceChildren();


                try {

                    const {
                        pedidos
                    } = await apiFetch(
                        '/api/pedidos'
                    );


                    if (
                        !Array.isArray(pedidos)
                        ||
                        !pedidos.length
                    ) {

                        const row =
                            table.insertRow();

                        const cell =
                            row.insertCell();

                        cell.colSpan = 5;

                        cell.textContent =
                            'Aún no tienes pedidos.';

                        return;
                    }


                    pedidos.forEach(
                        pedido => {

                            const row =
                                table.insertRow();


                            [

                                `#${pedido.id}`,

                                new Date(
                                    pedido.fecha
                                ).toLocaleString(
                                    'es-CO'
                                ),

                                money(
                                    pedido.total
                                ),

                                pedido.estado ||
                                'PENDIENTE',

                                `${
                                    pedido.pago_estado ||
                                    'SIN PAGO'
                                }${
                                    pedido.ultimos_digitos
                                        ? ` • ****${pedido.ultimos_digitos}`
                                        : ''
                                }`

                            ].forEach(
                                value => {

                                    row.insertCell()
                                        .textContent =
                                        value;
                                }
                            );
                        }
                    );


                } catch (error) {

                    const row =
                        table.insertRow();

                    const cell =
                        row.insertCell();

                    cell.colSpan = 5;

                    cell.textContent =
                        `No se pudo consultar el historial: ${error.message}`;
                }
            }


            // =================================================
            // INICIO
            // =================================================

            actualizarDireccion();


            /*
             * IMPORTANTE:
             * Primero catálogo.
             * Después carrito.
             */

            await cargarCatalogo();

            renderCart();

            await cargarPedidos();


            // =================================================
            // ACTUALIZAR SI CAMBIA EL STORAGE
            // =================================================

            window.addEventListener(
                'storage',
                event => {

                    if (
                        event.key === STORAGE_KEY ||
                        event.key === null
                    ) {

                        renderCart();
                    }
                }
            );

        }
    );
}