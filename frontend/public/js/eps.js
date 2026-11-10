
const API_EPS = "http://localhost:3000/api/eps";

const tablaAfiliados = document.getElementById("tablaAfiliados");
const totalAfiliados = document.getElementById("totalAfiliados");
const buscarAfiliado = document.getElementById("buscarAfiliado");
const btnActualizar = document.getElementById("btnActualizar");
const epsMessage = document.getElementById("epsMessage");

let afiliados = [];

// Consultar afiliados desde la API
async function cargarAfiliados() {
    try {
        tablaAfiliados.innerHTML = `
            <tr>
                <td colspan="7">Cargando afiliados...</td>
            </tr>
        `;

        epsMessage.textContent = "";

        const respuesta = await fetch(`${API_EPS}/afiliados`);

        if (!respuesta.ok) {
            throw new Error("No fue posible consultar los afiliados.");
        }

        const datos = await respuesta.json();

        if (!datos.ok) {
            throw new Error("La API no pudo completar la consulta.");
        }

        afiliados = datos.afiliados;

        totalAfiliados.textContent = datos.total;

        mostrarAfiliados(afiliados);

    } catch (error) {
        console.error("Error EPS:", error);

        tablaAfiliados.innerHTML = `
            <tr>
                <td colspan="7">
                    No se pudieron cargar los afiliados.
                </td>
            </tr>
        `;

        totalAfiliados.textContent = "0";
        epsMessage.textContent = error.message;
    }
}

// Mostrar afiliados en la tabla
function mostrarAfiliados(lista) {
    if (lista.length === 0) {
        tablaAfiliados.innerHTML = `
            <tr>
                <td colspan="7">
                    No se encontraron afiliados.
                </td>
            </tr>
        `;
        return;
    }

    tablaAfiliados.innerHTML = lista.map(afiliado => `
        <tr>
            <td>${afiliado.id}</td>
            <td>${escaparHTML(afiliado.documento)}</td>
            <td>
                ${escaparHTML(afiliado.nombres)}
                ${escaparHTML(afiliado.apellidos)}
            </td>
            <td>${escaparHTML(afiliado.telefono)}</td>
            <td>${escaparHTML(afiliado.ciudad)}</td>
            <td>${escaparHTML(afiliado.regimen)}</td>
            <td>${escaparHTML(afiliado.estado)}</td>
        </tr>
    `).join("");
}

// Evitar insertar contenido HTML proveniente de la base de datos
function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caracter]);
}

// Buscar por nombre, apellido o documento
buscarAfiliado.addEventListener("input", () => {
    const texto = buscarAfiliado.value.trim().toLowerCase();

    const resultado = afiliados.filter(afiliado => {
        const nombreCompleto =
            `${afiliado.nombres} ${afiliado.apellidos}`.toLowerCase();

        const documento = String(afiliado.documento ?? "").toLowerCase();

        return nombreCompleto.includes(texto) ||
            documento.includes(texto);
    });

    mostrarAfiliados(resultado);
});

// Actualizar listado
btnActualizar.addEventListener("click", cargarAfiliados);

// Cerrar sesión
document.getElementById("logout")?.addEventListener("click", () => {
    localStorage.removeItem("saludclick_token");
    localStorage.removeItem("saludclick_user");
    window.location.href = "../login.html";
});

// Cargar datos al abrir el módulo
cargarAfiliados();
