# Matriz de trazabilidad y aceptación

**Fecha:** 2026-11-07 · **Versión:** 1.0.0 · **Suite:** Node.js Test Runner en Windows, Edge headless cuando aplica.

| Requisito | Suite/verificación | Estado comprobado | Límite |
|---|---|---|---|
| Registro de usuarios | `auth-user-characterization.test.cjs`, `frontend.test.cjs` | Aprobado | Backend/almacenamiento simulado |
| Inicio de sesión y JWT | `auth-user-characterization.test.cjs`, `api-contracts.test.cjs` | Aprobado | Tokens ficticios; JWT vencido cubierto por contrato |
| Permisos de administrador | `admin-contracts.test.cjs`, `api-contracts.test.cjs` | Aprobado | Repositorios simulados |
| Consulta y búsqueda de medicamentos | `medication-layer.test.cjs`, `frontend.test.cjs` | Aprobado | Catálogo del browser fixture |
| Agregar/eliminar carrito | `pedido-temporal.test.cjs`, `frontend.test.cjs` | Aprobado | Persistencia local del navegador |
| Validación de cantidades | `pedido-temporal.test.cjs`, `order-service-characterization.test.cjs`, `frontend.test.cjs` | Aprobado | Capa de datos simulada |
| Confirmación de pedidos | `order-service-characterization.test.cjs`, `frontend.test.cjs` | Aprobado en pruebas | No se creó pedido en base real |
| Historial | `api-contracts.test.cjs`, `frontend.test.cjs` | Aprobado en contratos/UI | Sin PostgreSQL real |
| Validación de formularios | `frontend.test.cjs` | Aprobado | Registro y pago de prueba |
| Errores de API | `api-contracts.test.cjs`, `cors.test.cjs`, `frontend.test.cjs` | Aprobado | Respuestas controladas |
| Integridad de datos | `pedido-temporal.test.cjs`, `order-service-characterization.test.cjs`, `order-repository-idempotency.test.cjs`, `repository-layer.test.cjs`, `database-public-scripts.test.cjs` | Aprobado en lógica/transacción simulada | Integridad transaccional PostgreSQL real pendiente |
| Protección de rutas privadas | `frontend.test.cjs`, `api-contracts.test.cjs` | Aprobado | Verificación de navegador y middleware con JWT ficticio |
| Integración frontend/backend | `frontend.test.cjs`, `api-contracts.test.cjs` | Parcial/aprobado con fixtures | No es integración con backend y PostgreSQL desplegados |
| Expiración de sesiones | `auth-user-characterization.test.cjs`, `api-contracts.test.cjs`, `frontend.test.cjs` | Aprobado | No cubre expiración real en producción |
| Prevención de pedidos duplicados | `frontend.test.cjs`, `api-contracts.test.cjs`, `order-service-characterization.test.cjs`, `order-repository-idempotency.test.cjs` | Clave persistente implementada y contratos/transacciones simuladas aprobados | Falta comprobar índice, concurrencia y replay en PostgreSQL aislado |
| Accesibilidad teclado | `EV-ACC-001.txt` | Aprobado | Inicio |
| Foco visible | `EV-ACC-002.txt` | Aprobado | Inicio; estilo presente |
| Etiquetas y mensajes | `EV-ACC-003.txt` | Aprobado | Formulario de registro |
| Contraste | `EV-ACC-004.txt` | Aprobado | Texto del buscador de inicio; no auditoría de todos los componentes |
| Encabezados HTML | `EV-ACC-005.txt` | Aprobado | Página de inicio |
| Textos alternativos | `EV-ACC-006.txt` | Aprobado | Imágenes de inicio |
| Zoom/diseño adaptable | `EV-ACC-007.txt` | Aprobado | Viewport a 320 px en inicio |

La regresión Fase 3 ejecutó 225 pruebas: 225 aprobadas, 0 fallidas y 0 omitidas. Cobertura de `backend/src/` medida con Node Test Runner: 89,75 % líneas, 80,27 % ramas y 78,72 % funciones. La validación no equivale a integración con PostgreSQL real.
