# Solicitudes como chat administrativo

> Actualización posterior: la conexión automática del campo principal de VITALIX y las pruebas reales con PostgreSQL aislado ya se completaron. Véase [el informe de integración automática](vitalix-solicitudes-notificaciones-automaticas.md). Las referencias a autorización pendiente y al flujo de atención manual más abajo describen el estado anterior.

Fecha: 2026-11-12. Se conservan los cambios de las solicitudes anteriores. Esta intervención no accede a la base real ni modifica los módulos clínicos, de Farmacia o EPS. No se hicieron commit ni push.

## Flujo implementado

VITALIX llama a POST /api/administrativo/conversacion al solicitar atención humana. El servidor abre o recupera una conversación del cliente autenticado, priorizando las abiertas y conservando los registros históricos existentes. Si la última conversación está cerrada o resuelta, esa petición explícita la reabre. El cliente es llevado directamente a su chat dentro de Solicitudes. No se transmite el historial local del bot.

La apertura utiliza un bloqueo transaccional de PostgreSQL por cliente y aislamiento READ COMMITTED. La consulta ocurre después del bloqueo, de manera que un reintento o una petición concurrente puede recuperar el registro ya confirmado. La ruta antigua de creación reutiliza la misma operación y no vuelve a insertar el mensaje inicial cuando recupera una conversación existente. No se necesita una nueva tabla, columna, índice ni migración para el funcionamiento del chat.

Las conversaciones históricas independientes no se fusionan ni se eliminan. Siguen siendo accesibles en la bandeja con sus mensajes originales.

## Interfaz

- Izquierda: clientes, último mensaje, fecha, estado, mensajes nuevos, búsqueda, bandejas pendientes/atendidas y paginación.
- Derecha: conversación elegida, responsable, estado, historial cronológico y autores con fecha y hora.
- Abajo: campo de mensaje, envío con Enter y salto de línea con Mayús+Enter.
- El administrador puede asignar responsable, marcar atendida, cerrar y reabrir. El cliente puede reabrir su propia conversación.
- Los mensajes anteriores se incorporan antes de los ya visibles, sin sustituir la página más reciente.
- Los eventos actualizan la bandeja y los mensajes sin reemplazar el campo de edición. Los borradores se conservan al cambiar de conversación y ante errores de envío.
- En móviles la lista y el chat alternan mediante el botón Volver; no se añade Mensajería al menú.
- Se conserva sondeo periódico como alternativa cuando Socket.IO no está conectado.

## Seguridad y tiempo real

Se reutiliza el namespace /administrativo de Socket.IO. Los sockets se autentican mediante el guard existente que verifica JWT y estado/rol actuales en PostgreSQL. Cada socket entra exclusivamente en la sala de administradores o en la sala correspondiente a su cliente. No existe un evento de ingreso a salas elegido por el navegador.

Las invalidaciones sólo contienen el identificador de conversación, dirigido a administradores y propietario. Los textos de los mensajes se consultan por HTTP, volviendo a verificar sesión y propiedad. Los clientes ajenos no reciben esas invalidaciones. Farmacia y EPS no acceden al namespace administrativo. Las sesiones se desconectan al expirar su JWT.

Los endpoints de detalle, envío, lectura y reapertura comprueban propiedad. El administrador no puede crear conversaciones haciéndose pasar por un cliente. La lectura de mensajes de otra conversación devuelve 404 y no modifica registros. Las respuestas mantienen el control de responsable existente. Se conservan notificaciones y auditorías internas.

## Archivos principales

| Archivo | Cambio |
| --- | --- |
| frontend/src/components/AdministrativeSupport.jsx | Apertura/recuperación desde VITALIX, estado de apertura y errores. |
| frontend/public/js/administrative-chat.js | Nueva interfaz y ciclo de actualización del chat, borradores e historial. |
| frontend/public/css/administrative-chat.css | Diseño de dos paneles y adaptación a móviles. |
| frontend/public/js/administrative.js | Integra el chat en Solicitudes y conecta eventos/reconexión/sondeo. |
| frontend/public/pages/admin.html y soporte.html | Estilos del chat; soporte centralizado en Solicitudes. |
| backend/src/repositories/administrative.repository.js | Apertura idempotente, recuperación histórica, reapertura, bandejas y comprobación de propiedad al marcar lectura. |
| backend/src/controllers/administrative.controller.js | Endpoints nuevos y metadatos privados de invalidación, excluidos de la respuesta HTTP. |
| backend/src/routes/administrative.routes.js e index.js | Rutas de conversación/reapertura y comunicación con Socket.IO. |
| backend/src/sockets/administrative.socket.js | Invalidaciones por salas autorizadas. |
| backend/src/validators/administrative.validator.js | Validación de bandejas pendientes/atendidas. |

## Validación ejecutada

- 399 pruebas aisladas de backend aprobadas. Incluyen cinco nuevas pruebas de recuperación, reintentos, reapertura, propiedad, filtros y eventos privados.
- Las pruebas administrativas de navegador aprobaron el flujo desde VITALIX, doble clic sin conversación duplicada, intercambio de mensajes, autores/cronología, asignación, cierre/reapertura, adaptación a 320/390 px, eventos con borrador y error de envío con conservación del texto.
- Compilación del frontend aprobada. Astro check: cero errores y cero advertencias; queda una sugerencia previa por una variable no usada en dashboard.js, fuera de este cambio.
- Batería general de navegador: 53 pruebas aprobadas, incluidas las comprobaciones de clientes, Farmacia, EPS y restricciones de roles; sin excepciones JavaScript propias.

## Prueba PostgreSQL aislada pendiente de preparación autorizada

Se encontró el contenedor local preexistente saludclick-afiliados-validate-20261111, PostgreSQL 17 en 127.0.0.1:55434/saludclick_test. Se inició y se comprobó su esquema mediante SELECT. Tiene usuarios, pero no las seis tablas administrative_*. No se crearon tablas ni se aplicaron migraciones.

La autorización para cargar exclusivamente el esquema existente en esa base aislada se solicitó al usuario y permanece pendiente. Hasta obtenerla no debe ejecutarse el modo --prepare-schema. La prueba contra PostgreSQL real aislado NO se da por aprobada.

Quedaron preparados:

- tests/administrative-chat.isolated.cjs: ocho aperturas concurrentes, persistencia, identidad/orden, notificaciones, lectura, aislamiento entre clientes, recuperación tras recrear repositorio, cierre/reapertura, recuperación de historial de 105 mensajes y Socket.IO real con rechazo de otros roles y ausencia de eventos ajenos.
- tests/support/administrative-socket-client.cjs: cliente de prueba del transporte websocket real de Socket.IO, sin dependencias nuevas.
- tests/run-administrative-chat-isolated.cjs: exige el contenedor local exacto, base y puerto permitidos, oculta las credenciales y nunca carga backend/.env. Sin --prepare-schema se detiene si falta el esquema. Sólo el modo explícito y autorizado carga la migración administrativa existente en la base de pruebas; no crea una migración nueva ni conecta a la base real.

Una vez autorizado el esquema aislado, se puede ejecutar desde backend:

```powershell
node tests/run-administrative-chat-isolated.cjs --prepare-schema
```

Para repeticiones posteriores con el esquema ya preparado:

```powershell
node tests/run-administrative-chat-isolated.cjs
```

La suite directa también está disponible como npm run test:integration:administrative-chat, con TEST_DATABASE_URL previamente configurada y el esquema de pruebas preparado. La suite directa no ejecuta migraciones. Sus usuarios y mensajes son fixtures exclusivos de la base aislada; no usa cuentas ni conversaciones reales.
