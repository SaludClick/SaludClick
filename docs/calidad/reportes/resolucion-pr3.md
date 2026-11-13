# Resolución de conflictos del Pull Request #3

Rama de trabajo: `fix/bloqueantes-saludclick`.
Origen incorporado: `origin/main` en `530c30f24a40ceeaa0aca9c3ba727b87e824eb21`.
Primer padre: `f73b76edfdb510c9ed63075dd61c8dec44379530`.

La resolución usa un merge normal con ambos padres. No utiliza squash,
rebase, reemplazos globales ours/theirs ni reescritura de historia. Main no
se modifica ni se fusiona el Pull Request durante esta entrega.

## Los 18 archivos en conflicto

| Archivo | Resolución y funcionalidad conservada |
| --- | --- |
| `backend/prisma/schema.prisma` | Unifica relaciones administrativas, afiliados y pacientes con el catálogo INVIMA; evita fechas duplicadas y conserva los modelos de main. |
| `backend/scripts/importar-catalogo-invima.js` | Conserva parser CSV completo, validación, clasificación e importación idempotente; añade validación CLI sin base y errores de importación saneados. |
| `backend/src/controllers/farmacia.controller.js` | Combina resumen de catálogo con pedidos paginados, inventario y avance concurrente de pedidos pagados. |
| `backend/src/routes/dashboard.routes.js` | Dashboard personal limitado al paciente y dashboard administrativo exclusivo con estadísticas administrativas. |
| `backend/src/routes/farmacia.routes.js` | Conserva verificación y resumen, además de pedidos, inventario y transición de estado con rol farmacia. |
| `backend/src/routes/formula.routes.js` | Conserva carga/consulta de fórmulas propias del paciente; las direcciones administrativas de compatibilidad deniegan revisión clínica. |
| `backend/src/routes/order.routes.js` | Conserva el middleware común de paciente y todos los endpoints personales de pedidos. |
| `backend/tests/api-contracts.test.cjs` | Combina contratos de roles; administración rechazada en rutas clínicas y farmacia/paciente con sus rutas autorizadas. |
| `backend/tests/catalogo-invima.test.cjs` | Une pruebas de parser, CSV, idempotencia, modelos y migración con validación offline y contrato del cliente Prisma. |
| `backend/tests/frontend.test.cjs` | Conserva pruebas de Administrador, EPS, VITALIX, afiliados, pedidos, catálogo, perfil y operación de farmacia. Ajusta fixtures para las rutas y permisos unificados. |
| `backend/tests/repository-layer.test.cjs` | Mantiene la recuperación de un solo uso y añade regresión del documento omitido en perfil. |
| `backend/tests/support/postgres-test-safety.cjs` | Conserva los requisitos de migraciones y las protecciones de destino aislado de ambas ramas; no aplica migraciones. |
| `frontend/public/js/admin-cuentas.js` | Unifica el directorio administrativo y conserva navegación por rol para las direcciones antiguas. |
| `frontend/public/js/admin.js` | Mantiene la entrada al panel administrativo actual, sin restaurar controles de pedidos/fórmulas farmacéuticas. |
| `frontend/public/js/auth.js` | Conserva destino seguro, permisos por pantalla, JSON de sesión controlado y actualización que respeta el almacenamiento temporal. |
| `frontend/public/js/farmacia.js` | Combina operaciones de pedidos e inventario con resumen y consulta del catálogo, sin listeners duplicados sobre los mismos controles. |
| `frontend/public/js/login.js` | Utiliza la política central de roles y valida el destino pendiente antes de navegar; EPS mantiene su panel propio. |
| `frontend/src/components/Chat.jsx` | Mantiene VITALIX público y soporte administrativo; extrae el chat humano de farmacia a un componente y ruta privados propios. |

## Consolidaciones necesarias fuera de los bloques de conflicto

- La página HTML operativa de farmacia se traslada a
  `frontend/src/components/FarmaciaOperaciones.astro` y se reutiliza desde
  `frontend/src/pages/pages/farmacia.astro`. Se conservan filtros, tabla,
  paginación y transiciones de main, además del resumen de la otra rama.
  Evita dos fuentes generando `/pages/farmacia.html`.
- `frontend/src/components/FarmaciaChat.jsx` conserva las conversaciones,
  mensajes, indicadores y Socket.IO del chat humano de main. Reintenta unirse
  a la conversación cuando el socket llega a estar conectado.
- `frontend/src/pages/pages/chat-farmacia.astro` ofrece el chat humano solo a
  paciente y farmacia. `/pages/chat.html` sigue siendo VITALIX público.
- `frontend/public/js/roles.js` centraliza permisos de los cuatro roles y
  distingue chat humano, soporte administrativo, páginas de afiliados y EPS.
- Se preservan las correcciones de perfil de main: documento omitido no se
  borra, el documento enviado se guarda y el correo se presenta de solo lectura.
- Se preservan respuestas de API en JSON, límite de tamaño y errores seguros.
- Las rutas administrativas bloquean explícitamente citas, medicamentos,
  inventario, pedidos y fórmulas clínicas. El canal administrativo mantiene
  solicitudes, usuarios, notificaciones, informes, auditoría y configuración.

## Comprobaciones

Resultado final de la resolución:

| Comprobación | Resultado |
| --- | --- |
| Suite backend sin navegador | 385 aprobadas, 0 fallidas |
| Suite completa Edge | 50 aprobadas, 0 fallidas |
| Motor VITALIX y resumen frontend | 6 aprobadas, 0 fallidas |
| Prisma validate | Esquema válido |
| Astro build | Compilación correcta; 9 páginas Astro generadas, además de HTML público |
| Astro check | 0 errores y 0 advertencias; una sugerencia histórica por variable sin uso |
| Validación INVIMA offline | 1.000 referencias válidas, sin conexión de datos |
| Arranque backend aislado | HTTP y ambos canales Socket.IO comprobados, sin PostgreSQL real |
| Revisión del índice | Sin marcadores ni coincidencias de información sensible |

Las primeras ejecuciones detectaron diferencias de expectativas y preparación
de fixtures entre las suites antiguas: rol activo tras probar afiliados,
respuestas de dashboard frente a pedidos y selección de rol al iniciar sesión.
Se corrigieron los fixtures sin relajar los permisos. La prueba de chat humano
usa entrada de teclado real a través de DevTools para respetar el estado React.
La ejecución final se realizó después de terminar la compilación para evitar
leer páginas generadas mientras se reemplaza `dist`.

- Prisma válido y compilación Astro con login y ambas páginas de chat.
- Backend probado en puerto efímero con PostgreSQL sustituido en memoria;
  comprueba HTTP, salud y los dos canales Socket.IO sin tocar servidores previos.
- Pruebas HTTP de rol administrador bloqueado antes del acceso a datos.
- Regresiones de paciente, farmacia y EPS, incluyendo avance de pedidos con
  pago aprobado y control de concurrencia.
- Pruebas de navegador con perfil temporal y fixtures, incluyendo ambos chats,
  administración, farmacia, perfil y navegación por rol.
- `catalogo:validar` comprueba las 1.000 referencias sin abrir PostgreSQL.
- Las suites PostgreSQL que escriben fixtures o aplican migraciones no se
  ejecutan: hacerlo contradiría la restricción explícita de esta entrega.

No se ejecutan migraciones, importaciones, restauraciones ni cambios de cuenta.
Los informes privados, archivos de entorno, datos de afiliados y artefactos
locales permanecen excluidos. La habilitación de las tablas administrativas
sigue pendiente de la autorización operativa correspondiente.
