
const fs = require("fs/promises");
const path = require("path");
const adminRepository = require("../repositories/admin.repository");
const { validarEstadoPedido } = require("../validators/admin.validator");

const UPLOAD_DIR = path.resolve(__dirname, "../../private_uploads");

async function listarPedidos() {
    return adminRepository.pedidos();
}

async function actualizarEstadoPedido(idEntrada, estadoEntrada) {
    const { id, estado } = validarEstadoPedido(idEntrada, estadoEntrada);
    return adminRepository.estadoPedido(id, estado);
}

async function listarCuentas() {
    return adminRepository.listarCuentas();
}

async function buscarCuentaParaEliminar(idEntrada) {
    const id = Number(idEntrada);

    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("El identificador de la cuenta no es válido.");
    }

    return adminRepository.buscarCuentaParaEliminar(id);
}

async function eliminarCuenta(idEntrada, idAdministrador) {
    const id = Number(idEntrada);
    const adminId = Number(idAdministrador);

    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("El identificador de la cuenta no es válido.");
    }

    if (!Number.isSafeInteger(adminId) || adminId <= 0) {
        throw new Error("No se pudo identificar al administrador.");
    }

    if (id === adminId) {
        const error = new Error("No puedes eliminar tu propia cuenta.");
        error.code = "CUENTA_PROPIA";
        throw error;
    }

    const resultado = await adminRepository.eliminarCuenta(id);

    // Los registros ya se eliminaron en la transacción.
    // Ahora se intenta retirar cada archivo físico de forma segura.
    for (const nombre of resultado.archivosFormula) {
        if (
            typeof nombre !== "string" ||
            path.basename(nombre) !== nombre ||
            !/^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i.test(nombre)
        ) {
            console.error("Nombre de archivo de fórmula no válido; se omite.");
            continue;
        }

        const ruta = path.resolve(UPLOAD_DIR, nombre);

        if (!ruta.startsWith(UPLOAD_DIR + path.sep)) {
            console.error("Ruta fuera del directorio de fórmulas; se omite.");
            continue;
        }

        try {
            await fs.unlink(ruta);
        } catch (error) {
            if (error.code !== "ENOENT") {
                // La cuenta ya fue eliminada; registrar el archivo pendiente
                // de limpieza sin convertir la respuesta en un falso fracaso.
                console.error("No se pudo eliminar un archivo de fórmula:", error.message);
            }
        }
    }

    return { id: resultado.id };
}

module.exports = {
    listarPedidos,
    actualizarEstadoPedido,
    listarCuentas,
    buscarCuentaParaEliminar,
    eliminarCuenta
};
