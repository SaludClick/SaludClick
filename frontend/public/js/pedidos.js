// ============================================================
// Programa: SaludClick
// Archivo: pedidos.js
// Descripción: Finalización de pedidos y pago simulado.
// ============================================================

import { checkAuthGuard, initAuth, getToken } from './auth.js';

import {
    leerEstado,
    STORAGE_KEY,
    setCatalogo
} from './pedido-temporal.js';

import { apiFetch } from './api.js';

const IDEMPOTENCY_STORAGE_KEY = 'saludclick_pedido_idempotencia';

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


            // Solo se transmiten fixtures públicos de demostración, nunca campos introducidos por el usuario.
            const scenarios = Object.freeze({
                aprobada: Object.freeze({numero:'4242424242424242',vencimiento:'12/30',cvv:'123',titular:'Titular de prueba'}),
                alternativa: Object.freeze({numero:'5555555555554444',vencimiento:'12/30',cvv:'123',titular:'Titular de prueba'}),
                rechazada: Object.freeze({numero:'4000000000000002',vencimiento:'12/30',cvv:'123',titular:'Titular de prueba'})
            });
            const scenario = document.getElementById('escenarioPago');
            const paymentPanel = document.getElementById('pagoSimulado');
            const paymentStatus = document.getElementById('estadoPago');
            const payLabel = btn.querySelector('span');
            let processing = false;
            let registered = false;
            function demoPayment() {
                const payment = Object.hasOwn(scenarios, scenario.value) ? scenarios[scenario.value] : null;
                if (!payment) throw new Error('Selecciona un escenario de prueba válido.');
                return payment;
            }
            function updateDemo() {
                const payment = demoPayment();
                titular.value = payment.titular;
                numero.value = payment.numero.replace(/(.{4})/g,'$1 ').trim();
                vencimiento.value = payment.vencimiento;
                cvv.value = payment.cvv;
                document.getElementById('tarjetaVistaNumero').textContent = '•••• •••• •••• ' + payment.numero.slice(-4);
                paymentState('ready', 'Datos ficticios preparados. El resultado lo confirma el servidor.');
            }
            function paymentState(state, message) {
                paymentPanel.dataset.state = state;
                paymentPanel.setAttribute('aria-busy', String(state === 'processing'));
                scenario.disabled = state === 'processing' || state === 'approved';
                paymentStatus.textContent = message;
                paymentStatus.setAttribute('role', ['error','rejected'].includes(state) ? 'alert' : 'status');
                const step = state === 'approved' ? 'approved' : state === 'processing' ? 'processing' : 'ready';
                for (const item of paymentPanel.querySelectorAll('[data-payment-step]')) {
                    if (item.dataset.paymentStep === step) item.setAttribute('aria-current','step');
                    else item.removeAttribute('aria-current');
                }
            }
            scenario.addEventListener('change', () => { if (!processing && !registered) updateDemo(); });
            function receipt(result, detail) {
                resultado.replaceChildren();
                const heading = document.createElement('h3');
                heading.textContent = 'Pago simulado registrado';
                const note = document.createElement('p');
                note.textContent = 'Operación de demostración. No se realizó ningún cobro real.';
                const list = document.createElement('dl');
                const date = detail?.fecha ? new Date(detail.fecha) : null;
                const values = [
                    ['Resultado', detail?.pago_estado || result.pago.estado],
                    ['Referencia de operación', detail?.referencia || result.pago.referencia],
                    ['Número de pedido', '#' + result.solicitudId],
                    ['Fecha registrada', date && Number.isFinite(date.getTime()) ? date.toLocaleString('es-CO') : 'No disponible: falta consultar el detalle registrado.'],
                    ['Método', detail?.metodo || result.pago.metodo],
                    ['Total confirmado', money(result.total)],
                    ['Estado del pedido', detail?.estado || 'Pendiente de consultar']
                ];
                for (const [label,value] of values) {
                    const term = document.createElement('dt'), description = document.createElement('dd');
                    term.textContent = label;
                    description.textContent = value;
                    list.append(term,description);
                }
                const link = document.createElement('a');
                link.href = 'historial.html';
                link.textContent = 'Consultar mi historial';
                resultado.append(heading,note,list,link);
                resultado.hidden = false;
            }
            updateDemo();

            const formulaPanel = document.getElementById('formulaEnSolicitud');
            const formulaSelect = document.getElementById('formulaSolicitud');
            const consultaFormula = document.getElementById('autorizarConsultaFormula');
            const descargaFormula = document.getElementById('autorizarDescargaFormula');
            if (formulaPanel) {
                formulaSelect.addEventListener('change', () => {
                    consultaFormula.checked = descargaFormula.checked = false;
                    consultaFormula.disabled = !formulaSelect.value;
                    descargaFormula.disabled = true;
                });
                consultaFormula.addEventListener('change', () => {
                    descargaFormula.disabled = !consultaFormula.checked;
                    if (!consultaFormula.checked) descargaFormula.checked = false;
                });
                apiFetch('/api/formulas').then(({ formulas, adjuntarASolicitud }) => {
                    if (!adjuntarASolicitud) return;
                    const pdfs = formulas.filter(formula => formula.tipo_mime === 'application/pdf');
                    for (const pdf of pdfs) formulaSelect.add(new Option(pdf.nombre, String(pdf.id)));
                    if (!pdfs.length) document.getElementById('estadoFormulaSolicitud').textContent = 'Tu cuenta todavía no tiene un PDF cargado.';
                    formulaPanel.hidden = false;
                }).catch(() => {
                    document.getElementById('estadoFormulaSolicitud').textContent = 'No pudimos consultar tus fórmulas. Recarga la página para adjuntar un PDF.';
                    formulaPanel.hidden = false;
                });
            }

            function limpiarClavePedido() {
                sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
            }

            function obtenerClavePedido(items, formula) {
                const fingerprint = JSON.stringify({
                    tipoEntrega: tipoEntrega.value,
                    items: [...items].sort(
                        (a, b) => Number(a.id) - Number(b.id)
                    ),
                    ...(formula && { formula })
                });
                const saved = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
                if (saved) {
                    try {
                        const attempt = JSON.parse(saved);
                        if (
                            attempt.fingerprint === fingerprint
                            && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attempt.key)
                        ) {
                            return attempt.key;
                        }
                    } catch {
                        limpiarClavePedido();
                    }
                }

                const key = crypto.randomUUID();
                sessionStorage.setItem(
                    IDEMPOTENCY_STORAGE_KEY,
                    JSON.stringify({ key, fingerprint })
                );
                return key;
            }


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
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
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

                        if (!med || !Number.isFinite(med.precio) || med.precio <= 0) {
                            const unavailable = rows.insertRow().insertCell();
                            unavailable.colSpan = 4;
                            unavailable.textContent = med
                                ? `${med.nombre}: precio no disponible.`
                                : `Medicamento #${item.id}: ya no está en el catálogo.`;
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


                if (productosMostrados !== state.borrador.length) {

                    const tr =
                        rows.insertRow();

                    const td =
                        tr.insertCell();

                    td.colSpan = 4;

                    td.textContent =
                        'No se puede calcular el total del carrito completo. ' +
                        'Regresa a Medicamentos y revisa los productos.';

                    totalEl.textContent =
                        'No disponible';

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

                btn.disabled = processing || registered;
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
                                        ),

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


                document.getElementById('camposDomicilio').hidden = !domicilio;

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
                const state = leerCarrito();
                if (!state?.borrador?.length) throw new Error('Agrega al menos un medicamento antes de pagar.');
                if (state.borrador.some(item => {
                    const med = buscarMedicamento(item.id);
                    return !med || !Number.isFinite(med.precio) || med.precio <= 0;
                })) throw new Error('Revisa los productos y precios del carrito antes de pagar.');
                if (tipoEntrega.value === 'DOMICILIO' && direccion.value.trim().length < 8) {
                    direccion.setAttribute('aria-invalid','true');
                    direccion.focus();
                    throw new Error('Para domicilio debes ingresar una dirección válida.');
                }
                direccion.removeAttribute('aria-invalid');
                const payment = demoPayment();
                if (numero.value.replace(/\D/g,'') !== payment.numero || vencimiento.value.trim() !== payment.vencimiento || cvv.value.trim() !== payment.cvv) {
                    updateDemo();
                    throw new Error('Solo se permiten los datos ficticios del escenario seleccionado. Vuelve a confirmar.');
                }
                return state;
            }

            // =================================================
            // EVENTO ENTREGA
            // =================================================

            tipoEntrega.addEventListener(
                'change',
                () => {
                    limpiarClavePedido();
                    actualizarDireccion();
                }
            );
            direccion.addEventListener('input', limpiarClavePedido);
            observaciones.addEventListener('input', limpiarClavePedido);


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

            btn.addEventListener('click', async () => {
                if (!checkAuthGuard() || processing || registered || btn.disabled) return;
                resultado.hidden = true;
                resultado.replaceChildren();
                setMensaje('');
                const token = getToken();
                try {
                    const state = validarFormulario();
                    if (formulaSelect?.value && !consultaFormula.checked) {
                        throw new Error('Autoriza la consulta del PDF seleccionado o envía la solicitud sin adjuntarlo.');
                    }
                    const formula = formulaSelect?.value
                        ? { id: Number(formulaSelect.value), permiteDescarga: descargaFormula.checked }
                        : undefined;

                    processing = true;
                    btn.disabled = true;
                    btn.classList.add('loading');
                    payLabel.textContent = 'Procesando simulación...';
                    paymentState('processing','Validando disponibilidad y registrando la operación simulada...');
                    setMensaje('Procesando pago simulado...');
                    const payload = {
                        items: state.borrador.map(item => ({id:Number(item.id),cantidad:Number(item.cantidad)})),
                        tipoEntrega: tipoEntrega.value,
                        direccion: direccion.value.trim(),
                        observaciones: observaciones.value.trim(),
                        formula,
                        pago: {...demoPayment()}
                    };
                    const idempotencyKey = obtenerClavePedido(payload.items, formula);
                    const result = await apiFetch('/api/pedidos', {
                        method:'POST', body:JSON.stringify(payload), headers:{'Idempotency-Key':idempotencyKey}
                    });
                    if (token !== getToken()) return;
                    if (!Number.isSafeInteger(result.solicitudId) || result.solicitudId < 1 || result.pago?.estado !== 'APROBADO' ||
                        typeof result.pago.referencia !== 'string' || !result.pago.referencia || typeof result.total !== 'number' || !Number.isFinite(result.total) || result.total < 0) {
                        throw new Error('No se pudo verificar el registro del pago. Reintenta sin cambiar el pedido para recuperar su resultado.');
                    }
                    registered = true;
                    receipt(result);
                    paymentState('approved','El servidor confirmó el registro del pago simulado.');
                    setMensaje('Pago simulado aprobado. Pedido #' + result.solicitudId + ' registrado.');
                    try {
                        localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,borrador:[],confirmados:[]}));
                        limpiarClavePedido();
                    } catch {
                        setMensaje('Pedido #' + result.solicitudId + ' registrado. No se pudo actualizar la selección local; no repitas el pago.',true);
                    }
                    renderCart();
                    try {
                        const detail = await apiFetch('/api/pedidos/' + result.solicitudId);
                        if (token === getToken() && Array.isArray(detail.pedido) && detail.pedido.length) receipt(result,detail.pedido[0]);
                    } catch {
                        if (token === getToken()) paymentStatus.textContent = 'Pago registrado. La fecha y el estado del pedido podrán consultarse en el historial cuando se restablezca la conexión.';
                    }
                    if (token === getToken()) {
                        await cargarPedidos();
                        resultado.focus();
                    }
                } catch (error) {
                    if (token !== getToken()) return;
                    if (error.status >= 400 && error.status < 500) limpiarClavePedido();
                    const rejected = /Pago rechazado/i.test(error.message);
                    paymentState(rejected ? 'rejected' : 'error', error.message || 'No se pudo registrar el pago simulado.');
                    setMensaje(error.message || 'No se pudo crear el pedido.',true);
                    payLabel.textContent = 'Reintentar pago simulado';
                } finally {
                    processing = false;
                    btn.classList.remove('loading');
                    if (registered) payLabel.textContent = 'Pago simulado registrado';
                    else if (paymentPanel.dataset.state === 'processing') payLabel.textContent = 'Confirmar pago simulado';
                    if (token === getToken()) renderCart();
                }
            });
            window.addEventListener('pagehide', () => { resultado.hidden = true; resultado.replaceChildren(); });

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
                            if (pedido.tipo_entrega === "DOMICILIO" && Number.isSafeInteger(pedido.id)) {
                                const link = document.createElement("a");
                                link.href = `/pages/constancia-entrega.html?solicitud=${pedido.id}`;
                                link.textContent = "Constancia y documentos";
                                row.cells[0].append(" · ", link);
                            }
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
