// ============================================================
// Programa: SaludClick
// Archivo: pedido-temporal.js
// DescripciÃ³n: Manejo del carrito temporal de medicamentos.
// ============================================================

export const CATALOGO = Object.freeze([
    {
        id: 1,
        nombre: "AcetaminofÃ©n",
        presentacion: "500 mg",
        empaque: "Caja x 20 tabletas",
        imagen: "/images/medicamentos/acetaminofen.svg",
        disponible: true,
        precio: 0
    },
    {
        id: 2,
        nombre: "Ibuprofeno",
        presentacion: "400 mg",
        empaque: "Caja x 20 tabletas",
        imagen: "/images/medicamentos/ibuprofeno.svg",
        disponible: true,
        precio: 0
    },
    {
        id: 3,
        nombre: "Amoxicilina",
        presentacion: "500 mg",
        empaque: "Caja x 21 cÃ¡psulas",
        imagen: "/images/medicamentos/amoxicilina.svg",
        disponible: true,
        precio: 0
    },
    {
        id: 4,
        nombre: "Loratadina",
        presentacion: "10 mg",
        empaque: "Caja x 10 tabletas",
        imagen: "/images/medicamentos/loratadina.svg",
        disponible: true,
        precio: 0
    },
    {
        id: 5,
        nombre: "Omeprazol",
        presentacion: "20 mg",
        empaque: "Caja x 14 cÃ¡psulas",
        imagen: "/images/medicamentos/omeprazol.svg",
        disponible: true,
        precio: 0
    }
].map(Object.freeze));

export const IMAGEN_MEDICAMENTO_RESPALDO =
    "/images/medicamentos/medicamento-generico.svg";

export const STORAGE_KEY = "saludclick_pedido_temporal_v1";

export const MAX_CANTIDAD = 999;


// ============================================================
// Guardar catÃ¡logo recibido desde MySQL
// ============================================================

export function setCatalogo(catalogo) {

    if (!Array.isArray(catalogo)) {
        return;
    }

    globalThis.saludClickCatalogo = catalogo
        .map(item => {

            const id = Number(item.id);
            const stock = Number(item.stock) || 0;

            let disponible;

            if (typeof item.disponible === "boolean") {
                disponible = item.disponible;
            } else {
                disponible =
                    String(item.estado || "").toUpperCase() === "DISPONIBLE"
                    && stock > 0;
            }

            return {
                ...item,
                id,
                stock,
                disponible,
                precio: Number(item.precio) || 0
            };
        })
        .filter(item =>
            Number.isInteger(item.id) &&
            item.id > 0
        );
}


// ============================================================
// Obtener catÃ¡logo actual
// ============================================================

function catalogoActivo() {

    const remoto = globalThis.saludClickCatalogo;

    if (Array.isArray(remoto) && remoto.length > 0) {
        return remoto;
    }

    return CATALOGO;
}


// ============================================================
// Buscar medicamento
// ============================================================

export function medicamento(id) {

    const numericId = Number(id);

    const item = catalogoActivo().find(
        item => Number(item.id) === numericId
    );

    if (!item) {
        throw new Error(
            "El medicamento seleccionado no existe en el catÃ¡logo."
        );
    }

    /*
     * IMPORTANTE:
     * Para poder mostrar el carrito no bloqueamos el medicamento
     * solamente porque el estado local sea diferente.
     *
     * El backend volverÃ¡ a validar el stock al crear el pedido.
     */

    return item;
}


// ============================================================
// Validar cantidad
// ============================================================

export function cantidadValida(cantidad) {

    if (
        typeof cantidad !== "number" ||
        !Number.isInteger(cantidad) ||
        cantidad < 1 ||
        cantidad > MAX_CANTIDAD
    ) {
        throw new Error(
            `La cantidad debe estar entre 1 y ${MAX_CANTIDAD}.`
        );
    }

    return cantidad;
}


// ============================================================
// Validar lÃ­neas del carrito
// ============================================================

function validarLineas(lineas) {

    if (!Array.isArray(lineas)) {
        throw new Error("El pedido local no es vÃ¡lido.");
    }

    const ids = new Set();

    for (const linea of lineas) {

        if (!linea) {
            throw new Error("El pedido local no es vÃ¡lido.");
        }

        const id = Number(linea.id);

        if (!Number.isInteger(id) || id <= 0) {
            throw new Error("El ID del medicamento no es vÃ¡lido.");
        }

        if (ids.has(id)) {
            throw new Error("Hay medicamentos duplicados en el pedido.");
        }

        medicamento(id);

        cantidadValida(Number(linea.cantidad));

        ids.add(id);
    }
}


// ============================================================
// Leer estado del carrito
// ============================================================

export function leerEstado(storage) {

    const raw = storage.getItem(STORAGE_KEY);

    if (raw === null) {

        return {
            version: 1,
            borrador: [],
            confirmados: []
        };
    }

    try {

        const estado = JSON.parse(raw);

        if (
            !estado ||
            estado.version !== 1 ||
            !Array.isArray(estado.borrador) ||
            !Array.isArray(estado.confirmados)
        ) {
            throw new Error();
        }

        validarLineas(estado.borrador);

        return {
            version: 1,
            borrador: estado.borrador.map(item => ({
                id: Number(item.id),
                cantidad: Number(item.cantidad)
            })),
            confirmados: estado.confirmados
        };

    } catch {

        throw new Error(
            "Los datos del carrito no son vÃ¡lidos."
        );
    }
}


// ============================================================
// Actualizar carrito
// ============================================================

export function actualizarPedido(
    storage,
    accion,
    id,
    cantidad
) {

    const estado = leerEstado(storage);

    const numericId = Number(id);

    if (
        ["agregar", "cantidad", "eliminar"].includes(accion)
    ) {

        if (
            typeof id !== "number" ||
            !Number.isInteger(id) ||
            id <= 0
        ) {
            throw new Error("El ID del medicamento no es válido.");
        }

        medicamento(numericId);

        const linea = estado.borrador.find(
            item => Number(item.id) === numericId
        );

        // -----------------------------
        // AGREGAR
        // -----------------------------

        if (accion === "agregar") {

            const nuevaCantidad =
                Number(linea?.cantidad || 0) + 1;

            cantidadValida(nuevaCantidad);

            if (linea) {

                linea.cantidad = nuevaCantidad;

            } else {

                estado.borrador.push({
                    id: numericId,
                    cantidad: 1
                });
            }
        }


        // -----------------------------
        // CAMBIAR CANTIDAD
        // -----------------------------

        else if (accion === "cantidad") {

            if (!linea) {
                throw new Error(
                    "El medicamento no estÃ¡ en el carrito."
                );
            }

            linea.cantidad =
                cantidadValida(cantidad);
        }


        // -----------------------------
        // ELIMINAR
        // -----------------------------

        else if (accion === "eliminar") {

            estado.borrador =
                estado.borrador.filter(
                    item => Number(item.id) !== numericId
                );
        }

    }


    // ========================================================
    // VACIAR
    // ========================================================

    else if (accion === "vaciar") {

        estado.borrador = [];
    }


    // ========================================================
    // CONFIRMAR LOCAL
    // ========================================================

    else if (accion === "confirmar") {

        if (!estado.borrador.length) {

            throw new Error(
                "Agrega medicamentos antes de confirmar."
            );
        }

        estado.confirmados.push({

            id:
                `LOCAL-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,

            fecha:
                new Date().toISOString(),

            totalUnidades:
                totalUnidades(estado.borrador),

            estado:
                "Pedido local de prueba",

            medicamentos:
                estado.borrador.map(linea => ({
                    ...medicamento(linea.id),
                    cantidad: linea.cantidad
                }))
        });

        estado.borrador = [];
    }


    else {

        throw new Error(
            "AcciÃ³n no vÃ¡lida."
        );
    }


    // ========================================================
    // Guardar
    // ========================================================

    try {

        storage.setItem(
            STORAGE_KEY,
            JSON.stringify(estado)
        );

    } catch {

        throw new Error(
            "No se pudo guardar el carrito."
        );
    }

    return estado;
}


// ============================================================
// Total de unidades
// ============================================================

export const totalUnidades = lineas => {

    if (!Array.isArray(lineas)) {
        return 0;
    }

    return lineas.reduce(
        (total, linea) =>
            total + Number(linea.cantidad || 0),
        0
    );
};


