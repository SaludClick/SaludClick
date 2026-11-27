import { checkAuthGuard, initAuth } from "./auth.js";
import { apiFetch } from "./api.js";

if (checkAuthGuard()) {
  document.addEventListener("DOMContentLoaded", async () => {
    initAuth();

    const tabla = document.getElementById("tablaHistorial");
    const search = document.getElementById("buscarHistorial");
    const filter = document.getElementById("estadoHistorial");
    const refresh = document.getElementById("recargarHistorial");
    let orders = [];
    let loading = false;
    let detailVersion = 0;
    let detailTrigger;


    if (!tabla) {
      return;
    }

    // =================================================
    // FORMATO DE DINERO
    // =================================================

    function formatoDinero(valor) {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(Number(valor) || 0);
    }

    // =================================================
    // FORMATO DE FECHA
    // =================================================

    function formatoFecha(fecha) {
      if (!fecha) {
        return "Sin fecha";
      }

      const fechaObjeto = new Date(fecha);

      if (Number.isNaN(fechaObjeto.getTime())) {
        return fecha;
      }

      return fechaObjeto.toLocaleString("es-CO", {
        dateStyle: "short",
        timeStyle: "short",
      });
    }

    // =================================================
    // TEXTO DEL ESTADO
    // =================================================

    function textoEstado(estado) {
      const estadoNormalizado = String(estado || "").toUpperCase();

      const estados = {
        APROBADA: "Aprobada",
        APROBADO: "Aprobado",
        PENDIENTE: "Pendiente",
        CANCELADA: "Cancelada",
        CANCELADO: "Cancelado",
        RECHAZADA: "Rechazada",
        RECHAZADO: "Rechazado",
        ENTREGADA: "Entregada",
        ENTREGADO: "Entregado",
      };

      return estados[estadoNormalizado] || estado || "Sin estado";
    }

    // =================================================
    // CLASE DEL ESTADO
    // =================================================

    function claseEstado(estado) {
      const estadoNormalizado = String(estado || "").toUpperCase();

      if (
        estadoNormalizado === "APROBADA" ||
        estadoNormalizado === "APROBADO"
      ) {
        return "estado-aprobado";
      }

      if (estadoNormalizado === "PENDIENTE") {
        return "estado-pendiente";
      }

      if (
        estadoNormalizado === "CANCELADA" ||
        estadoNormalizado === "CANCELADO" ||
        estadoNormalizado === "RECHAZADA" ||
        estadoNormalizado === "RECHAZADO"
      ) {
        return "estado-cancelado";
      }

      return "";
    }

    // =================================================
    // CREAR MODAL
    // =================================================

    function crearModal() {
      if (document.getElementById("modalDetallePedido")) {
        return;
      }

      const modal = document.createElement("div");

      modal.id = "modalDetallePedido";
      modal.className = "modal-pedido";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "modalPedidoTitulo");

      modal.innerHTML = `
        <div class="modal-pedido-contenido">

          <button
            type="button"
            class="modal-pedido-cerrar"
            id="cerrarModalPedido"
            aria-label="Cerrar"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="modal-pedido-header">
            <div class="modal-pedido-icon">
              <i class="fa-solid fa-receipt"></i>
            </div>

            <div>
              <h2 id="modalPedidoTitulo">Detalle del pedido</h2>
              <p id="modalPedidoSubtitulo"></p>
            </div>
          </div>

          <div id="modalPedidoContenido">
            Cargando...
          </div>

        </div>
      `;

      document.body.appendChild(modal);

      document
        .getElementById("cerrarModalPedido")
        .addEventListener("click", cerrarModal);

      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          cerrarModal();
        }
      });
    }

    function abrirModal() {
      const modal = document.getElementById("modalDetallePedido");

      if (modal) {
        detailTrigger = document.activeElement;
        modal.classList.add("activo");
        document.getElementById("cerrarModalPedido").focus();
        document.body.classList.add("modal-abierto");
      }
    }

    function cerrarModal() {
      const modal = document.getElementById("modalDetallePedido");

      if (modal) {
        if (!modal.classList.contains("activo")) return;
        detailVersion++;
        modal.classList.remove("activo");
        detailTrigger?.focus();
        document.body.classList.remove("modal-abierto");
      }
    }

    // =================================================
    // VER DETALLE
    // =================================================

    async function verDetallePedido(pedido) {
      crearModal();

      const contenido = document.getElementById("modalPedidoContenido");
      const titulo = document.getElementById("modalPedidoTitulo");
      const subtitulo = document.getElementById("modalPedidoSubtitulo");

      titulo.textContent = `Pedido #${pedido.id}`;
      subtitulo.textContent = formatoFecha(pedido.fecha);

      contenido.innerHTML = `
        <div class="detalle-cargando">
          <i class="fa-solid fa-spinner fa-spin"></i>
          Cargando detalles...
        </div>
      `;

      abrirModal();
      const version = ++detailVersion;

      try {
        const respuesta = await apiFetch(`/api/pedidos/${pedido.id}`);
        if (version !== detailVersion) return;

        const detalle = Array.isArray(respuesta.pedido)
          ? respuesta.pedido
          : [];

        if (!detalle.length) {
          contenido.innerHTML = `
            <div class="detalle-vacio">
              <i class="fa-solid fa-circle-info"></i>
              <p>No se encontraron medicamentos para este pedido.</p>
            </div>
          `;

          return;
        }

        let total = 0;

        const medicamentosHTML = detalle
          .map((item) => {
            const cantidad = Number(item.cantidad) || 0;

            const precio =
              Number(
                item.precio ??
                  item.precio_unitario ??
                  item.price ??
                  item.price_unit
              ) || 0;

            const subtotal =
              Number(item.subtotal) || precio * cantidad;

            total += subtotal;

            return `
              <div class="detalle-medicamento">
                <div class="detalle-medicamento-info">
                  <strong>${escapeHTML(item.nombre || "Medicamento")}</strong>
                  <span>Cantidad: ${cantidad}</span>
                </div>

                <div class="detalle-medicamento-precio">
                  ${formatoDinero(subtotal)}
                </div>
              </div>
            `;
          })
          .join("");

        contenido.innerHTML = `
          <div class="detalle-resumen">

            <div class="detalle-dato">
              <span>Estado</span>
              <strong class="${claseEstado(pedido.estado)}">
                ${escapeHTML(textoEstado(pedido.estado))}
              </strong>
            </div>

            <div class="detalle-dato">
              <span>Fecha</span>
              <strong>${escapeHTML(formatoFecha(pedido.fecha))}</strong>
            </div>

          </div>

          <p>
            Pago: ${escapeHTML(textoEstado(detalle[0].pago_estado))}
            ${detalle[0].referencia ? ' · Referencia: ' + escapeHTML(detalle[0].referencia) : ''}
          </p>
          <h3 class="detalle-titulo">
            Medicamentos
          </h3>

          <div class="detalle-medicamentos">
            ${medicamentosHTML}
          </div>

          <div class="detalle-total">
            <span>Total de la compra</span>
            <strong>${formatoDinero(pedido.total ?? total)}</strong>
          </div>
        `;
      } catch {
        if (version !== detailVersion) return;

        contenido.innerHTML = `
          <div class="detalle-error">
            <i class="fa-solid fa-circle-exclamation"></i>
            <p>No fue posible consultar los detalles del pedido.</p>
          </div>
        `;
      }
    }

    // =================================================
    // ESCAPAR HTML
    // =================================================

    function escapeHTML(valor) {
      return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    // =================================================
    // ELIMINAR PEDIDO
    // =================================================

    async function eliminarPedido(pedido) {
      const confirmar = window.confirm(
        `¿Estás seguro de que deseas eliminar el pedido #${pedido.id}?\n\nEsta acción no se puede deshacer.`
      );

      if (!confirmar) {
        return;
      }

      try {
        await apiFetch(`/api/pedidos/${pedido.id}`, {
          method: "DELETE",
        });

        alert(`El pedido #${pedido.id} fue eliminado correctamente.`);

        await cargarHistorial();
      } catch (error) {
        console.error(
          `Error al eliminar el pedido #${pedido.id}:`,
          error
        );

        alert(
          `No fue posible eliminar el pedido #${pedido.id}.\n\n${error.message}`
        );
      }
    }

    // =================================================
    // CARGAR MEDICAMENTOS RESUMIDOS
    // =================================================

    function showMessage(text, className) {
      tabla.replaceChildren();
      const cell = tabla.insertRow().insertCell();
      cell.colSpan = 5;
      cell.className = className;
      cell.textContent = text;
    }

    function renderOrders() {
      if (loading) return;
      tabla.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase("es");
      const pedidos = orders.filter(pedido =>
        (!filter.value || pedido.estado === filter.value) &&
        (!query || `#${pedido.id} ${pedido.medicamentos_resumen || ""}`.toLocaleLowerCase("es").includes(query))
      );
      if (!pedidos.length) {
        showMessage(orders.length ? "No hay pedidos que coincidan con los filtros." : "No tienes pedidos registrados todavía.", "historial-vacio");
        return;
      }
        pedidos.forEach((pedido) => {
          const fila = tabla.insertRow();

          // ID
          const id = fila.insertCell();
          id.textContent = `#${pedido.id}`;

          // MEDICAMENTOS
          const medicamento = fila.insertCell();
          medicamento.textContent = pedido.medicamentos_resumen || "Ver detalles";

          // FECHA
          const fecha = fila.insertCell();
          fecha.textContent = formatoFecha(pedido.fecha);

          // ESTADO
          const estado = fila.insertCell();

          estado.textContent = textoEstado(
            pedido.estado
          );

          estado.className = claseEstado(
            pedido.estado
          );

          // ACCIONES
          const acciones = fila.insertCell();

          acciones.className =
            "historial-acciones";

          acciones.innerHTML = `
            <button
              type="button"
              class="btn-ver-pedido"
              title="Ver detalles"
            >
              <i class="fa-solid fa-eye"></i>
              <span>Ver detalles</span>
            </button>

            <button
              type="button"
              class="btn-eliminar-pedido"
              title="Eliminar pedido"
            >
              <i class="fa-solid fa-trash"></i>
              <span>Eliminar</span>
            </button>
          `;

          const botonVer =
            acciones.querySelector(
              ".btn-ver-pedido"
            );

          const botonEliminar =
            acciones.querySelector(
              ".btn-eliminar-pedido"
            );

          botonVer.addEventListener(
            "click",
            () => verDetallePedido(pedido)
          );

          botonEliminar.addEventListener(
            "click",
            () => eliminarPedido(pedido)
          );
        });
    }

    async function cargarHistorial() {
      if (loading) return;
      loading = refresh.disabled = true;
      tabla.setAttribute("aria-busy", "true");
      search.disabled = filter.disabled = true;
      showMessage("Cargando historial…", "historial-vacio");
      try {
        const { pedidos } = await apiFetch("/api/pedidos");
        if (!Array.isArray(pedidos)) throw new Error("El servidor no devolvió un historial válido.");
        orders = pedidos;
        const selected = filter.value;
        filter.replaceChildren(new Option("Todos", ""));
        for (const estado of new Set(orders.map(pedido => pedido.estado).filter(Boolean))) {
          filter.add(new Option(textoEstado(estado), estado));
        }
        filter.value = [...filter.options].some(option => option.value === selected) ? selected : "";
        loading = false;
        search.disabled = filter.disabled = false;
        renderOrders();
      } catch (error) {
        showMessage(error.message, "historial-error");
      } finally {
        loading = refresh.disabled = false;
        tabla.setAttribute("aria-busy", "false");
      }
    }

    search.addEventListener("input", renderOrders);
    filter.addEventListener("change", renderOrders);
    refresh.addEventListener("click", cargarHistorial);
    crearModal();

    await cargarHistorial();

    // =================================================
    // ACTUALIZAR AL VOLVER A LA PÁGINA
    // =================================================

    window.addEventListener("pageshow", async event => {
      if (event.persisted) await cargarHistorial();
    });

    // ESC PARA CERRAR MODAL
    document.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && document.querySelector("#modalDetallePedido.activo")) {
        event.preventDefault();
        document.getElementById("cerrarModalPedido").focus();
      }
      if (event.key === "Escape") {
        cerrarModal();
      }
    });
  });
}
