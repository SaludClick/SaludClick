# Notificaciones FARMACIA: revisión de migración y procedimiento condicionado

Fecha: 2026-11-14. Resultado: **SQL/modelo coherentes; activación NO autorizada
ni ejecutada. Falta completar el historial local y probar la recuperación.**

Esta preparación agregó solamente este informe. No cambió código, configuración,
roles, permisos, migraciones ni datos. No hubo commit, push o despliegue.

## Evidencia obtenida ahora

Se abrieron dos sesiones de inspección de Neon en transacciones explícitas READ ONLY,
finalizadas con ROLLBACK. No se ejecutó Prisma Migrate contra Neon.

- Base consultada: `neondb`, esquema `public`, PostgreSQL 18.7.
- `transaction_read_only=on` durante las consultas.
- La tabla `public.notificaciones_farmacia` NO existe.
- No hay registro de `20261114120000_farmacia_notificaciones` en el historial.
- `usuarios` tiene `PRIMARY KEY (id)`, compatible con la FK propuesta.
- La identidad usada tiene CREATE en public; esto NO constituye autorización.
- El archivo local `.env` no define `FARMACIA_NOTIFICACIONES_ENABLED`.
  El proceso de inspección tampoco lo tiene habilitado. No se inspeccionó el
  entorno de un servidor remoto en ejecución, cuyo estado no se certifica.
- `prisma validate` aprobado usando una URL local reservada, sin conexión.
- Interruptor probado en un proceso local separado: ausente/false/TRUE/1
  desactivan; solamente el literal `true` activa. Cinco escenarios aprobados.

SQL revisado íntegramente:

```sql
CREATE TABLE "notificaciones_farmacia" (
    "id" SERIAL NOT NULL,
    "destinatario_id" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "mensaje" VARCHAR(500) NOT NULL,
    "referencia_evento" VARCHAR(180) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida_at" TIMESTAMPTZ,
    CONSTRAINT "notificaciones_farmacia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificaciones_farmacia_destinatario_id_fkey"
      FOREIGN KEY ("destinatario_id") REFERENCES "usuarios"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notificaciones_farmacia_destinatario_evento_key"
  ON "notificaciones_farmacia"("destinatario_id", "referencia_evento");
CREATE INDEX "notificaciones_farmacia_destinatario_fecha_idx"
  ON "notificaciones_farmacia"("destinatario_id", "created_at", "id");
CREATE INDEX "notificaciones_farmacia_destinatario_leida_idx"
  ON "notificaciones_farmacia"("destinatario_id", "leida_at");
```

El archivo original también contiene un comentario de autorización pendiente.
Su SHA-256, incluyendo sus bytes actuales, es:

`18F64542515FCAE7792804107386F2F8D43FFEA1FF75E91F75F44A0A507EE0EF`

## Evaluación de seguridad

| Elemento | Resultado y límite |
|---|---|
| PK y secuencia | SERIAL/Int autoincremental, PK id; coherente con Prisma. |
| FK | Usuario obligatorio, eliminación restringida, actualización en cascada; coherente con Prisma. |
| Duplicados | UNIQUE destinatario/referencia, ambos NOT NULL; más `skipDuplicates` en Prisma. Protege reintentos concurrentes en la BD. |
| Índices | Destinatario/fecha/ID para orden estable; destinatario/lectura para filtros y contador. |
| Datos anteriores | No hay INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER TABLE sobre tablas existentes, GRANT o REVOKE. No se cargan registros. |
| Cambios físicos | Se crean tabla, secuencia, índices y dependencia FK; la DDL modifica catálogos. La nueva FK puede bloquear futuras eliminaciones de usuarios con avisos. |
| Roles | La FK valida existencia, NO rol 3. No hay RLS en esta tabla. La pertenencia al rol y el aislamiento dependen del backend; acceso SQL privilegiado no queda aislado por usuario. |
| Valores | NOT NULL y longitudes; no CHECK para título vacío, tipo permitido o fecha de lectura posterior a creación. No son requisitos para ejecutar la DDL, pero son límites de integridad. |
| Referencia de evento | Texto, no FK al pedido. Deduplica por referencia; su integridad semántica depende del generador interno. |
| Información sensible | El generador actual guarda texto genérico y no copia datos clínicos. El esquema por sí solo no impide que otro escritor guarde texto sensible. |
| Atomicidad | El SQL no incluye BEGIN/COMMIT; se propone envolverlo en una sola transacción externa. |
| Esquema | Nombres sin calificar; es obligatorio fijar search_path=public al aplicar. |
| Bloqueos | Crear la FK requiere un bloqueo breve sobre la tabla referenciada. Usar lock_timeout y ventana acordada; abortar si no se obtiene el bloqueo. |
| Reejecución | No es idempotente: CREATE fallará si los objetos ya existen. No agregar IF NOT EXISTS para ocultar una aplicación parcial. |

Los privilegios predeterminados observados incluyen permisos del rol interno
`neon_superuser`; no se observaron entradas de PUBLIC en esas filas. Esto no
es una auditoría exhaustiva de membresías y privilegios efectivos. Comprobar
el propietario/ACL resultante y los permisos del usuario real del backend antes
de habilitar, sin conceder permisos nuevos sin autorización.

## Compatibilidad del historial: bloqueo pendiente

Once migraciones locales anteriores tienen registros finalizados, no revertidos.
Siete coinciden byte a byte; cuatro difieren únicamente en finales de línea:

| Migración | Comparación que coincide con Neon |
|---|---|
| `20261016220827_init` | Archivo local convertido en memoria a LF |
| `20261106000000_add_chat` | Archivo local convertido en memoria a CRLF |
| `20261112120000_administrative_workspace` | Archivo local convertido en memoria a LF |
| `20261113120000_administrative_visitors` | Archivo local convertido en memoria a LF |

No se modificó ningún archivo ni checksum registrado.

Neon contiene además dos migraciones sin archivo en este checkout:

- `20261114090000_eps_workspace`
- `20261115090000_eps_role_integration`

Recuperar sus archivos originales desde la fuente autorizada y preservar sus
bytes/checksums es un prerrequisito de trazabilidad. No ejecutarlas de nuevo,
revertirlas, eliminarlas del historial o modificar EPS para acomodar este checkout.
La FK nueva es compatible con la PK verificada, pero NO se certifica la
compatibilidad integral con SQL de EPS que no está disponible localmente.

**No usar `migrate deploy`, `migrate dev`, `migrate reset` o `db push` para
resolver esta situación.** El primero puede aplicar todas las pendientes;
los otros pueden generar cambios fuera del alcance autorizado.

## Configuración y alcance operativo

`backend/src/config/farmacia-notificaciones.js` habilita exclusivamente cuando
`process.env.FARMACIA_NOTIFICACIONES_ENABLED === 'true'`.

Apagado: endpoints de notificaciones responden 503 al usuario autorizado;
no se usa la tabla nueva desde el avance de pedidos y no se aceptan conexiones
nuevas al namespace. No se inventan notificaciones ni contadores cero.

Encendido: el cambio de estado y los avisos se guardan en una transacción
Prisma. Si falla guardar el aviso, se revierte también el cambio de estado.
Socket.IO se emite después de confirmar; HTTP/BD siguen siendo fuente de verdad.
El avance requiere cuenta activa de rol 3 y pago APROBADO no simulado.

El flag no reconfigura por sí solo el entorno de un proceso que ya está corriendo.
Debe configurarse en su supervisor y reiniciar/reemplazar ese proceso. Un reinicio
del backend compartido puede causar un corte breve a otros roles aunque no
modifique sus permisos o interfaces; coordinar la ventana y el supervisor real.
No se identificó aquí el supervisor de un despliegue remoto.

No hay recuperación automática de avisos correspondientes al intervalo apagado.
Las nuevas solicitudes y mensajes siguen pendientes de intervenir flujos
compartidos; no se activan con este flag. Stock mínimo no tiene regla definida.
La emisión Socket.IO actual es por proceso; varias instancias requieren revisión
del bus/adaptador. El sondeo HTTP recupera el estado persistido.

## Procedimiento y comandos propuestos — NO EJECUTADOS

Todos los bloques siguientes son para un operador después de autorización
expresa, historial conciliado y ensayo aislado aprobado. No constituyen permiso
para ejecutarlos ahora. No registrar secretos en transcript ni en Git.

Antes de aplicar DDL, confirmar el flag apagado en el supervisor y en TODAS las
instancias del backend, y que ningún job automático ejecutará migraciones.
Cambiar la variable de esta terminal no desactiva un servidor ya iniciado.

### 1. Preparar herramientas, destino y archivo

PowerShell desde `C:\Users\SAMIR ACOSTA\SaludClick\backend`.
Requiere clientes `psql`, `pg_dump` y `pg_restore` de PostgreSQL 18 en PATH.
No están disponibles en el PATH inspeccionado; Docker instalado tampoco estaba
disponible para verificar herramientas. No se instaló ni inició nada.

El operador debe inyectar por un canal seguro `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER`, autenticación vía passfile protegido o entorno privado, y `DATABASE_URL`
para Prisma. Ambos clientes deben apuntar al MISMO endpoint DIRECTO de la rama
principal aprobada. No copiar URLs con contraseña a la línea de comandos.
`PGSSLROOTCERT` debe apuntar a una CA confiable verificada; no omitir la
verificación si aparece un error de certificados.

```powershell
Set-Location -LiteralPath 'C:\Users\SAMIR ACOSTA\SaludClick\backend'
$ErrorActionPreference = 'Stop'
$farmaciaMigration = '20261114120000_farmacia_notificaciones'
$farmaciaSql = (Resolve-Path "prisma/migrations/$farmaciaMigration/migration.sql").Path
$farmaciaHash = '18F64542515FCAE7792804107386F2F8D43FFEA1FF75E91F75F44A0A507EE0EF'
if ((Get-FileHash -LiteralPath $farmaciaSql -Algorithm SHA256).Hash -ne $farmaciaHash) {
    throw 'El SQL cambió: requiere nueva revisión.'
}
if (!$env:PGHOST -or !$env:PGUSER -or !$env:PGPORT -or $env:PGDATABASE -ne 'neondb') {
    throw 'Falta configurar el destino aprobado.'
}
if ($env:PGHOST -match '-pooler\.') { throw 'Se requiere endpoint directo.' }
if (!$env:PGSSLROOTCERT -or !(Test-Path -LiteralPath $env:PGSSLROOTCERT)) {
    throw 'Falta la CA verificada.'
}
$env:PGSSLMODE = 'verify-full'
$env:FARMACIA_NOTIFICACIONES_ENABLED = 'false'
node -e "const u=new URL(process.env.DATABASE_URL);if(u.hostname!==process.env.PGHOST||(u.port||'5432')!==process.env.PGPORT||decodeURIComponent(u.pathname.slice(1))!==process.env.PGDATABASE||decodeURIComponent(u.username)!==process.env.PGUSER||u.searchParams.get('sslmode')!=='verify-full')throw new Error('DESTINOS_NO_COINCIDEN');"
if ($LASTEXITCODE -ne 0) { throw 'Prisma y psql no tienen el mismo destino verificado.' }
psql --version
pg_dump --version
pg_restore --version
```

También verificar proyecto, rama y endpoint en la consola de Neon; el nombre
`neondb` por sí solo NO identifica una rama. No cambiar variables de EPS.

### 2. Respaldar y ensayar recuperación ANTES de aplicar

Usar un directorio privado con permisos ya revisados y excluido de Git.
El respaldo completo contiene información sensible: restringir acceso y conservar
la copia según la política del proyecto. No mostrar su contenido en el informe.

```powershell
$farmaciaBackupDir = Join-Path (Get-Location) 'database/backups/farmacia-notificaciones-20261114'
$farmaciaBackupFile = Join-Path $farmaciaBackupDir 'pre-migracion.backup'
if (Test-Path -LiteralPath $farmaciaBackupFile) { throw 'No sobrescribir un respaldo existente.' }
New-Item -ItemType Directory -Path $farmaciaBackupDir -ErrorAction Stop | Out-Null
pg_dump --format=custom --file=$farmaciaBackupFile
if ($LASTEXITCODE -ne 0) { throw 'Respaldo fallido: detener.' }
if ((Get-Item -LiteralPath $farmaciaBackupFile).Length -le 0) { throw 'Respaldo vacío.' }
Get-FileHash -LiteralPath $farmaciaBackupFile -Algorithm SHA256
pg_restore --list $farmaciaBackupFile | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Archivo de respaldo ilegible.' }
```

`pg_dump` obtiene una instantánea consistente. Si se comparan huellas de la
principal con el clon, calcularlas desde la misma instantánea exportada mediante
`pg_export_snapshot()` y pasar `--snapshot` a pg_dump, manteniendo abierta la
transacción READ ONLY hasta que termine. Comparar contra la principal mientras
recibe escrituras normales no demuestra ni refuta consistencia del respaldo.

El listado del archivo NO acredita recuperación. Restaurar en una base local
NUEVA y vacía ya preparada por el operador autorizado. En una terminal separada,
inyectar credenciales LOCALES; no heredar la contraseña de Neon:

```powershell
Set-Location -LiteralPath 'C:\Users\SAMIR ACOSTA\SaludClick\backend'
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '55435'
$env:PGDATABASE = 'saludclick_farmacia_recovery'
# PGUSER y autenticación: credenciales locales, suministradas en privado.
# Configurar TLS según ese servidor local; nunca reducir TLS del destino Neon.
$farmaciaBackupFile = (Resolve-Path 'database/backups/farmacia-notificaciones-20261114/pre-migracion.backup').Path
if ($env:PGHOST -ne '127.0.0.1' -or $env:PGDATABASE -ne 'saludclick_farmacia_recovery') {
    throw 'Destino de recuperación rechazado.'
}
pg_restore --exit-on-error --no-owner --no-privileges --dbname=$env:PGDATABASE $farmaciaBackupFile
if ($LASTEXITCODE -ne 0) { throw 'Restauración de ensayo fallida: no aplicar en Neon.' }
```

Verificar todas las tablas, relaciones, índices y secuencias restauradas, y las
huellas/conteos de los datos. `--no-owner --no-privileges` se usa SOLO en el ensayo
local: el archivo original conserva los metadatos. Luego aplicar allí la nueva
migración y ejecutar las pruebas reales descritas abajo. No ejecutar esas
pruebas de escritura contra la principal.

El respaldo de VITALIX del 13 de noviembre NO sustituye este respaldo nuevo.
Tampoco reutilizar `enable-vitalix-visitors.cjs`: está fijado a otra migración,
checksum y autorización, y contiene acciones de escritura.

### 3. Aplicar exclusivamente el SQL aprobado

Solo en la terminal PRINCIPAL verificada del paso 1, después de aprobar respaldo,
restauración y ensayo. Comparar el hash otra vez inmediatamente antes de aplicar.

```powershell
if ((Get-FileHash -LiteralPath $farmaciaSql -Algorithm SHA256).Hash -ne $farmaciaHash) {
    throw 'El archivo cambió después de revisarlo.'
}
$farmaciaGuardSql = @'
SET LOCAL search_path = public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Destino incorrecto';
  END IF;
  IF to_regclass('public.notificaciones_farmacia') IS NOT NULL THEN
    RAISE EXCEPTION 'La tabla ya existe: revisar, no repetir';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public._prisma_migrations
    WHERE migration_name = '20261114120000_farmacia_notificaciones'
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La migración ya tiene registro: revisar';
  END IF;
END $$;
'@
psql -X --set=ON_ERROR_STOP=1 --single-transaction --command=$farmaciaGuardSql --file=$farmaciaSql
if ($LASTEXITCODE -ne 0) { throw 'Aplicación fallida: mantener módulo apagado y revisar.' }
```

No hay alteraciones a registros de negocio anteriores. Sí se crean objetos y
se registrará metadato en `_prisma_migrations`; la autorización futura debe
abarcar ambas cosas. El timeout revierte la transacción si no obtiene bloqueo.

### 4. Verificar DDL y registrar en Prisma

Antes de registrar: comprobar ocho columnas, PK, FK validada, cuatro índices
en total (PK + UNIQUE + dos de consulta), secuencia/propiedad, ACL y tabla vacía.

```powershell
psql -X --set=ON_ERROR_STOP=1 --command="SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='notificaciones_farmacia' ORDER BY ordinal_position; SELECT conname,contype,convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.notificaciones_farmacia'::regclass; SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='notificaciones_farmacia'; SELECT count(*) AS filas_iniciales FROM public.notificaciones_farmacia;"
if ($LASTEXITCODE -ne 0) { throw 'Postverificación fallida: no habilitar ni registrar a ciegas.' }
# Tras comprobar manualmente que el resultado corresponde exactamente al SQL:
node node_modules/prisma/build/index.js migrate resolve --applied $farmaciaMigration
if ($LASTEXITCODE -ne 0) { throw 'DDL aplicada, registro pendiente: NO repetir el SQL.' }
node node_modules/prisma/build/index.js migrate status
if ($LASTEXITCODE -ne 0) { throw 'Historial requiere revisión: no activar.' }
node scripts/generate-prisma-client.cjs
if ($LASTEXITCODE -ne 0) { throw 'Cliente Prisma no disponible: no activar.' }
```

La aplicación manual y `migrate resolve` son DOS pasos y NO forman una
transacción única. Si el segundo falla después del COMMIT, dejar el módulo
apagado, inspeccionar estructura/checksum y completar solo el registro tras
revisión. No reejecutar CREATE, borrar tablas ni marcar otros registros.
La aplicación de un archivo seguido de resolve se propone para limitar el
alcance; no es un modo de eludir la conciliación previa del historial.

### 5. Activación controlada y comprobación de solo lectura

Solo después de las comprobaciones anteriores y con autorización de activación.
Configurar el flag en el supervisor real del backend. Para arranque MANUAL,
con el proceso anterior ya detenido por el operador autorizado:

```powershell
$env:FARMACIA_NOTIFICACIONES_ENABLED = 'true'
npm start
```

No arrancar una segunda copia sobre un puerto ocupado. En un servicio remoto
debe usarse su mecanismo de despliegue/reinicio; no se inventa aquí un nombre
de servicio, contenedor o comando PM2 que no se ha identificado.

Desde otra terminal, con un JWT legítimo de una sesión existente de Farmacia
inyectado en privado como `FARMACIA_JWT_VALIDACION`:

```powershell
$farmaciaApi = 'http://127.0.0.1:3000' # Arranque manual local; usar el origen real verificado si es remoto.
$farmaciaHeaders = @{ Authorization = "Bearer $env:FARMACIA_JWT_VALIDACION" }
Invoke-RestMethod -Method Get -Uri "$farmaciaApi/api/farmacia/notificaciones/no-leidas/count" -Headers $farmaciaHeaders
# Consultar el listado sin imprimir títulos o mensajes en logs públicos:
$farmaciaRespuesta = Invoke-RestMethod -Method Get -Uri "$farmaciaApi/api/farmacia/notificaciones?pagina=1&tamano=20&estado=todas" -Headers $farmaciaHeaders
if (!$farmaciaRespuesta.ok) { throw 'Listado no disponible.' }
```

Verificar en navegador que el contador corresponde a la BD, que el namespace
conecta y que el panel anterior sigue funcionando. No fabricar pagos reales
para desencadenar eventos. La migración inicial vacía NO genera avisos.

## Pruebas que faltan sobre PostgreSQL real aislado

| Prueba | Criterio de aceptación |
|---|---|
| Persistencia | Crear evento permitido en el entorno aislado; recargar, reiniciar backend y reconectar Prisma; ID, contenido y leida_at permanecen. |
| Dos destinatarios | A no lista ni cuenta avisos de B; PATCH de ID de B devuelve 404; lectura masiva de A conserva sin cambios los de B. |
| Roles | Roles 1, 2 y 4 reciben 403 en las cuatro rutas/namespace; JWT ausente o expirado recibe rechazo. Verificar regresión de sus propias rutas. |
| Usuario no vigente | Rol cambiado, cuenta inactiva o estado nulo no pueden acceder; socket no recibe emisiones posteriores. |
| Duplicación real | Insertar simultáneamente la misma referencia para el mismo destinatario desde conexiones distintas: exactamente una fila. Otro destinatario sí recibe su propia fila. |
| Atomicidad real | Forzar fallo de inserción del aviso en el entorno aislado: estado del pedido sin cambios y sin evento Socket.IO. |
| Pago simulado | Ningún avance ni aviso con simulacion=true, incluso estado de pago APROBADO. No tocar pagos de producción. |
| Paginación | Sin solapamientos sobre una instantánea fija; filtros y contador consistentes; rechazar tamano>50 e inyección de destinatario. |
| Lectura | Individual y masiva idempotentes; fecha de lectura conservada al reintentar y tras reiniciar. |
| Socket.IO | A recibe invalidación después del commit; B solo si tiene su propio aviso; no hay contenido clínico en payload; rechazo de salas arbitrarias y expiración. |
| Recuperación de transporte | Desconectar/reconectar socket: HTTP recupera avisos guardados; ningún evento no confirmado se muestra como persistido. |
| Flag | false -> 503 sin consultar tabla nueva; true con esquema correcto -> 200; ausencia de esquema -> error controlado y sin commit parcial. |
| Alcance | Sin cambios en registros, privilegios o definiciones anteriores, salvo el nuevo registro autorizado del historial y objetos propios del módulo. |

Las pruebas previas con dobles de Prisma y WebSocket/Edge locales NO sustituyen
estos ensayos de persistencia, UNIQUE y rollback reales. No se ejecutaron ahora
porque aún no hay un esquema de ensayo preparado y autorizado para esta fase.

## Recuperación

1. Fallo antes del COMMIT DDL: psql ON_ERROR_STOP + single-transaction revierte
   la DDL. Confirmar ausencia de objetos y mantener flag false. Una pérdida de
   conexión al confirmar deja resultado potencialmente incierto: inspeccionar
   antes de reintentar.
2. DDL confirmada y registro pendiente: conservar tabla, revisar su definición
   y resolver solo esta migración. No volver a correr el SQL ni borrar historial.
3. Fallo funcional después de activar: establecer flag false en el supervisor
   y reiniciar el mismo backend. Para arranque manual autorizado:

```powershell
$env:FARMACIA_NOTIFICACIONES_ENABLED = 'false'
npm start
```

   El proceso anterior debe estar detenido. Conservar tabla, filas e historial;
   los avisos existentes no se pierden por apagar el flag. Verificar 503 en las
   cuatro rutas y rechazo de nuevas conexiones al namespace. Esta es la reversión
   preferida y no revierte la protección contra pagos simulados.
4. Daño de datos confirmado: restaurar primero el respaldo en otro destino,
   comparar y preparar recuperación selectiva con autorización adicional.
   No restaurar una copia antigua sobre la principal ni cambiar de rama por
   defecto: se perdería actividad posterior de otros roles. No hay down
   automático autorizado ni DROP/CASCADE en este plan.

## Fuentes técnicas

- [Prisma v7: desarrollo y producción](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).
- [Prisma v7: conciliación de cambios aplicados manualmente](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing).
- [Neon: pg_dump/pg_restore y conexión directa](https://neon.com/docs/manage/backup-pg-dump).
- [PostgreSQL 18: psql y single-transaction](https://www.postgresql.org/docs/18/app-psql.html).
- [PostgreSQL 18: respaldo consistente con pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).

## Condición para continuar

Recuperar el historial original faltante sin alterar EPS, fijar los bytes
históricos correctos, preparar herramientas/conexión directa, obtener respaldo
nuevo con restauración comprobada y aprobar ensayos de PostgreSQL aislado.
Después solicitar autorización expresa para aplicar únicamente esta migración,
registrarla y activar el flag. Ninguna de esas acciones se ejecutó en esta fase.
