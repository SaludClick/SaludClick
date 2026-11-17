# Vinculación única Farmacia–EPS y directorio de afiliados activos

Fecha: 2026-11-15. Rama: `integracion/farmacia-pendientes`.
Base conservada: `fafb09852f7ce7c8f097dd4e5f5f6ee6e7aa2a4a`. Sin commits, push ni fusiones.

## Resultado

Implementado en código y probado con datos aislados:

- Resolución de la EPS desde el backend para la cuenta Farmacia autenticada.
- Una sola vinculación EPS activa por cuenta, mediante índice único parcial preparado y operación administrativa transaccional.
- Directorio de afiliados activos de esa EPS, con búsqueda, paginación y total activo independiente del filtro de búsqueda.
- Sin requisito de cuenta local, conversación, solicitud o autorización de medicamentos.
- Proyección limitada a nombres, apellidos, estado y EPS vinculada. No se devuelven documentos, correos, teléfonos, domicilios ni datos clínicos.
- Pantalla Usuarios independiente, de solo lectura y sin selector de EPS ni operaciones sobre pacientes.

**No está habilitada la escritura de vínculos en Neon.** No se aplicó la migración ni se creó una asociación real. El endpoint administrativo falla cerrado si la restricción única no está instalada. Las dos migraciones EPS originales faltantes deben recuperarse y revisarse antes de preparar la aplicación del nuevo índice. No se reconstruyó su contenido.

## Contratos

### Farmacia

Todas las operaciones exigen JWT válido con expiración, cuenta activa y rol vigente 3. El repositorio vuelve a comprobar la cuenta dentro de la transacción de lectura.

| Operación | Comportamiento |
|---|---|
| `GET /api/farmacia/eps` | Resuelve la vinculación de la cuenta autenticada; no acepta parámetros |
| `GET /api/farmacia/usuarios?buscar=...&pagina=1&tamano=25` | Consulta únicamente afiliados activos de la EPS resuelta por el servidor |

La primera pantalla protegida de Farmacia consulta la EPS al entrar después de autenticarse. En Usuarios, la respuesta del propio directorio incluye la vinculación y evita una segunda llamada a `/eps`. No se añade la EPS al JWT ni se utiliza una selección del navegador para autorizar consultas. Las siguientes consultas vuelven a resolver la relación actual.

`pagina` admite 1–100000 y `tamano` 1–50; valor predeterminado 25. La búsqueda admite hasta 150 caracteres, sin controles. Es una búsqueda literal, sin interpretar `%` o `_` como comodines, sobre nombres y apellidos combinados.

La condición EPS se incluye en SQL tanto para el total como para la búsqueda y la página. Las lecturas se hacen en una transacción `REPEATABLE READ READ ONLY`, con orden por apellidos, nombres e identificador interno del afiliado. El estado activo se comprueba con `lower(btrim(estado))='activo'`; no se reescriben estados almacenados.

Respuesta de consulta:

```json
{
  "ok": true,
  "vinculacion": {
    "estado": "VINCULADA",
    "eps": { "id": "identificador existente", "nombre": "nombre existente" },
    "mensaje": "Consulta limitada a tu EPS vinculada."
  },
  "pacientes": [{ "nombres": "valor de origen", "apellidos": "valor de origen", "estado": "Activo" }],
  "totalActivos": 1,
  "paginacion": { "pagina": 1, "tamano": 25, "total": 1, "paginas": 1 }
}
```

El JSON anterior describe el contrato; no es un registro creado ni evidencia de un afiliado real consultado.

Estados sin acceso:

- `SIN_VINCULO`: respuesta informativa, `eps:null`, lista vacía y ninguna consulta a afiliados.
- `EPS_NO_VIGENTE`: mismo cierre si la EPS asignada está inactiva o ausente.
- `FARMACIA_EPS_AMBIGUA`, HTTP 409: más de un vínculo activo; no se escoge uno arbitrariamente ni se leen pacientes.
- Parámetros como `eps_id`, `epsId`, `farmacia_id`, `usuario_id` o `estado` se rechazan con HTTP 400. Los claims adicionales del JWT tampoco seleccionan una EPS.
- Esquema incompleto o proveedor no disponible: HTTP 503 sanitizado, sin filas ni errores privados.

El total activo corresponde a todos los afiliados activos de la única EPS autorizada. `paginacion.total` cuenta las coincidencias de la búsqueda dentro del mismo ámbito. Ninguna consulta carga el directorio global para filtrarlo en el navegador.

### Administración autorizada

Se reutiliza `requireAdmin`: JWT, cuenta vigente y rol actual 1. La transacción vuelve a comprobar tanto al administrador como a la cuenta Farmacia activa. Farmacia, Paciente y EPS no adquieren estos permisos.

| Operación | Uso |
|---|---|
| `GET /api/admin/farmacias/:id/eps` | Consulta vínculo actual, EPS vigentes seleccionables y si la escritura está habilitada |
| `PUT /api/admin/farmacias/:id/eps` | Crea o cambia la vinculación, con condición de versión |

Primera asignación, únicamente después de consultar el estado actual:

```json
{ "epsId": "ID_REAL_DE_EPS_VIGENTE", "vinculoActual": null }
```

Cambio de EPS: enviar en `vinculoActual` **solo** el `id` y la `version` obtenidos del GET:

```json
{ "epsId": "ID_REAL_DE_OTRA_EPS_VIGENTE", "vinculoActual": { "id": 123, "version": 1 } }
```

Los identificadores anteriores son marcadores de documentación, no asignaciones realizadas.

La operación:

1. Bloquea las filas del administrador y de la cuenta Farmacia en orden determinista y revalida sus roles/estados.
2. Comprueba que el índice sea único, válido, listo, sobre `farmacia_id`, de la tabla correcta y con el predicado de vínculo activo. No basta que exista un índice con el mismo nombre.
3. Comprueba y bloquea para lectura la EPS de destino vigente.
4. Bloquea el vínculo actual y compara identificador/versión. Una lectura antigua produce HTTP 409.
5. Desactiva el vínculo anterior y crea o reactiva el de destino, incrementando versiones, dentro de la misma transacción.
6. Registra al actor y los campos modificados en `administrative_audit`. Si falla el registro, también se revierte el cambio de EPS.

La fila de la cuenta Farmacia serializa operaciones concurrentes aun cuando todavía no existe un vínculo. El índice único protege además frente a otros escritores que no utilicen ese bloqueo. La restricción permite varias cuentas Farmacia en una EPS; impide varias EPS activas para la misma cuenta.

No se crean EPS ni se modifican cuentas, afiliaciones o estados de pacientes. No hay endpoints de creación/edición/eliminación de pacientes para Farmacia. Un PUT desde Farmacia a `/farmacia/eps` no existe.

## Base de datos y puesta en servicio pendiente

Se utilizan las tablas existentes `usuarios`, `eps_entidades`, `eps_farmacias`, `afiliados` y `administrative_audit`, mediante SQL parametrizado. No se usa el directorio administrativo global ni la lectura global de la fuente externa EPS.

Archivo nuevo preparado, **no ejecutado**:

`backend/prisma/migrations/20261115120000_farmacia_eps_unica/migration.sql`

Contiene únicamente un índice único parcial en `public.eps_farmacias(farmacia_id)` para filas activas. No crea ni modifica pacientes o relaciones, no reconstruye las migraciones EPS originales y no corrige duplicados automáticamente. Si existen duplicados activos, la creación debe fallar y requerir revisión.

No se debe tratar esta entrega como autorización para desplegar automáticamente todo el historial local: siguen faltando los originales `20261114090000_eps_workspace` y `20261115090000_eps_role_integration`, y hay otras migraciones preparadas pendientes. La aplicación de la restricción y la asignación real requieren una intervención separada autorizada. Notificaciones continúa desactivado.

## Archivos de esta intervención

Nuevos:

- `backend/src/validators/farmacia-eps.validator.js`
- `backend/src/repositories/farmacia-eps.repository.js`
- `backend/src/services/farmacia-eps.service.js`
- `backend/src/controllers/farmacia-eps.controller.js`
- `backend/prisma/migrations/20261115120000_farmacia_eps_unica/migration.sql`
- `backend/tests/farmacia-eps.test.cjs`
- `frontend/public/js/farmacia-usuarios.js`
- Este informe.

Modificados, conservando los cambios previos:

- `backend/src/routes/farmacia.routes.js`
- `backend/src/routes/admin.routes.js`
- `frontend/src/layouts/FarmaciaLayout.astro`
- `frontend/src/pages/pages/farmacia-usuarios.astro`
- `frontend/public/js/farmacia.js`
- `frontend/public/js/farmacia-context.js`
- `frontend/public/css/farmacia.css`
- `backend/tests/frontend.test.cjs`
- `backend/tests/farmacia-pages.test.cjs`

Los permisos y funciones existentes de Administrador, Paciente y EPS se conservan. Solo se añade la operación administrativa solicitada; no se cambian los contratos anteriores de cuentas, perfil o chat.

## Pruebas y evidencia

| Verificación final | Resultado |
|---|---|
| Suite completa con aislamiento de base y Edge headless | **545 aprobadas; 0 fallidas; 0 omitidas**, 154,25 s |
| Nuevas pruebas de vinculación/directorio | 13, incluidas en la suite completa |
| Pruebas frontend `.test.mjs` | 6 aprobadas |
| Compilación Astro | Aprobada |
| Astro check | 0 errores; 0 advertencias; una sugerencia previa por variable sin uso |
| Prisma validate | Aprobado; no ejecuta migraciones |
| `git diff --check` | Sin errores de espacios |

Casos nuevos: pacientes activos/inactivos/estado nulo, distintas EPS, cuentas Farmacia autorizadas/no autorizadas/inactivas/con rol revocado, pacientes sin cuenta local, búsqueda, paginación, totales, rechazo de parámetros y claims de EPS, vínculo ambiguo, EPS no vigente, índice ausente, cambio/reactivación, precondición de versión, concurrencia entre administradores, auditoría y rollback.

El navegador utiliza HTTP y código de la aplicación reales con persistencia simulada en memoria. Comprueba 1440/820/390 px, búsqueda y recarga, filas como texto sin XSS, total independiente del filtro, ausencia de selector de EPS y CRUD, cambio administrativo de EPS, retirada del vínculo y limpieza de la lista. Se corrigió un estilo móvil que superponía la paginación; una aserción comprueba que quede después de la tabla.

Evidencia temporal de la ejecución final: `C:\Users\SAMIRA~1\AppData\Local\Temp\saludclick-eps-verificado-RCOOcs\regresion.tap`, con capturas `usuarios-eps-1440.png`, `usuarios-eps-820.png` y `usuarios-eps-390.png` en el mismo directorio. Solo contienen datos ficticios en memoria; no se crearon pacientes ficticios en PostgreSQL.

**Límite de las pruebas:** el aislamiento/concurrencia y el rollback administrativos están comprobados con el doble transaccional, no mediante escrituras reales en PostgreSQL. No se aplicó el índice en una base real. La validación final de escritura e integridad física queda pendiente de un entorno PostgreSQL autorizado.

## Comprobación real de solo lectura

Con la conexión forzada a `default_transaction_read_only=on` se confirmó que `eps_farmacias` sigue teniendo cero registros. No se ejecutó ningún PUT real.

| GET real | Resultado |
|---|---|
| `/api/farmacia/eps` | 200, `SIN_VINCULO` |
| `/api/farmacia/usuarios` | 200, `SIN_VINCULO`, 0 pacientes y total 0; sin leer afiliados |
| `/api/admin/farmacias/[id]/eps` | 200, `escrituraHabilitada:false` |

No se publican identidades, tokens ni nombres de afiliados reales. El listado real no puede mostrar pacientes hasta que se instale la protección única y un administrador autorizado asigne la EPS correcta. No se eligió una EPS por suposición.

Se conservan los archivos de Administrador, respaldos, stash y correcciones anteriores. No se activaron Notificaciones ni fórmulas, no hubo migraciones ni escrituras en Neon y no se crearon commits ni push.
