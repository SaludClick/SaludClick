import { getToken, getCurrentUser, logout } from "/js/auth.js";
import { apiFetch } from "/js/api.js";

const API_URL = "/api/admin/pacientes";
const PAGE_SIZE = 10;

const elementos = {
    tabla: document.getElementById("patientsTable"),
    busqueda: document.getElementById("patientSearch"),
    resultados: document.getElementById("patientResults"),
    cantidad: document.getElementById("patientCount"),
    pagina: document.getElementById("pageStatus"),
    anterior: document.getElementById("previousPage"),
    siguiente: document.getElementById("nextPage"),
    actualizar: document.getElementById("refreshPatients"),
    formulario: document.getElementById("patientForm"),
    tituloFormulario: document.getElementById("patientFormTitle"),
    enviarFormulario: document.getElementById("patientSubmit"),
    cancelarEdicion: document.getElementById("patientCancelEdit"),
    estadoCampo: document.getElementById("patientStatusField"),
    estado: document.getElementById("patientStatus"),
    mensaje: document.getElementById("patientsMessage"),
    mensajeFormulario: document.getElementById("patientFormMessage")
};

const campos = {
    nombres: document.getElementById("patientFirstNames"),
    apellidos: document.getElementById("patientLastNames"),
    tipo_documento: document.getElementById("patientDocumentType"),
    cedula: document.getElementById("patientDocument")
};

let pacientes = [];
let paginaActual = 1;
let totalPaginas = 0;
let totalPacientes = 0;
let pacienteEditando = null;
let cargando = false;
let guardando = false;
let secuenciaBusqueda = 0;
let temporizadorBusqueda;

function mostrarMensaje(texto, tipo = "info") {
    elementos.mensaje.textContent = texto;
    elementos.mensaje.dataset.tipo = tipo;
    elementos.mensaje.setAttribute("role", tipo === "error" ? "alert" : "status");
    elementos.mensaje.style.display = texto ? "block" : "none";
}

function mostrarMensajeFormulario(texto, tipo = "info") {
    elementos.mensajeFormulario.textContent = texto;
    elementos.mensajeFormulario.dataset.tipo = tipo;
    elementos.mensajeFormulario.setAttribute(
        "role",
        tipo === "error" ? "alert" : "status"
    );
    elementos.mensajeFormulario.hidden = !texto;
}

function crearCelda(texto, clase) {
    const celda = document.createElement("td");
    celda.textContent = String(texto ?? "");
    if (clase) celda.className = clase;
    return celda;
}

function formatearFecha(valor) {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return "Sin fecha";
    return new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium"
    }).format(fecha);
}

function renderizarTabla() {
    elementos.tabla.replaceChildren();

    if (pacientes.length === 0) {
        const fila = document.createElement("tr");
        const celda = crearCelda(
            totalPacientes === 0
                ? "No hay pacientes autorizados registrados."
                : "No se encontraron pacientes para esta búsqueda."
        );
        celda.colSpan = 5;
        fila.appendChild(celda);
        elementos.tabla.appendChild(fila);
        return;
    }

    for (const paciente of pacientes) {
        const fila = document.createElement("tr");
        const nombre = document.createElement("td");
        const nombreCompleto = document.createElement("span");
        nombreCompleto.className = "patient-name";
        nombreCompleto.textContent = `${paciente.nombres} ${paciente.apellidos}`;
        nombre.appendChild(nombreCompleto);
        fila.appendChild(nombre);

        fila.appendChild(crearCelda(
            `${paciente.tipo_documento}: ${paciente.cedula}`
        ));

        const estadoCelda = document.createElement("td");
        const estado = document.createElement("span");
        estado.className = "patient-badge";
        estado.dataset.state = paciente.estado;
        estado.textContent = paciente.estado === "AUTORIZADO"
            ? "Autorizado"
            : "Revocado";
        estadoCelda.appendChild(estado);
        fila.appendChild(estadoCelda);

        fila.appendChild(crearCelda(formatearFecha(paciente.created_at)));

        const acciones = document.createElement("td");
        const editar = document.createElement("button");
        editar.className = "btn-outline";
        editar.type = "button";
        editar.dataset.editar = String(paciente.id);
        editar.setAttribute(
            "aria-label",
            `Editar a ${paciente.nombres} ${paciente.apellidos}`
        );
        editar.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i> Editar';
        acciones.appendChild(editar);
        fila.appendChild(acciones);
        elementos.tabla.appendChild(fila);
    }
}

function actualizarPaginacion() {
    elementos.cantidad.textContent =
        `${totalPacientes} resultado${totalPacientes === 1 ? "" : "s"}`;
    elementos.pagina.textContent =
        `Página ${totalPaginas === 0 ? 0 : paginaActual} de ${totalPaginas}`;
    elementos.anterior.disabled = cargando || guardando || paginaActual <= 1;
    elementos.siguiente.disabled =
        cargando || guardando || totalPaginas === 0 || paginaActual >= totalPaginas;
}

async function cargarPacientes({ restablecerPagina = false } = {}) {
    if (restablecerPagina) paginaActual = 1;

    cargando = true;
    const secuencia = ++secuenciaBusqueda;
    elementos.actualizar.disabled = true;
    elementos.resultados.textContent = "Cargando pacientes...";
    mostrarMensaje("");
    actualizarPaginacion();

    const consulta = new URLSearchParams({
        page: String(paginaActual),
        limit: String(PAGE_SIZE),
        busqueda: elementos.busqueda.value.trim()
    });

    try {
        const datos = await apiFetch(`${API_URL}?${consulta}`);
        if (secuencia !== secuenciaBusqueda) return false;
        if (!Array.isArray(datos.pacientes) || !datos.paginacion) {
            throw new Error("La respuesta del servidor no tiene el formato esperado.");
        }

        pacientes = datos.pacientes;
        paginaActual = datos.paginacion.pagina;
        totalPaginas = datos.paginacion.totalPaginas;
        totalPacientes = datos.paginacion.total;
        elementos.resultados.textContent = totalPacientes
            ? `Mostrando ${pacientes.length} de ${totalPacientes} pacientes.`
            : "No hay resultados para mostrar.";
        renderizarTabla();
        return true;
    } catch (error) {
        if (secuencia !== secuenciaBusqueda) return false;
        pacientes = [];
        totalPacientes = 0;
        totalPaginas = 0;
        elementos.resultados.textContent = "No se pudo cargar el directorio.";
        renderizarTabla();
        mostrarMensaje(error.message || "No se pudo cargar el directorio.", "error");
        return false;
    } finally {
        if (secuencia === secuenciaBusqueda) {
            cargando = false;
            elementos.actualizar.disabled = false;
            actualizarPaginacion();
        }
    }
}

function iniciarEdicion(paciente) {
    pacienteEditando = paciente.id;
    campos.nombres.value = paciente.nombres;
    campos.apellidos.value = paciente.apellidos;
    campos.tipo_documento.value = paciente.tipo_documento;
    campos.cedula.value = paciente.cedula;
    elementos.estado.value = paciente.estado;
    elementos.estadoCampo.hidden = false;
    elementos.estado.disabled = false;
    elementos.tituloFormulario.textContent = "Editar paciente autorizado";
    elementos.enviarFormulario.innerHTML =
        '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Guardar cambios';
    elementos.cancelarEdicion.hidden = false;
    mostrarMensajeFormulario("");
    campos.nombres.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelarEdicion() {
    pacienteEditando = null;
    elementos.formulario.reset();
    elementos.estadoCampo.hidden = true;
    elementos.estado.disabled = true;
    elementos.tituloFormulario.textContent = "Registrar paciente";
    elementos.enviarFormulario.innerHTML =
        '<i class="fa-solid fa-user-plus" aria-hidden="true"></i> Registrar paciente';
    elementos.cancelarEdicion.hidden = true;
    mostrarMensajeFormulario("");
}

async function consultarPaciente(id) {
    try {
        const datos = await apiFetch(`${API_URL}/${encodeURIComponent(id)}`);
        if (!datos.paciente) {
            throw new Error("No se encontró el paciente seleccionado.");
        }
        iniciarEdicion(datos.paciente);
    } catch (error) {
        mostrarMensaje(error.message || "No se pudo consultar el paciente.", "error");
    }
}

async function guardarPaciente(evento) {
    evento.preventDefault();
    if (guardando || !elementos.formulario.reportValidity()) return;

    const datosPaciente = Object.fromEntries(
        Object.entries(campos).map(([nombre, campo]) => [nombre, campo.value.trim()])
    );

    if (pacienteEditando !== null) {
        datosPaciente.estado = elementos.estado.value;
    }

    const editando = pacienteEditando !== null;
    const url = editando
        ? `${API_URL}/${encodeURIComponent(pacienteEditando)}`
        : API_URL;

    guardando = true;
    elementos.enviarFormulario.disabled = true;
    actualizarPaginacion();
    mostrarMensajeFormulario(editando ? "Guardando cambios..." : "Registrando paciente...");

    try {
        const resultado = await apiFetch(url, {
            method: editando ? "PATCH" : "POST",
            body: JSON.stringify(datosPaciente)
        });

        cancelarEdicion();
        const listaActualizada = await cargarPacientes({ restablecerPagina: true });
        const mensajeGuardado = resultado.mensaje || (editando
            ? "Paciente actualizado correctamente."
            : "Paciente registrado correctamente.");
        mostrarMensaje(
            listaActualizada
                ? mensajeGuardado
                : `${mensajeGuardado} No se pudo actualizar el listado; vuelve a intentarlo.`,
            listaActualizada ? "success" : "error"
        );
    } catch (error) {
        mostrarMensajeFormulario(
            error.message || "No se pudo guardar el paciente.",
            "error"
        );
    } finally {
        guardando = false;
        elementos.enviarFormulario.disabled = false;
        actualizarPaginacion();
    }
}

function iniciar() {
    const usuario = getCurrentUser();
    const rol = Number(usuario?.rol_id ?? usuario?.rol);
    if (!getToken() || !usuario) {
        logout();
        return;
    }

    if (rol !== 1) {
        const destinos = {
            2: "/pages/dashboard.html",
            3: "/pages/farmacia.html",
            4: "/pages/eps.html"
        };
        location.replace(destinos[rol] || "/");
        return;
    }

    document.getElementById("adminUserName").textContent =
        usuario.nombre || "Administrador";

    elementos.formulario.addEventListener("submit", guardarPaciente);
    elementos.cancelarEdicion.addEventListener("click", cancelarEdicion);
    elementos.actualizar.addEventListener("click", () => cargarPacientes());
    elementos.anterior.addEventListener("click", () => {
        if (paginaActual > 1) {
            paginaActual -= 1;
            cargarPacientes();
        }
    });
    elementos.siguiente.addEventListener("click", () => {
        if (paginaActual < totalPaginas) {
            paginaActual += 1;
            cargarPacientes();
        }
    });
    elementos.busqueda.addEventListener("input", () => {
        window.clearTimeout(temporizadorBusqueda);
        temporizadorBusqueda = window.setTimeout(
            () => cargarPacientes({ restablecerPagina: true }),
            250
        );
    });
    elementos.tabla.addEventListener("click", (evento) => {
        const boton = evento.target.closest("[data-editar]");
        if (!boton || !elementos.tabla.contains(boton)) return;
        consultarPaciente(boton.dataset.editar);
    });
    document.getElementById("logout").addEventListener("click", logout);
    cargarPacientes();
}

iniciar();
