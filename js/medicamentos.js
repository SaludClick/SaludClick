import { checkAuthGuard, initAuth } from "./auth.js";

checkAuthGuard();

document.addEventListener("DOMContentLoaded", () => {
    initAuth();

    // Base de datos local de simulación
    const catalogoMedicamentos = [
        { id: 1, nombre: "Acetaminofén 500mg", categoria: "Analgésico", stock: "Disponible", precio: "$2,500 COP" },
        { id: 2, nombre: "Ibuprofeno 800mg", categoria: "Antiinflamatorio", stock: "Disponible", precio: "$4,800 COP" },
        { id: 3, nombre: "Amoxicilina 500mg", categoria: "Antibiótico", stock: "Bajo Stock", precio: "$12,000 COP" },
        { id: 4, nombre: "Loratadina 10mg", categoria: "Antihistamínico", stock: "Disponible", precio: "$3,200 COP" },
        { id: 5, nombre: "Omeprazol 20mg", categoria: "Antiácido", stock: "Agotado", precio: "$8,500 COP" },
        { id: 6, nombre: "Losartán 50mg", categoria: "Antihipertensivo", stock: "Disponible", precio: "$9,000 COP" }
    ];

    const inputBuscador = document.getElementById("buscadorMedicamentos");
    const contenedorGrid = document.getElementById("gridMedicamentos");

    function renderizarMedicamentos(lista) {
        if (!contenedorGrid) return;
        contenedorGrid.innerHTML = "";

        if (lista.length === 0) {
            contenedorGrid.innerHTML = `
                <div class="col-12 text-center py-5 text-muted">
                    <i class="fa-solid fa-box-open fa-3x mb-3"></i>
                    <p>No se encontraron medicamentos matching con tu búsqueda.</p>
                </div>`;
            return;
        }

        lista.forEach(item => {
            const badgeClass = item.stock === "Disponible" ? "bg-success" : 
                              item.stock === "Bajo Stock" ? "bg-warning text-dark" : "bg-danger";

            const cardHTML = `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card h-100 border-0 shadow-sm rounded-3">
                        <div class="card-body d-flex flex-column justify-content-between p-4">
                            <div>
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <span class="badge ${badgeClass}">${item.stock}</span>
                                    <small class="text-muted">${item.categoria}</small>
                                </div>
                                <h5 class="card-title fw-bold text-success mb-2">${item.nombre}</h5>
                                <p class="card-text text-muted mb-3">Precio aproximado: <strong>${item.precio}</strong></p>
                            </div>
                            <button class="btn btn-outline-success w-100 btn-solicitar" data-id="${item.id}" ${item.stock === 'Agotado' ? 'disabled' : ''}>
                                <i class="fa-solid fa-cart-plus me-2"></i> ${item.stock === 'Agotado' ? 'Sin Stock' : 'Solicitar'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
            contenedorGrid.insertAdjacentHTML("beforeend", cardHTML);
        });

        // Eventos para los botones de solicitar
        document.querySelectorAll(".btn-solicitar").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const med = catalogoMedicamentos.find(m => m.id == id);
                alert(`¡Excelente! Solicitud de ${med.nombre} procesada correctamente.`);
            });
        });
    }

    // Inicializar catálogo completo
    renderizarMedicamentos(catalogoMedicamentos);

    // Evento de búsqueda en vivo
    if (inputBuscador) {
        inputBuscador.addEventListener("input", (e) => {
            const busqueda = e.target.value.toLowerCase().trim();
            const filtrados = catalogoMedicamentos.filter(med => 
                med.nombre.toLowerCase().includes(busqueda) || 
                med.categoria.toLowerCase().includes(busqueda)
            );
            renderizarMedicamentos(filtrados);
        });
    }
});