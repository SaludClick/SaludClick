# SaludClick: integración EPS y cuatro roles

Fecha: 2026-11-14 (America/Bogota).

## Resultado comprobado

Se corrigió el bloqueo de acceso EPS. La cuenta activa 5, rol EPS, está asociada a EPS VidaPlena, entidad `1`. Se importaron **50 afiliados** a la base principal; sus **13 campos originales coinciden exactamente** con el origen y hay **0 documentos duplicados**. No se escribieron datos en EPS_DATABASE_URL ni se crearon cuentas de pacientes artificiales.

Los nueve módulos EPS cargaron en navegador contra Neon sin mensajes de error. Las operaciones de escritura del recorrido Administrador → Paciente → EPS → Farmacia → Paciente se verificaron con el backend real y PostgreSQL aislado. No se hicieron compras, autorizaciones ni alteraciones de inventario de prueba en Neon.

## Diagnóstico y migraciones

La comprobación inicial de este trabajo encontró 12 migraciones aplicadas y ninguna pendiente, en lugar de las siete indicadas anteriormente. El esquema EPS original `20261114090000_eps_workspace` ya estaba registrado en Neon. No se volvió a aplicar ni se atribuye su aplicación a esta intervención.

El bloqueo restante era la ausencia de EpsAcceso y de la entidad EPS para la cuenta 5. Se preservaron los controles JWT y de pertenencia; no se eludió la verificación.

Se revisó la compatibilidad de las 12 migraciones con las tablas existentes. Tres checksums históricos corresponden al mismo SQL con saltos LF frente a CRLF: `20261016220827_init`, `20261112120000_administrative_workspace`, `20261113120000_administrative_visitors`. No se modificó el historial para ocultar estas diferencias.

Migración aplicada en esta intervención:

- `20261115090000_eps_role_integration`.
- SHA256: `99b5dca81847e36f95f4f0d1372dd4598705abb5eb98f408ead9d7637212076e`.
- Agrega una asignación opcional de farmacia a autorizaciones, sus restricciones e índice, una tabla de notificaciones con destinatario/rol y disparadores para eventos y lecturas.
- No elimina tablas ni registros, no reescribe pedidos, pagos o existencias actuales. La sustitución de la función de validación conserva el aislamiento previo y agrega la validación de farmacia vinculada.
- Aplicación atómica y registro exclusivo de esa migración. Se verificaron archivo SQL, destino, historial y correspondencia del respaldo bajo bloqueo antes de aplicar.
- `npx --no-install prisma migrate status`: **13 migraciones, esquema actualizado, ninguna pendiente** después de aplicar.

Destino comprobado: host `ep-billowing-bonus-b5hsio7e-pooler.c-7.us-east-2.aws.neon.tech`, base `neondb`, esquema `public`. Huella SHA256: `7640c9f603b5eb8ae23dd8e47ef8c1057d2a570285547b07acd322e9163baa5d`. La fuente EPS es un host distinto. No se cambiaron URLs ni credenciales.

## Respaldo recuperable

Antes de las escrituras se certificó `backend/database/backups/eps-integration-20261114-001617/primary-before-eps.backup`:

- 131054 bytes; SHA256 `5109655e535183ace6247772a2a2bd8e7ec65e26365ea4700461bae1df5a6f7b`.
- Archivo custom PostgreSQL con propietarios y privilegios conservados. En el ensayo local se omitió aplicar propietarios/ACL remotos; no se alteró el archivo ni su SQL.
- Restauración real y completa en la imagen oficial PostgreSQL 18.7, compatible con Neon 18.7. La imagen es una herramienta de recuperación y no cambia las dependencias del proyecto.
- Coincidencia de todas las filas de las 33 tablas, columnas, índices, secuencias, funciones y disparadores. Se comprobaron expresiones equivalentes y su aceptación/rechazo de estados válidos, inválidos y nulos para cuatro restricciones conocidas.
- Se volvieron a comparar la base principal y la fuente antes de certificar. No hubo escrituras remotas durante la prueba.
- Evidencia privada: `verified-backup.json`. Directorio protegido con ACL limitada al operador y SYSTEM; excluido de Git. Las instancias Docker temporales quedaron detenidas.

Los primeros intentos fallidos no se presentaron como respaldos certificados: uno detectó el servidor transitorio de inicialización; el siguiente restauró las filas, pero la comparación estricta detectó la representación distinta de dos CHECK EPS. Se corrigió la espera y se certificó con una segunda restauración del archivo y comprobación semántica. **No se usó la adaptación SQL que antes esperaba autorización**. El problema previo de herramientas PostgreSQL 18.3 quedó evitado usando 18.7.

## Datos de VidaPlena

Se ejecutó el plan confirmado `7b91d55a70942c1b553e6a643b811882553f44f94dbbcd66cd59d45aa3723977`: entidad 1, cuenta 5, 50 nuevos afiliados, sin conflictos ni traslados entre EPS. La fuente conservó su huella `904303d0e7b6661173807d1982615ffc280d86acb9077e7d19e11dc29e171bda`.

No hubo coincidencias exactas y autorizadas con cuentas de pacientes existentes: **0 vinculaciones de pacientes, 50 afiliados sin cuenta vinculada**. No se fabricaron identidades. NIT, correo, teléfono y dirección de la entidad están vacíos porque el origen no los contiene; pueden completarse con información real desde la gestión permitida.

## Integraciones implementadas

| Rol | Integración y límites |
| --- | --- |
| Administrador | Entidades EPS, cuentas de rol EPS, activación de accesos, vinculación verificada de pacientes y farmacias, supervisión de afiliaciones, convenios y estados de autorizaciones. Sin conceptos ni motivos clínicos en su consulta de supervisión. |
| Paciente | Su afiliación, solicitudes y autorizaciones propias, resultado y notificaciones. La creación de solicitudes reutiliza el catálogo, checkout y pagos existentes. |
| EPS | Sus nueve módulos, aprobación/rechazo e historial, seguimiento, asignación de autorizaciones aprobadas con solicitud a una farmacia activa vinculada. Aislamiento por entidad vigente obtenida del servidor. |
| Farmacia | Autorizaciones asignadas a su cuenta, mínimos datos necesarios, convenios propios y existencias por convenio. Preparación y entrega conservan la máquina de estados y validaciones de pago existentes. |
| Notificaciones | Eventos reales dirigidos a destinatarios autorizados, rol de recepción conservado, clave única por evento/usuario, contador, consulta y lectura idempotente. Sin textos clínicos en avisos compartidos; sincronización con la campana EPS. |

La consulta y actualización antigua de pedidos de Farmacia también verifica la asignación EPS. Los pedidos sin afiliación EPS conservan el flujo existente. No se usa el stock global como sustituto del stock por farmacia ni se descuenta dos veces el inventario del checkout.

Las tres pantallas existentes reciben una sección con sus clases actuales y el botón **Abrir integracion EPS**. No se cambian menús, colores ni CSS de esos paneles. EPS conserva su menú y agrega la acción de asignar farmacia donde corresponde. El backend se recargó mediante el nodemon existente; el frontend Astro continúa disponible.

## Archivos principales

- `backend/prisma/schema.prisma` y `backend/prisma/migrations/20261115090000_eps_role_integration/migration.sql`: relaciones y notificaciones adicionales.
- `backend/src/middlewares/eps-integration.middleware.js`: JWT, rol y estado actual, revocación y pertenencia EPS.
- `backend/src/services/eps-integration.service.js`, `backend/src/routes/eps-integration.routes.js` y una inscripción en `backend/src/routes/index.js`: integración por rol en `/api/integracion`.
- `backend/src/repositories/eps-order-scope.js` y cambios mínimos en controller/service/repository de Farmacia: aislamiento de pedidos EPS sin cambiar sus transiciones.
- `backend/src/services/eps.service.js`: selecciones explícitas compatibles durante la instalación del esquema adicional.
- `frontend/public/js/eps-integracion.js`, `frontend/public/js/eps.js`, `frontend/public/pages/admin.html`, `frontend/public/pages/dashboard.html`, `frontend/src/pages/pages/farmacia.astro`: conexiones de interfaz con estilos existentes.
- `backend/scripts/eps-backup-docker.cjs`, `eps-certify-backup.cjs`, `eps-integrate-schema.cjs`, `eps-live-check.cjs`: respaldo, certificación, aplicación limitada y verificación exclusivamente de lectura.
- Se reutilizaron `eps-activate.cjs`, `eps-activation.service.js`, el módulo EPS y la migración original desarrollados previamente.
- `backend/tests/eps-roles.isolated.cjs`, `eps-postgres.isolated.cjs`, `farmacia-api.test.cjs`: pruebas del recorrido y regresión.

El cambio existente en `backend/package-lock.json` precede esta intervención; no se cambió para integrar EPS ni se modificaron versiones de dependencias o archivos `.env`.

## Pruebas y resultados

| Comprobación | Resultado |
| --- | --- |
| `npm test` en backend | **475 aprobadas, 0 fallos**. Incluye contratos, permisos, servicios y regresión de módulos existentes. |
| Activación y migración EPS aisladas | **6 aprobadas**, incluidas atomicidad, checksum/destino, idempotencia, fuente alterada y conflictos. |
| `EPS_BROWSER=1 node --test tests/eps-postgres.isolated.cjs` | **9 aprobadas**: API EPS, nueve vistas en navegador, formularios, historial, seguridad y cierre de sesión con revocación. |
| `EPS_ROLES_BROWSER=1 node --test tests/eps-roles.isolated.cjs` | **11 aprobadas**: recorrido de cuatro roles, páginas existentes en navegador, privacidad, repetición sin duplicados, stock y estados. |
| `node --test ../frontend/tests/*.test.mjs` | **6 aprobadas**. |
| `npm run build` en frontend | Compilación Astro aprobada. |
| `npm run check` en frontend | 0 errores, 0 warnings; un hint previo por variable `map` sin uso en dashboard.js. |
| `prisma validate` | Esquema válido. |
| Verificación de lectura con Neon | 50 afiliados exactos, 13 campos, 0 duplicados; cuenta 5 con acceso activo a entidad 1; ambas bases sin cambios durante el ensayo final acotado. |
| API real y permisos | Verificación y nueve endpoints EPS HTTP 200; sin JWT 401, otros roles 403; endpoints de integración y pedidos de Farmacia responden según su rol. |
| Navegador contra Neon | Nueve módulos EPS aprobados con igualdad de ambas bases antes/después. Las otras tres secciones cargaron, pero su ensayo ampliado no aprobó la igualdad de datos; véase la incidencia siguiente. |

La advertencia deprecada de `pg` sobre consultas concurrentes dentro de las pruebas aisladas no causó fallos; no se cambiaron versiones para ocultarla. El cierre de sesión y las escrituras funcionales se probaron en aislamiento; no se revocaron sesiones reales para probar.

## Incidencias adicionales y alcance de la evidencia

Un intento adicional de navegador encontró una interrupción de conexión. Entre comprobaciones cambió el proceso servidor; se volvió a verificar disponibilidad y no se clasificó ese intento como aprobado.

Al ampliar la navegación real a Administrador, Paciente y Farmacia, las tres secciones cargaron y no se detectaron excepciones JavaScript, pero falló la comparación final porque cambió la auditoría administrativa. La consulta posterior de metadatos encontró un evento `ATENCION_CREADA`, actor 6, a las `2026-11-14T05:37:12.092Z`. Se conserva íntegro. **No se confirmó que fuera un efecto de la navegación**; la atribución inicial a auditoría automática se corrigió. Ese ensayo no certifica ausencia de escrituras ni se cuenta como una prueba aprobada de invariancia. No se borraron registros para hacer pasar la comprobación.

Se limitó la utilidad de diagnóstico a las APIs de integración y la página EPS. El ensayo final de `node scripts/eps-live-check.cjs --browser` aprobó los 29 resultados HTTP esperados, los nueve módulos en navegador, los 50 afiliados exactos y la igualdad completa de ambas bases antes/después. El recorrido de escritura de los cuatro roles y sus tres páginas se mantiene aprobado únicamente en el entorno aislado.
## Límites y tareas operativas restantes

El código del recorrido completo quedó verificado en PostgreSQL aislado y la carga real con permisos en Neon. **No se afirma haber ejecutado una atención clínica completa con datos reales**, porque no existen las cuentas de pacientes verificadas ni los convenios/existencias necesarios para ese recorrido y se prohibió inventarlos o hacer escrituras de prueba en producción.

Para iniciar operaciones reales se deben vincular las cuentas autorizadas que correspondan a los afiliados y las farmacias que tengan convenio, y registrar sus existencias auténticas desde Farmacia. Hasta entonces los listados correspondientes muestran vacíos reales, no errores ni datos simulados. Completar también los datos administrativos de VidaPlena que no existen en el origen.

No hubo commits, pushes, despliegues, cambios de credenciales ni operaciones destructivas.
