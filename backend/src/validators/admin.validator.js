const ESTADOS_PEDIDO = new Set([
    "PENDIENTE",
    "APROBADA",
    "PREPARANDO",
    "LISTA",
    "ENTREGADA",
    "CANCELADA"
]);
const ROLES_CUENTA = new Set([2, 3, 4]);

function errorValidacionCuenta(mensaje) {
    const error = new Error(mensaje);
    error.code = "VALIDACION_CUENTA";
    return error;
}

function validarCrearCuenta(entrada) {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
        throw errorValidacionCuenta("Los datos de la cuenta no son válidos.");
    }

    const nombreCompleto = (
        typeof entrada.nombre === "string" ? entrada.nombre : ""
    ).normalize("NFC").trim().replace(/\s+/gu, " ");
    const correo = (
        typeof entrada.correo === "string" ? entrada.correo : ""
    ).trim().toLowerCase();
    const password = entrada.password;
    const rolId = Number(entrada.rol_id);

    if (!nombreCompleto) {
        throw errorValidacionCuenta("El nombre es obligatorio.");
    }

    const [nombre, ...apellidos] = nombreCompleto.split(" ");
    const apellido = apellidos.join(" ");

    if (nombre.length > 100 || apellido.length > 100) {
        throw errorValidacionCuenta("El nombre completo supera la longitud permitida.");
    }

    if (
        correo.length > 150 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(correo)
    ) {
        throw errorValidacionCuenta("Ingresa un correo electrónico válido.");
    }

    if (typeof password !== "string" || password.length < 8) {
        throw errorValidacionCuenta("La contraseña debe tener al menos 8 caracteres.");
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
        throw errorValidacionCuenta("La contraseña supera la longitud máxima permitida.");
    }

    if (!Number.isInteger(rolId) || !ROLES_CUENTA.has(rolId)) {
        throw errorValidacionCuenta("Selecciona un rol permitido: paciente, farmacia o EPS.");
    }

    return { nombre, apellido, correo, password, rol_id: rolId };
}

function validarEstadoPedido(idEntrada, estadoEntrada) {
    const id = Number(idEntrada);
    const estado = String(estadoEntrada || "");

    if (!Number.isInteger(id) || !ESTADOS_PEDIDO.has(estado)) {
        throw new Error("Datos inválidos.");
    }

    return { id, estado };
}

module.exports = {
    ESTADOS_PEDIDO,
    validarEstadoPedido,
    ROLES_CUENTA,
    validarCrearCuenta
};
