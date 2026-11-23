# Continuación de FARMACIA — 17/11/2026

## Alcance y conservación

Rama comprobada: `integracion/farmacia-pendientes`. El árbol inicial contenía
cambios y archivos nuevos de sesiones anteriores en backend, frontend, esquema,
migración preparada, pruebas e informes. Se conservaron; no se reconstruyeron
funciones ya implementadas. Se revisaron especialmente los informes de retiro de
Chat/Entregas y avance integral del 16/11.

No se accedió a Neon, no se ejecutaron migraciones contra entornos persistentes,
no se activaron banderas, permisos, identidades ni vinculaciones reales. Las
pruebas existentes aplican SQL exclusivamente en PostgreSQL embebido efímero
(PGlite), con datos sintéticos. No hubo commit, push, merge ni eliminación de
trabajos anteriores.

## Implementación conservada y verificación

| Módulo | Funciones existentes revisadas | Límite para certificar operación real |
|---|---|---|
| Usuarios | Fuente original EPS compartida con Administración, transacción READ ONLY, EPS vigente derivada del servidor, búsqueda, inicial, paginación y totales; sin copia de pacientes | Verificar fuente y permisos SELECT reales; vinculación autorizada vigente |
| Solicitudes | Asignación persistente por farmacia, identidad de origen, filtros, detalle, fórmula protegida, consentimiento de descarga, estados consecutivos, pago real suficiente, versión, idempotencia e historial atómico | Esquema y activación autorizados; identidad y asignaciones reales; validación farmacéutica sigue bloqueando fórmulas requeridas/desconocidas |
| Notificaciones | Destinatario asignado, persistencia atómica con cambios de solicitudes, contador, lectura y Socket.IO con revalidación | Esquema y bandera autorizados; flujo real pendiente |
| Medicamentos | Alta/edición con permiso persistente, ámbito por medicamento, versión, duplicados y auditoría; URL HTTPS y presentación de imágenes en catálogo compartido | Permisos reales pendientes; disponibilidad de imágenes externas no certificada en producción |
| Inventario | Consulta de solo lectura, filtros y XLSX reabierto con ExcelJS; hojas Inventario y Resumen, cantidades numéricas y exportación completa hasta límite explícito | Es catálogo global: no acredita stock propio; apertura manual en Microsoft Excel no realizada |
| Dashboard | Consultas por asignación; solicitudes recibidas separadas de entregas; pacientes atendidos y unidades desde eventos confirmados; ausencia de activación sin cifras ficticias | Flujo y métricas reales pendientes de activación autorizada |
| Perfil | Edición propia existente; cambio de contraseña con actual, bcrypt, auditoría y revocación de sesiones de Farmacia | Cambio directo depende del esquema y activación; correo y recuperación no certificados con proveedor real |

El menú conserva exactamente Dashboard, Solicitudes, Usuarios, Inventario,
Medicamentos, Notificaciones y Perfil. Chat, Entregas y Fórmulas no se añaden como
módulos independientes. Se conservan las restricciones de rutas retiradas.

## Corrección de esta sesión

Dashboard descartaba la comparación cuando el periodo actual tenía cero
solicitudes y el anterior sí tenía registros. Se permite ahora mostrar la
variación real de −100 %. Si el periodo anterior es cero, la comparación sigue
sin porcentaje para evitar dividir por cero. Se amplió la prueba PostgreSQL
existente para ambos escenarios, conservando el aislamiento por farmacia.

Archivos de código modificados por esta sesión:

- `backend/src/repositories/farmacia-operacion.repository.js`.
- `backend/tests/farmacia-operacion-postgres.test.cjs`.

## Validación de esta sesión

- Suite completa backend/HTTP/PostgreSQL embebido/Socket.IO/navegador:
  **589 aprobadas, 0 fallidas, 0 omitidas**, duración 224,49 s. Comando desde
  backend: `node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs`.
  Evidencia: `farmacia-continuacion-autorizada-2026-11-17.tap` en la raíz.
- La prueba PostgreSQL de periodos incluye la corrección de tendencia y pasó.
- Frontend: **7 aprobadas, 0 fallidas, 0 omitidas** con
  `node --test tests/*.test.mjs`; evidencia
  `farmacia-continuacion-frontend-2026-11-17.tap`.
- `npm run check`: 0 errores, 0 advertencias, 1 hint preexistente por `map` sin
  uso en `frontend/public/js/dashboard.js`. Evidencia:
  `farmacia-continuacion-check-2026-11-17.txt`.
- `npm run build`: correcto, 18 páginas. Evidencia:
  `farmacia-continuacion-build-2026-11-17.txt`.
- Prisma validate: esquema válido, salida nativa 0 comprobada en una segunda
  ejecución; se sustituyó DATABASE_URL por una URL local inalcanzable solo en el
  proceso de validación. No conecta ni aplica migraciones. El primer registro
  `farmacia-continuacion-prisma-2026-11-17.txt` contiene el mensaje de esquema
  válido, aunque PowerShell convirtió stderr informativo en NativeCommandError.
- `git diff --check`: sin errores de espacios; avisos preexistentes LF/CRLF.

La primera ejecución dentro del sandbox encontró timeouts de Edge en
`Runtime.enable`; se conserva en `farmacia-continuacion-2026-11-17.tap` como
evidencia del problema de entorno, sin contabilizarla como aprobada. La ejecución
completa posterior fuera del sandbox, autorizada por la herramienta, pasó sin
omitir pruebas. Se mantuvo el preload que rechaza conexiones inesperadas a las
bases reales. Los resultados verifican datos sintéticos y servicios locales,
no una integración completa con Neon ni disponibilidad externa de imágenes.

## Bloqueos reales y próximo paso

No se declara 100 % funcional operativo. Las pruebas locales no sustituyen la
verificación del destino real. Los bloqueos identificados en el informe anterior
continúan sin autorización para resolverlos:

1. Revisión y aprobación del esquema/migraciones de operación y notificaciones,
   incluida la reconciliación de la cadena histórica de EPS.
2. Fuente EPS original, permisos SELECT y vinculación vigente autorizada. La
   vinculación Farmacia 4 → EPS VidaPlena 1 propuesta anteriormente no se ejecutó
   ni se presupone vigente hoy.
3. Verificación autorizada de identidad afiliado–cuenta y asignaciones/política
   de enrutamiento; permisos explícitos de catálogo.
4. Activación controlada y prueba real de extremo a extremo de solicitudes,
   fórmulas, auditoría, notificaciones, métricas y sesiones.
5. Flujo autorizado de validación farmacéutica; un archivo vinculado o un pago
   simulado no autoriza dispensación.
6. Verificación de XLSX e imágenes con datos reales autorizados. El inventario
   global no debe presentarse como existencias propias.

No se reutilizan porcentajes antiguos como medición de esta sesión ni se cambian
criterios bloqueados a completos basándose únicamente en pruebas sintéticas.
