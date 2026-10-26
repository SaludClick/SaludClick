
import { getToken, getCurrentUser, logout } from "/js/auth.js";
import { apiFetch } from "/js/api.js";

// ============================================
// CONFIGURACIÓN
// ============================================

const API_URL = (
    window.SALUDCLICK_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const CUENTAS_URL = `${API_URL}/api/admin/cuentas`;

const ROLES = {
    ADMIN: 1,
    USUARIO: 2,
    FARMACIA: 3
};

// ============================================
// ELEMENTOS DEL DOM
// ============================================

const tabla = document.getElementById("accountsTable");
const busqueda = document.getElementById("accountSearch");
const filtroTipo = document.getElementById("accountTypeFilter");
const resultados = document.getElementById("accountResults");
const mensaje = document.getElementById("accountsMessage");
const botonActualizar = document.getElementById("refreshAccounts");
const estadisticas = document.getElementById("accountStats");

// ============================================
// ESTADO
// ============================================

let cuentas = [];
let eliminando = false;
let cargando = false;

// ============================================
// UTILIDADES
// ============================================

function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caracter]);
}

function mostrarMensaje(texto, tipo = "info") {
    if (!mensaje) return;

    mensaje.textContent = texto;
    mensaje.dataset.tipo = tipo;
    mensaje.setAttribute("role", tipo === "error" ? "alert" : "status");
    mensaje.style.display = texto ? "block" : "none";
}

function nombreRol(rol) {
    switch (Number(rol)) {
        case ROLES.ADMIN:
            return "Administrador";
        case ROLES.USUARIO:
            return "Usuario";
        case ROLES.FARMACIA:
            return "Farmacia";
        default:
            return "Rol desconocido";
    }
}

function tieneHistorial(cuenta) {
    const solicitudes = Number(cuenta?._count?.solicitudes ?? 0);
    const pagos = Number(cuenta?._count?.pagos ?? 0);

    return solicitudes > 0 || pagos > 0;
}

function obtenerNombre(cuenta) {
    return `${cuenta?.nombre ?? ""} ${cuenta?.apellido ?? ""}`.trim()
        || "Sin nombre";
}

function obtenerNumero(valor) {
    const numero = Number(valor ?? 0);
    return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function escaparTextoBusqueda(valor) {
    return String(valor ?? "").trim().toLocaleLowerCase("es");
}

function crearCelda(texto) {
    const celda = document.createElement("td");
    celda.textContent = String(texto ?? "");
    return celda;
}

// ============================================
// ESTADÍSTICAS
// ============================================

function renderizarEstadisticas(lista) {
    if (!estadisticas) return;

    const usuarios = lista.filter(
        cuenta => Number(cuenta.rol_id) === ROLES.USUARIO
    ).length;

    const farmacias = lista.filter(
        cuenta => Number(cuenta.rol_id) === ROLES.FARMACIA
    ).length;

    const protegidas = lista.filter(tieneHistorial).length;

    estadisticas.replaceChildren();

    const elementos = [
        {
            icono: "fa-users",
            total: lista.length,
            etiqueta: "Total de cuentas"
        },
        {
            icono: "fa-user",
            total: usuarios,
            etiqueta: "Usuarios"
        },
        {
            icono: "fa-prescription-bottle-medical",
            total: farmacias,
            etiqueta: "Farmacias"
        },
        {
            icono: "fa-lock",
            total: protegidas,
            etiqueta: "Cuentas protegidas"
        }
    ];

    for (const elemento of elementos) {
        const tarjeta = document.createElement("article");
        tarjeta.className = "admin-stat";

        const icono = document.createElement("i");
        icono.className = `fa-solid ${elemento.icono}`;
        icono.setAttribute("aria-hidden", "true");

        const total = document.createElement("strong");
        total.textContent = String(elemento.total);

        const etiqueta = document.createElement("span");
        etiqueta.textContent = elemento.etiqueta;

        tarjeta.append(icono, total, etiqueta);
        estadisticas.appendChild(tarjeta);
    }
}

// ============================================
// FILTRADO Y TABLA
// ============================================

function renderizarTabla() {
    if (!tabla || !busqueda || !filtroTipo || !resultados) return;

    const texto = escaparTextoBusqueda(busqueda.value);
    const tipo = filtroTipo.value;

    const filtradas = cuentas.filter(cuenta => {
        const nombre = obtenerNombre(cuenta);

        const contenido = [
            cuenta.id,
            nombre,
            cuenta.correo,
            cuenta.ciudad,
            nombreRol(cuenta.rol_id),
            cuenta.estado
        ].join(" ");

        const coincideTexto = escaparTextoBusqueda(contenido).includes(texto);

        const coincideTipo =
            !tipo || String(cuenta.rol_id) === tipo;

        return coincideTexto && coincideTipo;
    });

    resultados.textContent =
        `${filtradas.length} de ${cuentas.length} cuentas`;

    tabla.replaceChildren();

    if (filtradas.length === 0) {
        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = 8;
        celda.textContent = cuentas.length
            ? "No hay cuentas que coincidan con los filtros."
            : "No se encontraron cuentas.";

        fila.appendChild(celda);
        tabla.appendChild(fila);
        return;
    }

    for (const cuenta of filtradas) {
        const fila = document.createElement("tr");

        const id = Number(cuenta.id);
        const rol = Number(cuenta.rol_id);
        const historial = tieneHistorial(cuenta);
        const permitido = [ROLES.USUARIO, ROLES.FARMACIA].includes(rol);

        fila.appendChild(crearCelda(id));

        const celdaNombre = document.createElement("td");
        const nombre = document.createElement("strong");
        nombre.textContent = obtenerNombre(cuenta);

        const correo = document.createElement("small");
        correo.textContent = cuenta.correo || "Sin correo";

        celdaNombre.append(nombre, document.createElement("br"), correo);
        fila.appendChild(celdaNombre);

        fila.appendChild(crearCelda(nombreRol(rol)));
        fila.appendChild(crearCelda(cuenta.estado || "Sin estado"));
        fila.appendChild(crearCelda(
            obtenerNumero(cuenta._count?.solicitudes)
        ));
        fila.appendChild(crearCelda(
            obtenerNumero(cuenta._count?.pagos)
        ));

        // Se admite tanto un contador numérico como una relación de Prisma.
        const totalFormulas = Array.isArray(cuenta._count?.formulas_medicas)
            ? cuenta._count.formulas_medicas.length
            : obtenerNumero(cuenta._count?.formulas_medicas);

        fila.appendChild(crearCelda(totalFormulas));

        const celdaAccion = document.createElement("td");
        const boton = document.createElement("button");
        boton.type = "button";

        if (!permitido) {
            boton.disabled = true;
            boton.textContent = "No disponible";
        } else if (historial) {
            boton.disabled = true;
            boton.textContent = "Protegida";
            boton.title = "La cuenta tiene pedidos o pagos registrados.";
        } else {
            boton.className = "btn-outline";
            boton.dataset.eliminar = String(id);
            boton.textContent = "Eliminar";
            boton.setAttribute(
                "aria-label",
                `Eliminar cuenta ${obtenerNombre(cuenta)}`
            );

            const icono = document.createElement("i");
            icono.className = "fa-solid fa-trash";
            icono.setAttribute("aria-hidden", "true");

            boton.prepend(icono, document.createTextNode(" "));
        }

        celdaAccion.appendChild(boton);
        fila.appendChild(celdaAccion);
        tabla.appendChild(fila);
    }
}

// ============================================
// CARGAR CUENTAS
// ============================================

async function cargarCuentas() {
    if (cargando) return;

    cargando = true;

    if (botonActualizar) botonActualizar.disabled = true;
    mostrarMensaje("");
    if (resultados) resultados.textContent = "Cargando cuentas...";

    try {
        const datos = await apiFetch(CUENTAS_URL);

        if (!Array.isArray(datos.cuentas)) {
            throw new Error("La respuesta del servidor no tiene el formato esperado.");
        }

        cuentas = datos.cuentas;

        renderizarEstadisticas(cuentas);
        renderizarTabla();
    } catch (error) {
        if (resultados) {
            resultados.textContent = "No se pudieron cargar las cuentas.";
        }

        if (tabla) {
            tabla.replaceChildren();

            const fila = document.createElement("tr");
            const celda = document.createElement("td");

            celda.colSpan = 8;
            celda.textContent = "Error al consultar las cuentas.";

            fila.appendChild(celda);
            tabla.appendChild(fila);
        }

        mostrarMensaje(
            error.message || "Ocurrió un error al consultar las cuentas.",
            "error"
        );
    } finally {
        cargando = false;
        if (botonActualizar) botonActualizar.disabled = false;
    }
}

// ============================================
// ELIMINAR CUENTA
// ============================================

async function solicitarEliminacion(id) {
    if (eliminando || cargando) return;

    const cuenta = cuentas.find(item => Number(item.id) === id);

    if (!cuenta) {
        mostrarMensaje("No se encontró la cuenta seleccionada.", "error");
        return;
    }

    const rol = Number(cuenta.rol_id);

    if (![ROLES.USUARIO, ROLES.FARMACIA].includes(rol)) {
        mostrarMensaje(
            "Solo se pueden eliminar cuentas de usuarios o farmacias.",
            "error"
        );
        return;
    }

    if (tieneHistorial(cuenta)) {
        mostrarMensaje(
            "Esta cuenta tiene pedidos o pagos registrados y está protegida.",
            "error"
        );
        return;
    }

    const nombre = obtenerNombre(cuenta);
    const tipo = nombreRol(rol);

    const confirmar = window.confirm(
        `Vas a eliminar permanentemente esta cuenta:\n\n` +
        `Nombre: ${nombre}\n` +
        `Correo: ${cuenta.correo || "Sin correo"}\n` +
        `Tipo: ${tipo}\n` +
        `ID: ${id}\n\n` +
        "Esta acción no se puede deshacer. ¿Deseas continuar?"
    );

    if (!confirmar) return;

    eliminando = true;
    renderizarTabla();
    mostrarMensaje("Eliminando la cuenta...", "info");

    try {
        const datos = await apiFetch(`${CUENTAS_URL}/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });

        mostrarMensaje(
            datos.mensaje || "La cuenta se eliminó correctamente.",
            "success"
        );

        await cargarCuentas();
    } catch (error) {
        mostrarMensaje(
            error.message || "No fue posible eliminar la cuenta.",
            "error"
        );
    } finally {
        eliminando = false;
        renderizarTabla();
    }
}

// ============================================
// EVENTOS
// ============================================

if (tabla) {
    tabla.addEventListener("click", event => {
        const boton = event.target.closest("[data-eliminar]");

        if (!boton || !tabla.contains(boton)) return;

        const id = Number(boton.dataset.eliminar);

        if (!Number.isSafeInteger(id) || id <= 0) {
            mostrarMensaje("El identificador de la cuenta no es válido.", "error");
            return;
        }

        solicitarEliminacion(id);
    });
}

busqueda?.addEventListener("input", renderizarTabla);
filtroTipo?.addEventListener("change", renderizarTabla);
botonActualizar?.addEventListener("click", cargarCuentas);

// ============================================
// INICIO Y CONTROL DE ACCESO
// ============================================

async function iniciar() {
    if (!tabla || !busqueda || !filtroTipo || !resultados) {
        console.error("No se encontraron los elementos HTML requeridos para administrar cuentas.");
        return;
    }

    const token = getToken();
    const usuario = getCurrentUser();
    const rol = Number(usuario?.rol_id ?? usuario?.rol);

    if (!token || !usuario) {
        logout();
        return;
    }

    if (rol !== ROLES.ADMIN) {
        mostrarMensaje(
            "Esta página solo está disponible para el administrador.",
            "error"
        );

        const principal = document.querySelector("main");

        if (principal) {
            principal.replaceChildren();

            const contenedor = document.createElement("section");
            contenedor.className = "card admin-section";

            const titulo = document.createElement("h1");
            titulo.textContent = "Acceso restringido";

            const texto = document.createElement("p");
            texto.textContent =
                "Tu cuenta no tiene permisos para administrar otras cuentas.";

            const enlace = document.createElement("a");
            enlace.className = "btn-outline";
            enlace.href = "/pages/dashboard";
            enlace.textContent = "Volver al inicio";

            contenedor.append(titulo, texto, enlace);
            principal.appendChild(contenedor);
        }

        return;
    }

    await cargarCuentas();
}

iniciar();
