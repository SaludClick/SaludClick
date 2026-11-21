# FARMACIA — implementación y validación del 17/11/2026

## Resultado

Se implementaron mejoras funcionales adicionales a la continuación anterior, en
`integracion/farmacia-pendientes`. Se conservaron el árbol sucio inicial, los
informes, cambios y migraciones preparados por otras sesiones. No hubo commit,
push, merge ni modificaciones de datos o esquema en Neon.

**No se declara 100 % operativo.** Se comprobó por lectura el destino real y sus
bloqueos; la aceptación funcional de escritura se ejecutó sobre PostgreSQL
embebido efímero. No se habilitaron vínculos ni permisos reales.

## Matriz de funcionalidades

| Sección / función | Implementación y resultado de pruebas | Estado en el destino real / bloqueo |
|---|---|---|
| Menú y navegación | Solo Dashboard, Solicitudes, Usuarios, Inventario, Medicamentos, Notificaciones y Perfil. Siete pantallas, URL retiradas, roles, botones y responsive comprobados en Edge | Menú conservado; sin Chat, Entregas o Fórmulas independientes |
| Usuarios: origen e identificadores | Se conserva la consulta READ ONLY de la fuente EPS original compartida con Administración. No se crean tablas o copias de pacientes. Tests de fuente con SQL PostgreSQL, filtros, paginación, cambios de origen y aislamiento aprobados | Lectura real confirma 50 registros activos, documentos e identificadores únicos, todos de EPS 1 |
| Usuarios: documento y búsqueda | **Nuevo:** documento junto con nombres, apellidos, EPS, estado e identificador; búsqueda literal también por documento, inicial de apellido y paginación. Búsqueda por documento y visualización probadas en navegador | Farmacia 4 activa, sin vínculo; requiere autorizar 4 → EPS VidaPlena 1 después del esquema |
| Solicitudes: detalle y fórmula | Detalle con paciente, EPS, varios medicamentos, cantidades, fecha, estado y fórmula consentida. HTTP comprueba archivo autenticado, mismo paciente, mismo ámbito, descarga consentida y bloqueo de rutas privadas | Faltan tablas, identidades y asignaciones. El flujo real no se activó |
| Solicitudes: estados y auditoría | Se conservan versión, clave idempotente, recepción, pago real suficiente e historial. **Nuevo:** reserva y entrega de stock propio dentro de la transacción de estado/aviso. Probados reintentos, rollback y varias líneas del mismo medicamento | Requiere aprobar esquema y stock acreditado; fórmulas requeridas/desconocidas permanecen bloqueadas sin validación farmacéutica autorizada |
| Inventario: propio y solo lectura | **Nuevo:** saldos por farmacia y medicamento, físico, reservado, disponible, entregados históricos, búsqueda, filtros, detalle y alertas. FARMACIA no puede registrar ingresos ni editar cantidades. Tests comprueban que no aparece saldo ajeno | Tablas propias ausentes; no se copió ni repartió el stock global. Se requieren ingresos con referencia física/documental autorizados |
| Inventario: operaciones | Ingreso solo para administrador vigente mediante API específica, auditado e idempotente. PREPARANDO reserva; ENTREGADA descuenta físico y libera reserva. Todo revierte si falla otro medicamento o la notificación. Sin segundo descuento global | Bandera propia deshabilitada. No habilitar sobre solicitudes ya en curso sin reconciliar reservas |
| Inventario: Excel | **Nuevo:** reporte de existencias propias, hojas Inventario y Resumen, disponibilidad, entregados, reservado, físico y ámbito. Se reabre con ExcelJS y se validan cifras. El reporte global previo se conserva separado | Apertura con ExcelJS comprobada; apertura manual en Microsoft Excel y reporte con datos reales pendientes |
| Medicamentos: alta/edición | Se conservan campos, permisos persistentes, ámbito, versión, validación HTTPS, duplicados, auditoría y stock intacto. **Nuevo:** PUT de autorizaciones reemplaza el conjunto vigente y revoca ámbitos omitidos sin borrar historial. Pruebas de revocación y denegación aprobadas | Tablas y permisos reales pendientes; no se concedieron permisos globales |
| Medicamentos: imágenes e interfaz | Formularios, vista previa, tabla/tarjetas y catálogo compartido conservados. Edge comprueba imágenes HTTPS cargadas y visibles tanto en Farmacia como en catálogo del paciente | Las respuestas HTTPS se controlaron con CDP para probar renderizado sin depender de un proveedor externo. No se certifica disponibilidad de cada URL externa real |
| Notificaciones: contexto | **Nuevo:** paciente, fecha y referencia de solicitud, consultados al leer mediante la asignación y EPS vigentes. No se persisten copias de identidad ni se envía información clínica por sockets. Revocar vínculo retira acceso; se corrigió HTTP 500 por HTTP 403 en ese caso | Tabla de notificaciones ausente; activación pendiente |
| Notificaciones: persistencia y tiempo real | Contador, lectura, historial, aislamiento, reconexión e invalidación Socket.IO conservados y aprobados. Aviso, estado y movimiento son atómicos; no se notifican farmacias globalmente | Bandera real deshabilitada; flujo real pendiente |
| Dashboard: indicadores | **Nuevo:** cuatro tarjetas principales: pacientes distintos atendidos, unidades entregadas, referencias propias con unidades libres y solicitudes pendientes; completadas como indicador adicional. Saldo desconocido no inventa disponibilidad | Sin activación no muestra cifras operativas ficticias; disponibilidad propia se deja en null hasta disponer de stock propio |
| Dashboard: gráficos y alertas | **Nuevo:** comparación mensual de pendientes/completadas, alertas de stock propio y distribución adaptable de tarjetas. Se conservan estados, más solicitados, evolución y recientes, filtros y tendencia de −100 %. Dos entregas al mismo paciente cuentan una persona. Recarga del mismo periodo conserva cifras verificadas para evitar parpadeo; errores retiran datos | Métricas reales pendientes de asignaciones/entregas autorizadas. El saldo actual se distingue del periodo de actividad |
| Perfil y seguridad | Se conserva edición propia, correo protegido y recuperación existente; cambio de contraseña con actual, bcrypt, auditoría y revocación persistente. Pruebas de persistencia, permisos y pantallas aprobadas | Cambio directo depende del esquema/activación; envío real de correo y proveedor externo no certificados |
| Otros roles | Regresión de ADMINISTRADOR, PACIENTE y EPS aprobada. Única ampliación administrativa de esta sesión: API de ingresos de existencias necesaria para el stock propio; sin nuevo panel administrativo | No se alteraron pantallas de esos roles; sin modificaciones de datos reales |

## Verificación real, exclusivamente lectura

Se ejecutó `backend/scripts/farmacia-preflight-readonly.cjs --farmacia-id=4`.
La primera orden de cada conexión inicia una transacción READ ONLY; se verifica
el modo y se termina con ROLLBACK. No se imprimieron credenciales, documentos ni
nombres de pacientes.

Evidencia: `farmacia-preflight-real-2026-11-17.json`, lectura del
17/11/2026 a las 18:59:13 UTC:

- Destino y fuente EPS disponibles para las consultas del preflight.
- Cuenta Farmacia 4 vigente; **0 vínculos activos**.
- EPS disponible: **1, EPS VidaPlena**.
- Fuente original: **50 afiliados, 50 activos, 50 identificadores únicos y 50
  documentos únicos**, todos en EPS 1. Ninguna fila se creó o actualizó.
- Falta índice de una EPS activa por farmacia.
- Faltan tablas de identidad, asignaciones, eventos, fórmulas consentidas,
  permisos/auditoría de catálogo, rutas, sesiones, notificaciones y stock propio.
- Operación, notificaciones e inventario propio: banderas reales **false**.

La primera tentativa dentro del sandbox fue rechazada por acceso de red. El
pooler rechazó después opciones de inicio; se adaptó el script para abrir READ
ONLY como primera orden. La comprobación final sí terminó correctamente sin
escrituras. Esto verifica la conexión y el estado real, no una aceptación de
escrituras en producción.

## Pruebas finales y límites

| Verificación | Resultado | Evidencia en la raíz del repositorio |
|---|---|---|
| Suite completa backend, HTTP, SQL embebido, Socket.IO y navegador | **602 aprobadas, 0 fallidas, 0 omitidas**, 174,87 s | `farmacia-implementacion-suite-final-2026-11-17.tap` |
| Cierre posterior al ajuste visual y de recarga: HTTP integral y siete pantallas en navegador | **15 aprobadas, 0 fallidas, 0 omitidas**, 20,82 s | `farmacia-implementacion-browser-cierre-2026-11-17.tap` |
| Frontend | **7 aprobadas, 0 fallidas, 0 omitidas** | `farmacia-implementacion-frontend-cierre-2026-11-17.tap` |
| Astro check | **0 errores, 0 advertencias**, 1 hint previo (`map` sin uso en dashboard ajeno a Farmacia) | `farmacia-implementacion-check-cierre-2026-11-17.txt` |
| Astro build | Correcto, **18 páginas** | `farmacia-implementacion-build-cierre-2026-11-17.txt` |
| Prisma validate | Esquema válido, salida 0, URL local inalcanzable; sin conexión o migración | Ejecución de herramienta registrada en la sesión |
| Sintaxis de scripts/repositorio/servicio nuevos | Correcta | `node --check` en la sesión |
| Espacios de diff | Correcto; avisos LF/CRLF | `git diff --check` en la sesión |

Comando completo desde backend:

```powershell
node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs
```

Las 15 pruebas de cierre se solapan con la suite completa; **no se suman como
pruebas distintas**. El cierre se repitió después del último cambio visual y de
conservación de valores durante la recarga. Los registros iniciales se conservan:
incluyen timeouts de Edge dentro del sandbox, una expectativa antigua del
contrato de acceso y una lectura de pantalla durante una recarga. Esos resultados
no se presentan como ejecuciones aprobadas. Edge se ejecutó fuera del sandbox con
autorización de herramienta; el preload siguió rechazando bases reales.

El SQL de las migraciones se aplicó **solo en PGlite efímero**, con fixtures
sintéticas. Las pruebas de HTTP usan un adaptador de lecturas Prisma para datos
locales; no certifican el driver Prisma completo contra Neon. Los reintentos
simultáneos se ejercitan sobre un pool local serializado: queda pendiente medir
contención con varias conexiones PostgreSQL independientes en el destino
autorizado. La prueba con fórmula adjunta no aprueba prescripciones: la entrega
permitida usa medicamentos de requisito conocido y sin fórmula obligatoria.

Capturas nuevas revisadas visualmente, sin sustituir las del 16/11:

- `farmacia-implementacion-dashboard-2026-11-17.png`.
- `farmacia-implementacion-dashboard-propio-2026-11-17.png`.
- `farmacia-implementacion-inventario-2026-11-17.png`.
- `farmacia-implementacion-editor-2026-11-17.png`.

## Persistencia y compatibilidad

Migración nueva preparada:
`backend/prisma/migrations/20261117180000_farmacia_inventario_propio/migration.sql`.
Los modelos Prisma reflejan saldos y eventos con FK RESTRICT y sin duplicación
de pacientes. La migración no copia el saldo global ni otorga existencias a una
farmacia. Sus restricciones impiden saldos negativos, exceso de reserva y
eventos repetidos de la misma solicitud/medicamento/tipo.

Endpoints nuevos:

- `GET /api/farmacia/existencias`.
- `GET /api/farmacia/existencias/:id`.
- `GET /api/farmacia/existencias/reporte.xlsx`.
- `POST /api/admin/farmacias/:farmaciaId/existencias/ingresos`.

El frontend selecciona el inventario propio únicamente si el servidor informa
su activación. Se conserva la consulta informativa global anterior, rotulada
como tal; jamás se presenta como saldo físico propio. Las cantidades de stock
global que ya reserva la compra no se descuentan de nuevo al entregar. Los
ingresos propios necesitan conciliación física y autorización de su referencia.

## Bloqueos y reversión

El plan concreto está en `farmacia-activacion-reversion-2026-11-17.md`: revisión
de cadena histórica, snapshot y ensayo de recuperación, migraciones aprobadas,
vínculo 4→1, identidades verificadas, asignaciones/permisos explícitos, ingresos
acreditados y activación coordinada. Ante fallos se cierran juntas las tres
banderas, se preservan datos/auditoría y se reconcilia antes de reactivar. No se
entrega un DROP automático ni se restauran copias antiguas sobre actividad nueva.

También quedan pendientes la política/flujo autorizado de validación
farmacéutica para dispensar medicamentos con fórmula requerida, la prueba real
de correo, imágenes externas, apertura manual de Excel y la aceptación real de
extremo a extremo. No se levantaron esos bloqueos cambiando etiquetas ni datos.

No se modificaron `.env` reales, relaciones, cuentas, afiliados ni permisos en
Neon. No se ejecutaron migraciones persistentes ni se realizaron acciones Git de
publicación. La implementación local y sus pruebas quedan disponibles para
revisión, sin declarar alcanzado el 100 % operativo.
