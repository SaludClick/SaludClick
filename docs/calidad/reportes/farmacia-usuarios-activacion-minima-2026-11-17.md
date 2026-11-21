# Usuarios de FARMACIA: comprobación real y activación mínima pendiente

Estado: **BLOQUEADO, no terminado ni activado**. Rama `integracion/farmacia-pendientes`.
**Estado vigente, 21:13 UTC:** los dos originales EPS ya están recuperados y
restaurados localmente con hashes exactos. Las 13 migraciones aplicadas coinciden
con sus archivos locales. La recuperación histórica deja de ser un pendiente;
falta autorizar e instalar el índice y crear el vínculo. Detalle y evidencia en
la actualización final de este documento. Los apartados horarios anteriores
conservan el diagnóstico previo y no implican autorización para ejecutar SQL.
Se detuvo el trabajo de los demás módulos. No se escribieron datos en Neon ni se
ejecutaron migraciones, vínculos, commit, push o merge.

## Hallazgo real (17/11/2026, 20:50:14 UTC)

Evidencia nueva: [JSON de solo lectura](farmacia-usuarios-real-2026-11-17.json).
El script `backend/scripts/farmacia-usuarios-real-readonly.cjs` usa las consultas
de producción dentro de transacciones `READ ONLY`, revierte al finalizar y no
publica nombres, correos ni documentos de pacientes. Su salida no sobrescribe archivos.

| Comprobación | Resultado real |
|---|---|
| ADMINISTRADOR | 5 cuentas locales y 50 afiliados EPS; 55 registros del directorio |
| Cuentas locales de pacientes | 2; ninguna tiene correspondencia única por tipo/número con los afiliados |
| EPS propuesta | `1`, EPS VidaPlena, activa |
| Fuente EPS | 50 afiliados activos; los 50 están en ADMINISTRADOR |
| Igualdad entre consultas | ID original y seis campos coinciden para los 50: nombres, apellidos, tipo, número, correo y estado |
| Búsqueda real | Documento, correo y filtro de tipo documental comprobados |
| Farmacia | `4`, Farmacia SaludClick, rol 3 ACTIVO; titularidad institucional requiere confirmación humana |
| Vínculo Farmacia 4 | No existe |
| Índice de EPS única | No existe |
| Respuesta real del repositorio de Usuarios | `SIN_VINCULO`, 0 pacientes |

Consultar la fuente propuesta no equivale a haber autorizado el acceso desde la
cuenta Farmacia 4. No se falsificó una sesión, ni se inyectó una relación en la
base real, ni se presenta la consulta directa como una pantalla ya operativa.

## Fuentes y recorrido

- ADMINISTRADOR: `GET /api/administrativo/usuarios` (montaje comprobado en
  `backend/src/routes/index.js`), `administrative.controller.users` →
  `administrative-directory.service` → `administrative-directory.repository.read`
  (`usuarios`) + `afiliados-origen.repository.leer` (fuente original EPS).
  `/api/admin/cuentas` consulta únicamente cuentas locales mediante
  `administrative.repository.users`; no confundirlo con todo el directorio.
- EPS original: `EPS_DATABASE_URL`, esquema configurado por
  `EPS_DATABASE_SCHEMA`, tablas `afiliados` y `eps`. El repositorio consulta los
  13 campos originales, no una copia. El router EPS de este backend solo tiene
  `verificar-acceso`; no se inventó un endpoint de afiliados inexistente.
- FARMACIA: `GET /api/farmacia/usuarios` → rol/sesión/cuenta vigente →
  `farmacia-eps.service` → `farmacia-eps.repository.consultar` →
  `eps_farmacias` + `eps_entidades` → `afiliados-origen.leerAutorizados`.
  El ID de farmacia procede de la sesión, y la EPS, del vínculo persistido;
  el navegador no puede elegir otra farmacia o EPS.

**No hacen falta cuentas nuevas ni relaciones paciente–afiliado para listar los
50 afiliados autorizados.** Esas relaciones pertenecen al acceso a solicitudes y
no se usan como requisito del directorio. Las dos cuentas locales sin afiliación
verificada no se muestran como pacientes de VidaPlena por inferencia de nombre.
Los otros roles y las cuentas administrativas no se exponen a FARMACIA.

## Correcciones implementadas

Se añaden correo y tipo de documento a la tabla, búsqueda por correo y filtro de
tipo documental, conservando inicial, búsqueda, paginación y filtros al recargar.
Los valores se renderizan con `textContent`. Un dato ausente se muestra como
`No disponible`. La consulta sigue limitada a afiliación activa, sin ampliar
permisos para afiliados inactivos. No hay edición ni copia de pacientes.

Cada consulta nueva lee origen; `Actualizar consulta` recupera sus cambios.
No se escribieron cambios en origen para ensayar sincronización: se verifican
igualdad real y ausencia de caché, y se prueba actualización con base efímera.
Si un dato de cuenta local y uno EPS discrepan, no se fusionan automáticamente:
el directorio de FARMACIA muestra la ficha EPS con su ID original. Una modificación
de una cuenta local no cambia por sí sola la afiliación original.

## Operaciones exactas que requieren autorización

Solo para Usuarios; no aplicar las otras cuatro migraciones de operación/stock,
no activar banderas de operación/notificaciones/stock, rutas automáticas o permisos
clínicos. No usar `prisma migrate deploy` contra el historial incompleto.

**Precondición de DDL que se conserva:** recuperar y verificar los originales
`20261114090000_eps_workspace` y `20261115090000_eps_role_integration` conforme al
informe forense. El archivo de índice ya exigía esta revisión; esta prioridad no
autoriza saltarla. No recrear esos archivos ni tocar sus registros/checksums.

1. Confirmar que la cuenta 4 representa una farmacia autorizada por EPS VidaPlena
   y que se aprueba consultar los seis campos indicados, incluido correo. Confirmar
   el actor administrativo real; la lectura encontró al administrador activo 1.
   Repetir preflight en lectura, respaldar esquema/relaciones y comprobar ausencia
   de vínculos para 4 y de duplicados activos en todas las farmacias.
2. Autorizar e instalar **solo** el DDL conocido de
   `backend/prisma/migrations/20261115120000_farmacia_eps_unica/migration.sql`:

   ```sql
   BEGIN;
   SET LOCAL lock_timeout='3s';
   SET LOCAL statement_timeout='30s';
   CREATE UNIQUE INDEX "eps_farmacias_una_eps_activa_key"
   ON "public"."eps_farmacias" ("farmacia_id") WHERE "activa" = true;
   COMMIT;
   ```

   No contiene `IF NOT EXISTS`: si cambia el estado, detenerse y revisar.
   Riesgo: bloqueo de escritura breve sobre relaciones EPS; falla ante
   duplicados, no los corrige. El índice limita a una EPS activa por farmacia
   en toda la tabla; por eso exige revisión global y autorización de DDL.
3. Registrar únicamente esa migración NUEVA tras comprobar definición exacta,
   resultado de DDL y checksum del archivo, conservando evidencia. Esto es otra
   escritura autorizable en el historial. Nunca marcar las dos EPS ausentes.
   Comando preparado, **no ejecutado**:

   ```powershell
   # Desde backend, SOLO después de verificar la instalación autorizada anterior.
   npx --no-install prisma migrate resolve --applied 20261115120000_farmacia_eps_unica
   ```

4. Con aprobación independiente de identidad/acceso, usar la sesión vigente del
   administrador aprobado para consultar `GET /api/admin/farmacias/4/eps`.
   Debe indicar `vinculoActual:null` y `escrituraHabilitada:true`. Luego:

   ```http
   PUT /api/admin/farmacias/4/eps
   Authorization: Bearer <sesión administrativa real>
   Content-Type: application/json

   {"epsId":"1","vinculoActual":null}
   ```

   Es el endpoint existente: transacción, bloqueo de cuentas y relación,
   validación de rol/estado/EPS, control de versión y auditoría. Como alternativa
   SQL exacta ya preparada, usar `30-vinculo-farmacia4-eps1.sql` del paquete con
   actor, aprobación y confirmación institucional reales. **No ejecutar ambos.**
   Consecuencia: la farmacia obtiene acceso de lectura a los afiliados activos
   de esa EPS; no se asignan solicitudes ni se verifica identidad individual.
5. Publicar los archivos frontend/backend cambiados mediante el procedimiento
   aprobado del entorno (el build local no demuestra despliegue). Iniciar sesión
   real como Farmacia 4 y abrir Usuarios. Verificar 50 registros, 25 por página,
   tipos/correos y coincidencia por ID con ADMINISTRADOR/EPS; probar búsquedas,
   inicial, tipo, navegación y actualización. Repetir el verificador con otro
   nombre de archivo: debe devolver `VINCULADA` y 50 pacientes, no el estado actual.
   Probar otra farmacia y rechazar selección de EPS desde query/JWT modificado.

No se elimina la guarda del paquete integral. Tras instalar solo el índice,
el paquete integral antiguo dejaría de ser aplicable sin reconciliar/regenerar
su alcance: no ejecutar su SQL de cinco migraciones a ciegas.

## Reversión preparada

Antes de cualquier activación, conservar el ID/version devueltos. La reversión
funcional desactiva únicamente ese vínculo, por comparación exacta de ID,
EPS, farmacia y versión esperados, registra auditoría y conserva historial.
SQL exacto: `farmacia-usuarios-reversion-2026-11-17.sql` en esta carpeta; requiere
parámetros de sesión y autorización de reversión. Si la versión cambió, aborta.
Después, la consulta debe volver a `SIN_VINCULO`, sin pacientes.

El índice se conserva por defecto: protege integridad y no concede acceso. Su
eliminación sería una autorización de DDL distinta, con todas las farmacias
aisladas y revisión de relaciones que se hayan creado después. No borrar el
historial Prisma ni fingir que un DDL confirmado nunca se aplicó. Si se exigiera
reversión física del esquema, usar snapshot ensayado o migración compensatoria
revisada, no `migrate resolve --rolled-back` sobre una migración exitosa.

## Validación de esta etapa

Consulta real descrita arriba y JSON persistido. Pruebas nuevas de esta etapa:

| Validación | Resultado / evidencia en raíz |
|---|---|
| Origen, identidad, condiciones de pago y reversión SQL | 8/8, `farmacia-usuarios-origen-reversion-2026-11-17.tap` |
| HTTP, navegador Edge, directorio, permisos y regresión de solicitudes | 30/30, `farmacia-usuarios-http-browser-cierre-2026-11-17.tap` |
| Frontend | 7/7, `farmacia-usuarios-frontend-2026-11-17.tap` |
| Build frontend | Correcto, 18 páginas; `farmacia-usuarios-build-2026-11-17.txt` |
| Revisión de diferencias y sintaxis del verificador | Correctas |

El primer ensayo HTTP tenía una expectativa incorrecta de la fixture (hay 15
afiliados TI, no cero); se corrigió la expectativa y se volvió a ejecutar la
validación completa indicada, sin alterar datos reales. Los ensayos locales no
se presentan como acceso autorizado real de Farmacia 4. La rama posterior a una
activación se comprobará con sesión real y nueva evidencia; permanece pendiente.

**Solicitud pendiente:** confirmar autorización institucional 4→1 y autorizar
por separado el índice conocido, su registro comprobado y el vínculo auditado.
No se ejecutará DDL hasta recuperar/revisar los originales EPS pendientes. Esta
confirmación no autoriza otros módulos, identidades individuales ni datos nuevos.

## Revisión prioritaria posterior: 17/11/2026, 21:00:03 UTC

Se repitió la lectura real y se guardó evidencia nueva, sin sobrescribir la
anterior: [prevalidación](farmacia-usuarios-prevalidacion-2026-11-17.json).
Siguen existiendo 50 afiliados activos coincidentes con ADMINISTRADOR, cuenta 4
activa, EPS 1 activa, cero vínculos para 4 y cero duplicados activos globales.
El índice sigue ausente. Las tablas `usuarios`, `eps_entidades`, `eps_farmacias`
están disponibles, con acceso de lectura a la fuente EPS y filtros comprobados.

La pantalla usa exactamente `apiFetch('/api/farmacia/usuarios?' + query)` en
`frontend/public/js/farmacia-usuarios.js`, inicializada por `farmacia.js` después
de `GET /api/farmacia/verificar-acceso`. Las consultas normales usan 25 filas y
parámetros `pagina`, `buscar`, `inicial`, `tipo_documento`; la EPS no se envía desde
la pantalla. `api.js` añade el token de la sesión y el origen configurado de API.
La respuesta exige `vinculacion`, `pacientes`, `totalActivos`, `paginacion`.

**El GET no exige el índice**; el índice es requisito del PUT administrativo que
crea el vínculo. La causa directa de `SIN_VINCULO` es la relación inexistente.
Las banderas operación/notificaciones están apagadas en el entorno consultado:
Usuarios no necesita activarlas ni instalar `farmacia_sesiones` u otras tablas de
operación. Activar operación sin su esquema sí introduciría un bloqueo adicional;
por eso este cambio mínimo conserva las banderas actuales.

No se detectó otro bloqueo técnico en las lecturas/configuración comprobadas.
Esto no certifica el despliegue remoto ni la autenticación de una sesión real:
siguen pendientes la autorización institucional, la reconciliación histórica
previa al DDL y la comprobación de sesión/pantalla después de la activación.

### Historial exacto pendiente de recuperación

No falta un archivo: faltan **dos originales**, ambos ya aplicados según la
nueva consulta de `_prisma_migrations`:

| Migración histórica | SHA256 exacto requerido |
|---|---|
| `20261114090000_eps_workspace` | `2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835` |
| `20261115090000_eps_role_integration` | `99b5dca81847e36f95f4f0d1372dd4598705abb5eb98f408ead9d7637212076e` |

Recuperar del artefacto original/autor/CI autorizado y verificar bytes; no
reconstruir, volver a ejecutar ni marcar de nuevo como aplicadas. El índice
faltante pertenece a otra migración NUEVA, que sí existe localmente:
`20261115120000_farmacia_eps_unica`, índice
`eps_farmacias_una_eps_activa_key`, único sobre `farmacia_id WHERE activa=true`.
La precondición está escrita en ese `migration.sql`: “Do not apply before
recovering/reviewing the original EPS migrations”. No se eliminó ni se eludió.

### Prueba local reforzada y resultado

Se cambió el ensayo de 50 afiliados para activar el vínculo por el **PUT real del
router administrativo**, con su autorización y auditoría de prueba, en lugar de
insertarlo directamente en la fixture. Otro ensayo abre el frontend construido
en Edge con Farmacia 4 de prueba: verifica 25 + 25 filas, 50 IDs originales únicos,
exclusión de otra EPS/inactivos, búsqueda por correo, tipo e inicial y actualización
ante cambio del origen. Las consultas no generan escrituras ni copias.

**21 pruebas aprobadas, 0 fallidas, 0 omitidas**, incluidas las pruebas de
navegador, origen SQL y reversión; evidencia en raíz:
`farmacia-usuarios-prioridad-validacion-2026-11-17.tap`.
Todos los datos de este ensayo son fixtures locales y no acreditan una sesión real.

### Criterio de aceptación posterior con sesión real

Solo después de las autorizaciones y operaciones mínimas anteriores:

1. Entrar por el login normal como Farmacia 4. No fabricar JWT ni usar la sesión
   de ADMINISTRADOR para simular al titular. Confirmar `GET /api/auth/profile`:
   usuario `id:4`, `rol_id:3`, `estado:ACTIVO`.
2. Abrir `/pages/farmacia-usuarios.html` sin filtros. En la pestaña Network,
   comprobar el origen real configurado de API, `verificar-acceso` 200 y
   `GET /api/farmacia/usuarios?pagina=1&buscar=` 200, sin respuestas simuladas.
3. Exigir vínculo `VINCULADA`, EPS `id:"1"`, total 50, página 1 de 2, 25 filas
   visibles con tipo/correo. Pulsar Siguiente: otras 25, página 2 de 2. Comparar
   los 50 `identificador` de ambas respuestas: ninguno repetido y conjunto igual
   al de origen autorizado. El total 50 solo es válido si el origen sigue igual;
   cualquier cambio requiere conciliación en lectura, nunca forzar el contador.
4. Probar documento y correo de una fila real, inicial y tipo; verificar conteos,
   limpiar filtros y recargar. Cada petición debe conservar EPS 1. No guardar
   HAR/tokens o datos personales completos en informes públicos.
5. Pulsar Actualizar consulta y contrastar una lectura contemporánea de EPS y
   ADMINISTRADOR. No modificar personas reales para fabricar una prueba de
   sincronización. Comprobar otra farmacia con su sesión real autorizada: no
   obtiene EPS 1 sin su propio vínculo. Consultas con `eps_id`/`farmacia_id` deben
   rechazarse, sin conceder acceso.
6. Repetir `node scripts/farmacia-usuarios-real-readonly.cjs <ruta-json-nueva>`
   desde backend: exige correspondencia de IDs/campos al estar vinculada.
   Conservar fecha, conteos, resultado de sesión y huellas sin exponer pacientes.

**Hasta completar este criterio, Usuarios permanece no terminado y no activado.**

## Originales recuperados y activación mínima lista para autorización

Se completó la búsqueda pedida, sin escrituras en Git remoto ni Neon:

| Fuente revisada | Resultado y límite |
|---|---|
| Git local: todas las refs, ramas, stash, reflogs, worktrees y objetos incluidos sin refs | Sin originales; la inspección inicial cubrió 2.016 objetos / 1.193 blobs y respaldo `.git_backup` de 46 objetos / 22 blobs. No se modificaron refs |
| Carpetas SaludClick, Downloads, Documents, OneDrive, git y `.git_backup` | 127 SQL comparados y 47 ZIP revisados, sin extracción ni ejecución; ningún hash coincidente |
| `Downloads/SaludClick.zip` y `Downloads/backend.zip` | 20.018/2.304 entradas y 10/1 SQL respectivamente, sin coincidencias |
| Límites de lectura | Dos SQL ajenos de más de 2 MB excluidos, rutas exactas documentadas en `farmacia-eps-busqueda-respaldos-2026-11-17.json`; la búsqueda amplia por nombre encontró cuatro carpetas temporales de `device_systems` inaccesibles. No se afirma cobertura de esas rutas |
| GitHub público: 9 ramas actuales, historial por las dos rutas | 18 consultas completadas, sin paginación pendiente; dos candidatos, ambos SHA256 exactos |

**Procedencia de ambos originales:** commit
`94eddb28e8466f82a50ab351b00894df82555f49`, alcanzable desde `main` remoto
`8d38a0ea7066e2955fdca43141fbdfe31f48ec30` en esta consulta. Este HEAD remoto
cambió respecto a la búsqueda anterior; no se hizo fetch, checkout, commit o merge.
Se guardaron copias en `docs/calidad/reportes/originales-eps-recuperados/` y se
restauraron en `backend/prisma/migrations/<nombre>/migration.sql` solo después de
comparar sus bytes con ambos checksums de la tabla anterior. No hubo reconstrucción.

Evidencia verificable:

- `farmacia-eps-historial-remoto-2026-11-17.json`: refs, commits por ruta,
  respuestas HTTP y SHA256 de ambos candidatos.
- `farmacia-eps-busqueda-respaldos-2026-11-17.json`: rutas, archivos, ZIP y límites.
- `farmacia-usuarios-historia-reconciliada-2026-11-17.json`: nueva lectura real
  a las 21:13:10 UTC. Las **13 migraciones aplicadas** coinciden byte a byte con
  los archivos locales; no hay aplicaciones incompletas, índice o vínculo nuevos.
  Se mantienen 50 afiliados y `SIN_VINCULO`. No hay triggers de usuario en
  `eps_farmacias` ni duplicados activos globales en esta captura.

Se revisaron las definiciones históricas originales: `eps_farmacias` tiene ID,
EPS, farmacia, activa, versión y fecha, FK a EPS/usuario y unicidad por pareja.
La migración local pendiente añade únicamente la unicidad parcial por farmacia
activa. Su SHA256 es
`0c381d78cd94d9b41af560cbfe9e302297b5c99d24a4e7dd7881c55198fe0479`.
No modifica pacientes, roles, cuentas, stock o permisos. Sus restricciones son
globales para la tabla de relaciones: comprobar duplicados antes del índice.

El nuevo ensayo `farmacia-eps-originales-integration.test.cjs` instala los
originales exactos **solo en PGlite efímero**, comprueba que el PUT rechaza la
vinculación sin índice y, al instalar solo ese índice, crea el vínculo con el
repositorio de producción. Obtiene 25+25 afiliados desde otra base de origen,
50 IDs únicos y los seis campos intactos. Otra farmacia queda `SIN_VINCULO`, EPS
no puede consultar como farmacia y no cambian usuarios, roles, EPS, afiliados
locales, pedidos, pagos, catálogo ni eventos/notificaciones EPS. Solo se crean
la relación aprobada de prueba y su auditoría.

### Orden vigente y autorizaciones pendientes

La precondición de recuperación histórica ya se satisfizo. **No se reejecutan
los dos originales ni se vuelven a marcar como aplicados.**

1. Confirmar institucionalmente que Farmacia 4 puede leer los afiliados activos
   de VidaPlena 1 y aprobar alcance/correo, actor administrativo y ventana.
2. Repetir precheck de solo lectura, conservar snapshot de relaciones/esquema y
   aprobar el DDL mínimo del paso 2 anterior: solo índice
   `eps_farmacias_una_eps_activa_key`. No ejecutar el SQL de cinco migraciones ni
   `migrate deploy`; no activar otras banderas.
3. Autorizar el registro de la migración NUEVA del índice, exclusivamente después
   de verificar instalación/definición/hash y conservar evidencia. No cambiar
   checksums de las 13 aplicaciones históricas.
4. Autorizar el PUT administrativo del paso 4 anterior con
   `{"epsId":"1","vinculoActual":null}`. Crea solo el acceso de Farmacia 4 y la
   auditoría. No cambia vínculos de otras farmacias ni copia/crea pacientes.
5. Realizar la validación de sesión real y la comparación de los 50 IDs descrita
   arriba. Si falla, detener exposición y aplicar la reversión exacta autorizada;
   conservar auditoría y el índice por defecto.

**Riesgos autorizables:** bloqueo breve/global de DDL; rechazo por duplicados
o estado cambiado; escritura en historial; exposición de datos de la EPS a la
cuenta 4 por el vínculo; indisponibilidad del origen o despliegue desactualizado.
El índice por sí solo no concede acceso a nadie. No se conceden permisos a otros
roles ni se activan asignaciones/identidades individuales. El paso 4 requiere
confirmar legitimidad institucional, no solo coincidir IDs/nombres.

Se conservó la guarda de reconciliación del paquete integral y se actualizó su
manifiesto local por la recuperación de archivos; eso no autoriza su aplicación.
Resultados de esta etapa: `farmacia-usuarios-originales-recuperados-2026-11-17.tap`
incluye 16 pruebas aprobadas. La validación dirigida de cierre pasó **37/37**, sin
fallos ni omisiones, en 31,6 s:
`farmacia-usuarios-recuperacion-cierre-2026-11-17.tap`. Incluye originales exactos,
paquete/guardas, origen SQL, API administrativa, aislamiento, pantalla en Edge,
50 IDs en dos páginas y reversión. Sintaxis y `git diff --check` correctos.

No se ejecutaron escrituras, migraciones ni activaciones en Neon. Restaurar
archivos históricos localmente y ensayarlos en una base efímera no equivale a
activarlos en producción. No se hizo commit, push, merge o cambio de rama.
