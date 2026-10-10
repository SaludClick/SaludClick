const crypto = require("crypto");

const orderRepository = require("../repositories/order.repository");

// =================================================
// LIMPIAR ITEMS
// =================================================

function limpiarItems(items) {
    if (
        !Array.isArray(items) ||
        !items.length ||
        items.length > 50
    ) {
        throw new Error(
            "El pedido debe contener al menos un medicamento."
        );
    }

    const vistos = new Set();

    return items.map((item) => {
        const medicamento_id = Number(
            item.id ?? item.medicamento_id
        );

        const cantidad = Number(item.cantidad);

        if (
            !Number.isInteger(medicamento_id) ||
            medicamento_id < 1 ||
            !Number.isInteger(cantidad) ||
            cantidad < 1 ||
            cantidad > 99
        ) {
            throw new Error(
                "Los medicamentos o cantidades del pedido no son válidos."
            );
        }

        if (vistos.has(medicamento_id)) {
            throw new Error(
                "No se permiten medicamentos duplicados en el pedido."
            );
        }

        vistos.add(medicamento_id);

        return {
            medicamento_id,
            cantidad
        };
    });
}

// =================================================
// SIMULAR PAGO
// =================================================

function simularPago({
    numero,
    vencimiento,
    cvv,
    titular
}) {
    const digits = String(numero || "")
        .replace(/\D/g, "");

    const exp = String(vencimiento || "").trim();

    const security = String(cvv || "").trim();

    if (
        !titular ||
        !/^\d{16}$/.test(digits) ||
        !/^\d{2}\/\d{2}$/.test(exp) ||
        !/^\d{3,4}$/.test(security)
    ) {
        throw new Error(
            "Completa los datos de la tarjeta de prueba correctamente."
        );
    }

    const month = Number(exp.slice(0, 2));

    if (month < 1 || month > 12) {
        throw new Error(
            "La fecha de vencimiento no es válida."
        );
    }

    // Pasarela 100% simulada.
    // Nunca se almacena el número completo ni el CVV.

    const approved =
        digits === "4242424242424242" ||
        digits === "5555555555554444";

    const marca =
        digits.startsWith("4")
            ? "VISA"
            : digits.startsWith("5")
                ? "MASTERCARD"
                : "TARJETA";

    if (!approved) {
        return {
            estado: "RECHAZADO",
            metodo: "TARJETA",
            marca,
            ultimos_digitos: digits.slice(-4),
            referencia: `SIM-${crypto
                .randomBytes(6)
                .toString("hex")
                .toUpperCase()}`
        };
    }

    return {
        estado: "APROBADO",
        metodo: "TARJETA",
        marca,
        ultimos_digitos: digits.slice(-4),
        referencia: `SIM-${crypto
            .randomBytes(6)
            .toString("hex")
            .toUpperCase()}`
    };
}

// =================================================
// CREAR PEDIDO
// =================================================

async function crearPedido(usuarioId, data) {
    const tipoEntrega =
        data.tipoEntrega === "DOMICILIO"
            ? "DOMICILIO"
            : "RECOGER";

    const direccion =
        String(data.direccion || "").trim();

    if (
        tipoEntrega === "DOMICILIO" &&
        direccion.length < 8
    ) {
        throw new Error(
            "La dirección es obligatoria para domicilio."
        );
    }

    const items = limpiarItems(data.items);

    const meds =
        await orderRepository.listarMedicamentos(
            items.map((i) => i.medicamento_id)
        );

    const mapa = new Map(
        meds.map((m) => [m.id, m])
    );

    if (meds.length !== items.length) {
        throw new Error(
            "Uno de los medicamentos no existe."
        );
    }

    let total = 0;

    const calculados = items.map((item) => {
        const med = mapa.get(
            item.medicamento_id
        );

        if (med.estado !== "DISPONIBLE") {
            throw new Error(
                `${med.nombre} no está disponible.`
            );
        }

        if (med.stock < item.cantidad) {
            throw new Error(
                `Stock insuficiente para ${med.nombre}.`
            );
        }

        const precio = Number(med.precio);

        const subtotal = Number(
            (precio * item.cantidad).toFixed(2)
        );

        total += subtotal;

        return {
            ...item,
            precio,
            subtotal
        };
    });

    total = Number(total.toFixed(2));

    const pago = simularPago(
        data.pago || {}
    );

    if (pago.estado !== "APROBADO") {
        throw new Error(
            `Pago rechazado. Referencia: ${pago.referencia}`
        );
    }

    const result =
        await orderRepository.crearPedidoConPago({
            usuarioId,
            tipoEntrega,
            direccion,
            observaciones: String(
                data.observaciones || ""
            ).trim(),
            items: calculados,
            total,
            pago
        });

    return {
        ...result,
        total,
        pago
    };
}

// =================================================
// ELIMINAR PEDIDO
// =================================================

async function eliminarPedido(
    usuarioId,
    pedidoId
) {
    return await orderRepository.eliminarPedidoUsuario(
        usuarioId,
        pedidoId
    );
}

// =================================================
// EXPORTAR
// =================================================

module.exports = {
    crearPedido,

    listarPedidos:
        orderRepository.listarPedidosUsuario,

    detallePedido:
        orderRepository.detallePedidoUsuario,

    eliminarPedido
};