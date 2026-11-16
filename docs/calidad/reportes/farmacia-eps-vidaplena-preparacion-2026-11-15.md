# Preparación de la asociación Farmacia 4 — EPS VidaPlena 1

Fecha: 2026-11-15. Rama `integracion/farmacia-pendientes`.
Estado: preparado para revisión, BLOQUEADO para ejecutar. Ninguna escritura en Neon.

## Registros reales comprobados otra vez

Conexión TLS y transacción `REPEATABLE READ READ ONLY`; `SHOW transaction_read_only` devolvió `on`.

| Registro | Resultado |
|---|---|
| EPS | ID de texto `1`, EPS VidaPlena, activa; única EPS existente |
| Afiliados de EPS 1 | 50, los 50 con `lower(btrim(estado))='activo'` |
| Farmacia | Usuario ID entero `4`, rol 3, ACTIVO |
| Administrador existente | Usuario ID entero `1`, rol 1, ACTIVO |
| `eps_farmacias` | Cero filas |
| Vínculos huérfanos | Cero |
| Afiliados con EPS inexistente | Cero |
| Farmacias con más de un vínculo activo | Cero |

No se consultaron nombres, documentos ni datos clínicos de afiliados. No se creó ni modificó ningún registro.

## Recuperación de originales: no conseguida

Los originales están registrados como aplicados y sin rollback en Neon:

| Migración | SHA-256 registrado |
|---|---|
| `20261114090000_eps_workspace` | `2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835` |
| `20261115090000_eps_role_integration` | `99b5dca81847e36f95f4f0d1372dd4598705abb5eb98f408ead9d7637212076e` |

Búsqueda realizada:

- Árbol de trabajo, ramas locales/remotas disponibles, historial, reflogs y stash, sin aplicar ni borrar el stash.
- `git ls-remote --heads origin`: todas las puntas remotas coinciden con las referencias locales; no fue necesario hacer fetch, merge ni checkout.
- Comparación exacta SHA-256 de 213 blobs: migraciones alcanzables y blobs no alcanzables hallados por `git fsck`; ninguna coincidencia.
- Búsqueda de nombres de directorios de ambas migraciones y respaldos en Escritorio, Documentos, Descargas y OneDrive: 365 directorios examinados.
- Inspección sin extracción de `C:\Users\SAMIR ACOSTA\Downloads\SaludClick.zip`: solo contiene la migración inicial; ninguna de las originales buscadas.

No se reconstruyó contenido a partir del esquema. Un checksum permite verificar un original, no recuperar su contenido. Falta obtener ambos `migration.sql` originales del autor, equipo, otra copia del repositorio o respaldo no disponible en las ubicaciones examinadas. Conservar exactamente sus bytes y comprobar SHA-256 antes de restaurarlos a sus rutas originales. No volver a ejecutarlos: ya constan aplicados.

## Compatibilidad comprobada

- `eps_farmacias.eps_id` es texto y referencia `eps_entidades.id`; `farmacia_id` es entero y referencia `usuarios.id`.
- Existen PK de vínculo, índice único por `(eps_id,farmacia_id)`, columnas `activa`, `version` y `vinculada_at`, con valores predeterminados compatibles con el INSERT implementado.
- Falta `eps_farmacias_una_eps_activa_key`; la unicidad por pareja existente no impide varias EPS activas para la misma farmacia.
- `administrative_audit` tiene las columnas, secuencia y valores predeterminados esperados; su trigger impide UPDATE/DELETE, sin impedir el INSERT de auditoría previsto.
- El usuario técnico de la conexión tiene permisos de tabla SELECT/INSERT/UPDATE para vínculos e INSERT para auditoría, y es propietario de `eps_farmacias`. Esto no sustituye la autorización administrativa de la aplicación. No se ejercieron esos permisos de escritura ni se probó un INSERT real, secuencias o concurrencia física.
- En la revisión de restricciones no apareció FK física de `afiliados.eps_id`; la comprobación actual de correspondencia no detectó huérfanos. No se propone modificar esa tabla en esta intervención.

## Operación A: instalar exclusivamente el índice, pendiente de autorización

Archivo existente preparado, sin cambios en esta fase:

`backend/prisma/migrations/20261115120000_farmacia_eps_unica/migration.sql`

Contenido efectivo exacto:

```sql
CREATE UNIQUE INDEX "eps_farmacias_una_eps_activa_key"
ON "public"."eps_farmacias" ("farmacia_id") WHERE "activa" = true;
```

Condiciones previas obligatorias:

1. Recuperar y verificar los dos originales anteriores, compararlos con sus checksums y revisar su compatibilidad. Si no se consiguen, detener esta operación.
2. Autorización expresa para este cambio de esquema y su registro de aplicación. No comprende otros índices, migraciones ni vínculos.
3. Revalidar EPS 1, farmacia 4, ausencia de duplicados y definición/ausencia del índice. Si el índice existe con otra definición, detenerse; no usar `IF NOT EXISTS` para ocultar diferencias.
4. Ejecutar en una ventana administrativa de bajo tráfico, con bloqueo acotado. No ejecutar `prisma migrate deploy`: hay otras migraciones pendientes, incluida Notificaciones.

Envoltura transaccional propuesta para ejecutar únicamente tras autorización y precondiciones cumplidas:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE "public"."eps_farmacias" IN SHARE MODE;
CREATE UNIQUE INDEX "eps_farmacias_una_eps_activa_key"
ON "public"."eps_farmacias" ("farmacia_id") WHERE "activa" = true;
COMMIT;
```

El bloqueo impide escrituras concurrentes durante la creación; es una operación normal, no `CONCURRENTLY`. Ante duplicados, bloqueo no adquirido, timeout o cualquier error, ejecutar ROLLBACK y detenerse. No desactivar ni borrar vínculos para forzar la instalación. La creación toma bloqueos de tabla y puede demorar a otros escritores, aunque no cambia filas.

Después, verificar en `pg_index` tabla, clave, unicidad, validez, estado listo y predicado. Si la instalación se realiza por SQL controlado, registrar únicamente esta migración mediante el mecanismo Prisma de resolución de migraciones ya aplicadas, también como escritura autorizada, después de verificar el índice. No editar manualmente `_prisma_migrations` ni marcar aplicadas otras migraciones. Si el registro de historial falla, informar el estado parcial y detener la vinculación.

Aceptación: índice correcto, historial reconciliado para esta migración, ninguna modificación de filas y GET administrativo con `escrituraHabilitada:true`. No eliminar automáticamente el índice si una verificación posterior falla.

## Operación B: asociación real, autorización independiente

Solo después de completar A y con una sesión real de Administrador vigente. No se dispone en esta fase de una sesión administrativa aportada/verificada para ejecutar el PUT; no se fabricaron tokens de administrador. La cuenta 1 activa es evidencia de una cuenta candidata, no de una sesión autenticada.

El middleware comprueba firma JWT, cuenta actual ACTIVO, rol vigente 1 coincidente con el token y revocación de sesiones. La transacción revalida administrador y farmacia. Antes de escribir, usar el GET administrativo autenticado:

```http
GET /api/admin/farmacias/4/eps
Authorization: Bearer <sesión administrativa vigente>
```

Debe devolver `vinculoActual:null`, EPS 1 disponible y escritura habilitada. Si aparece otro vínculo, no reutilizar el cuerpo preparado; detenerse para revisión.

Solicitud exacta propuesta, NO ejecutada:

```http
PUT /api/admin/farmacias/4/eps
Authorization: Bearer <sesión administrativa vigente>
Content-Type: application/json

{"epsId":"1","vinculoActual":null}
```

`epsId` debe ser cadena porque el identificador real de EPS es textual. No enviar `actor_id`, rol, estado ni campos adicionales.

Cambios esperados en una única transacción:

- Con el estado actual de cero vínculos, crear una fila en `eps_farmacias` con `eps_id='1'`, `farmacia_id=4`, `activa=true`, `version=1`, fecha del servidor e ID generado. No se anticipa el ID generado.
- Registrar una fila en `administrative_audit` con el administrador autenticado como actor, acción `VINCULAR_EPS`, entidad `FARMACIA`, registro `4`, resultado `EXITO` y campos `eps_id`, `activa`.
- No modificar `usuarios`, `eps_entidades`, `afiliados`, estados, autorizaciones médicas o conversaciones.

El endpoint contiene desactivación/reactivación para cambios futuros; en el estado observado no hay vínculos previos que desactivar. La versión esperada evita sobrescribir una asociación concurrente. Si falla la auditoría, se revierte también el vínculo.

Aceptación tras B, con sesión auténtica de farmacia 4:

- GET `/api/farmacia/eps`: EPS ID `1`, estado `VINCULADA`.
- GET `/api/farmacia/usuarios?pagina=1&tamano=25`: total activo 50 si el estado continúa igual; 25 filas en página 1 y 25 en página 2.
- Comprobar EPS resuelta desde el vínculo del servidor, exclusión de inactivos y rechazo de selección de EPS por parámetros.
- Buscar nombres/apellidos y mantener el total activo independiente de coincidencias; verificar que no haya requisitos de cuenta local, chats, solicitudes o autorizaciones médicas.
- La lectura real y el número final de pacientes siguen pendientes; no se simulan como comprobados.

## Pruebas y conservación

Repetidas las 13 pruebas de `backend/tests/farmacia-eps.test.cjs`, con precarga de aislamiento de base, HTTP real de aplicación, persistencia simulada y Edge: 13 aprobadas, 0 fallidas, 0 omitidas. Cubren autorización administrativa, JWT/roles, ausencia de índice, unicidad/concurrencia simulada, versión, auditoría/rollback, pacientes activos por EPS, búsqueda, paginación y navegador. No equivalen a una escritura de integración en PostgreSQL.

Esta fase solo añade este informe. No cambia código, migraciones preparadas, roles ni datos. Se mantienen la rama y HEAD `fafb09852f7ce7c8f097dd4e5f5f6ee6e7aa2a4a`, las modificaciones locales de fases anteriores, los archivos de Administrador y el stash `farmacia-pendientes-respaldo-20261114`. No hubo migraciones, escrituras en Neon, commits ni push.

Las autorizaciones A y B siguen pendientes y deben concederse por separado. La confirmación del destino 4→1 ya recibida no autoriza instalar el índice ni ejecutar el PUT. Incluso con autorización posterior, no saltar el bloqueo de los originales faltantes.
