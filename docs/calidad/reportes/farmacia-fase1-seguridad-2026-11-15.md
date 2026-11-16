# Farmacia — Fase 1: seguridad y errores

Fecha: 2026-11-15. Rama: `integracion/farmacia-pendientes`.
Base: `fafb09852f7ce7c8f097dd4e5f5f6ee6e7aa2a4a`. Cambios locales sin commit ni push.

## Correcciones

- `/api/farmacia/verificar-acceso` ahora exige la misma cuenta activa, rol vigente 3, ID válido y expiración que las demás operaciones de Farmacia.
- Las rutas compartidas de chat y perfil ejecutan esa comprobación solo si la sesión declara Farmacia. Los roles contradictorios se rechazan; Paciente, EPS y el flujo administrativo conservan su contrato anterior.
- El listado del servicio de chat también comprueba el rol y estado actuales. El repositorio exige exactamente `ACTIVO`, y no reclama conversaciones cerradas sin agente. La asignación sigue protegida por una actualización condicional.
- Socket.IO revalida Farmacia al conectar, antes de cada evento y antes de entregarle mensajes o avisos. Comprueba que el agente siga siendo participante de la sala. Desconecta por expiración del JWT, revocación, inactividad o fallo de comprobación; además revisa las conexiones inactivas cada 15 segundos. Esta política nueva se limita a Farmacia.
- El perfil de Farmacia valida nombres y apellidos Unicode de 1–100 caracteres, teléfono de 7–15 dígitos y hasta 20 caracteres, tipo de documento de hasta 10 caracteres, documento alfanumérico con puntos/guiones de hasta 30 y ciudad de hasta 100. Rechaza controles, tipos incorrectos, alias de documento contradictorios y campos fuera de la lista permitida. Los campos opcionales pueden quedar vacíos.
- Rol, estado, correo, contraseña y campos administrativos se rechazan en el perfil de Farmacia. Los fallos de persistencia no publican el mensaje del proveedor. La validación anterior de otros roles no se cambió.
- El dashboard cuenta como disponible únicamente un medicamento con `estado=DISPONIBLE` y `stock>0`. Los contratos de prueba ahora suministran una cuenta vigente y stock explícito; no se retiraron comprobaciones de autorización.
- La página Astro del chat incorpora explícitamente la hoja de estilos del componente React. La compilación incluye el CSS en línea y la navegación vuelve a ser estática en móvil.
- Inicio y login incorporan explícitamente la hoja de estilos existente de VITALIX. No se cambió su lógica, permisos ni mensajes; se restauró la carga de sus estilos específicos.

`FarmaciaChat.jsx` y `farmacia-chat.css` se revisaron sin necesitar cambios: la corrección del enlace de estilos corresponde a la página Astro que aloja el componente.

## Archivos

Backend, implementación:

- `backend/src/controllers/auth.controller.js`
- `backend/src/controllers/farmacia.controller.js`
- `backend/src/middlewares/farmacia-session.middleware.js` (nuevo)
- `backend/src/repositories/chat.repository.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/routes/chat.routes.js`
- `backend/src/routes/farmacia.routes.js`
- `backend/src/services/chat.service.js`
- `backend/src/sockets/chat.socket.js`
- `backend/src/validators/farmacia-perfil.validator.js` (nuevo)

Pruebas:

- `backend/tests/api-contracts.test.cjs`
- `backend/tests/chat-repository.test.cjs`
- `backend/tests/chat-service.test.cjs`
- `backend/tests/chat-socket.test.cjs`
- `backend/tests/farmacia-security-phase1.test.cjs` (nuevo)

Frontend:

- `frontend/src/pages/index.astro`
- `frontend/src/pages/login.astro`
- `frontend/src/pages/pages/chat-farmacia.astro`

Documentación: este informe (nuevo).

## Validación ejecutada

| Comprobación | Resultado |
|---|---|
| Suite completa, secuencial, con aislamiento de base y Edge headless | 530 aprobadas; 0 fallidas; 0 omitidas; 214,57 s |
| Pruebas frontend `.test.mjs` | 6 aprobadas; 0 fallidas |
| Pruebas dirigidas iniciales de contratos, chat, perfil y seguridad | 134 aprobadas; incluidas posteriormente en la suite completa |
| `npm run build`, frontend | Aprobado |
| `npm run check`, frontend | 0 errores; 0 advertencias; 1 sugerencia previa por variable sin uso en `public/js/dashboard.js` |
| Prisma `validate` | Aprobado; sin ejecutar migraciones |
| `git diff --check` | Sin errores de espacios |

Comando de la suite completa, desde backend:

```text
node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs
```

Se añadieron 13 pruebas de seguridad, varias con matrices de casos. Cubren JWT inválido/vencido/sin expiración, cuenta inexistente/inactiva/bloqueada/con estado nulo, rol revocado, fallos del proveedor, perfiles, aislamiento de participantes y Socket.IO real con datos en memoria. Los tests existentes del repositorio también cubren el rechazo de estados de cuenta desconocidos.

Las pruebas de navegador incluyen Solicitudes y Existencias a 1440/820/390 px, navegación y chat de Farmacia en escritorio y móvil, inventario a 320 px y VITALIX a 1280/768/390/320 px. Pasaron las comprobaciones de geometría, controles, recuperación de errores y ausencia de excepciones JavaScript propias. Se inspeccionó además la captura móvil del chat.

Evidencia temporal de esta ejecución: `C:\Users\SAMIRA~1\AppData\Local\Temp\saludclick-fase1-XBO9EH\tests.tap`, con capturas de panel, solicitudes, inventario y chat en el mismo directorio. Las capturas contienen exclusivamente datos ficticios. No constituyen una prueba visual contra Neon.

## Alcance y pendientes

- La regresión de Administrador, Paciente y EPS pasó. No se modificaron sus módulos, middleware de roles ni permisos. En archivos compartidos, las nuevas comprobaciones de sesión y perfil se limitan a Farmacia.
- No se conectó a Neon durante esta fase. Las pruebas HTTP usan repositorios simulados; las pruebas de Socket.IO usan transporte real con persistencia en memoria. Falta validación de escrituras con PostgreSQL aislado: no se dispone de `TEST_DATABASE_URL` configurada y no se ejecutaron migraciones para preparar un entorno.
- No se activaron Notificaciones ni fórmulas. Sus pruebas de preparación usan exclusivamente escenarios aislados.
- Se mantienen fuera de esta fase el aislamiento por establecimiento, la autorización de fórmulas, movimientos/lotes, evidencia de entrega, paginación e idempotencia del historial de chat y la recuperación de migraciones EPS originales. No se alteraron los contratos compartidos para introducir esas funcionalidades.
- La sugerencia de variable sin uso corresponde a código ajeno al alcance y se conserva.
- No se eliminaron archivos de Administrador, respaldos ni stashes. Se conserva `stash@{0}: farmacia-pendientes-respaldo-20261114` y los tres elementos no rastreados existentes al inicio.

No hay fallos de pruebas pendientes en la suite ejecutada. Este resultado acredita la fase en código y pruebas locales aisladas; no certifica el rol Farmacia completo ni su funcionamiento integral sobre Neon.
