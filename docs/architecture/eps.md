> Actualización 2026-11-14: EPS está activado en Neon para cuenta 5 / VidaPlena entidad 1, con 50 afiliados importados y sin duplicados. La migración adicional 20261115090000_eps_role_integration agrega asignación de farmacia y avisos por destinatario/rol. Estado y pruebas vigentes: [informe de integración](../calidad/reportes/eps-integracion-cuatro-roles-2026-11-14.md). Las menciones a autorizaciones pendientes en el diagnóstico original siguiente son históricas.

## Integración de roles

Las rutas nuevas están en `/api/integracion`: `/admin/eps`, `/paciente/afiliacion`, `/paciente/autorizaciones`, `/paciente/solicitudes`, `/eps/autorizaciones/:id/farmacia`, `/farmacia/autorizaciones`, `/farmacia/solicitudes/:id/estado`, `/farmacia/convenios`, `/farmacia/existencias`, `/notificaciones`. Se validan JWT, rol actual, cuenta activa y revocación; EPS agrega su entidad vigente. Las notificaciones conservan usuario y rol de recepción y nunca incluyen conceptos clínicos en sus títulos.

Farmacia conserva checkout, pagos, stock global y estados operativos existentes. Su ámbito de pedidos ahora exige la farmacia asignada para solicitudes EPS; sus existencias del convenio son independientes del stock global. Administrador supervisa metadatos operativos, sin contenido clínico. La identidad de un paciente se vincula únicamente con coincidencia exacta y autorización vigente; no se traslada entre EPS automáticamente.

Las interfaces reutilizan los estilos existentes. Administrador, Paciente y Farmacia abren su sección con **Abrir integracion EPS**; EPS asigna una farmacia vinculada desde una autorización aprobada con solicitud. Las operaciones reales requieren cuentas y convenios auténticos.

## Documentación original del módulo
# Modulo EPS

## Estado y alcance

Implementado en Astro, JavaScript, Express y Prisma 7. La URL publica es
/pages/eps.html; su fuente es frontend/src/pages/pages/eps.astro y el build genera
frontend/dist/pages/eps.html. No debe crearse otra pagina en public/pages, porque
colisionaria con Astro. Los estilos compartidos se conservan y eps.css solo se
carga en esta pagina.

La activacion en Neon esta pendiente de autorizacion. La consulta de solo lectura
realizada durante esta entrega encontro usuarios, medicamentos y solicitudes,
pero no afiliados ni las ocho tablas EPS. No se aplicaron migraciones ni se
importaron registros reales.

## Datos y aislamiento

- EpsEntidad identifica una EPS. Su id debe corresponder al eps_id validado de sus
  afiliados; no se infiere de un JWT, del nombre de una cuenta o de su correo.
- EpsAcceso vincula una cuenta existente, activa y de rol 4 con una sola entidad.
  La cuenta, la vinculacion, la entidad y la revocacion se comprueban por peticion.
- Afiliado reutiliza el modelo existente. Su eps_id se obtiene de la sesion del
  servidor y no puede modificarse por la API EPS. Documento y cuenta vinculada
  tampoco son editables desde el formulario. eps_version evita ediciones perdidas.
- Un paciente aparece solo cuando Afiliado.usuario_id referencia explicitamente
  una cuenta de rol 2. No se vinculan cuentas por coincidencias parciales.
- Las solicitudes son las existentes de esos pacientes. EPS gestiona un
  EpsSeguimiento separado; no altera los pagos, stock global ni estados de entrega.
- EpsAutorizacion registra concepto, motivo, afiliado, solicitud opcional,
  responsable, fechas y version. Solo permite resolver PENDIENTE a APROBADA o
  RECHAZADA. La solicitud debe pertenecer al mismo afiliado y entidad.
- EpsFarmacia relaciona la EPS con una cuenta de farmacia activa de rol 3.
  EpsExistencia registra stock real por vinculo y medicamento. Nunca se copia el
  stock global como si fuera de una farmacia. Inactivar un vinculo oculta sus
  existencias, sin borrar registros.
- EpsEvento conserva cambios y notificaciones; EpsLectura registra lectura por
  cuenta, sin marcar como leidas las notificaciones de otros colaboradores.
- Los historiales y listados estan paginados a 25 registros y filtran por EPS.
  El frontend usa textContent y nodos DOM para datos recibidos, sin HTML dinamico.
- No se entregan hashes, pagos, tokens, archivos de formulas, ni informacion de
  pacientes no vinculados a la entidad. Las respuestas EPS usan Cache-Control:
  no-store. Las excepciones tecnicas se devuelven sin cadenas de conexion.

El logout elimina las sesiones locales y persistentes y revoca los tokens
anteriores en las rutas EPS de la cuenta. La revocacion afecta a las otras
sesiones EPS de esa cuenta; otras cuentas de la misma entidad no se revocan.
Los endpoints heredados fuera de EPS conservan sus mecanismos de sesion.

## Endpoints

Todos requieren Bearer JWT y vinculacion EPS vigente. No aceptan eps_id ni rol
como parametro de autorizacion.

| Metodo | Ruta /api/eps | Operacion |
| --- | --- | --- |
| GET | /verificar-acceso | Validar cuenta y vinculacion actual |
| GET | /dashboard | Contadores reales de la entidad |
| GET, POST | /afiliados | Lista y registro |
| PATCH | /afiliados/:id | Actualizar datos permitidos y estado con version |
| GET | /pacientes | Pacientes explicitamente vinculados |
| GET | /pacientes/:id | Datos autorizados del paciente |
| GET | /farmacias | Vinculos e informacion de contacto |
| PUT | /farmacias/vinculo | Vincular, activar o inactivar una farmacia |
| GET | /inventario | Existencias por farmacia y alertas |
| GET, POST | /autorizaciones | Lista y creacion |
| PATCH | /autorizaciones/:id | Aprobar/rechazar con motivo y version |
| GET | /solicitudes | Pedidos de pacientes y seguimiento EPS |
| PATCH | /solicitudes/:id/seguimiento | Avanzar seguimiento con motivo y version |
| GET | /historial/:tipo/:id | Historial paginado, tipo AFILIADO/AUTORIZACION/SOLICITUD |
| GET | /notificaciones | Lista, fecha, tipo y lectura por cuenta |
| PATCH | /notificaciones/:id/leida | Lectura idempotente de una notificacion propia |
| GET, PUT | /perfil | Datos permitidos de la entidad, actualizacion con version |
| POST | /logout | Revocar sesiones EPS de la cuenta |

Filtros: pagina, buscar, estado; inventario acepta farmacia (id de cuenta),
autorizaciones acepta paciente (id de afiliado), solicitudes acepta paciente
(id de cuenta). Los valores se validan y los identificadores ajenos devuelven 404.
Estados del seguimiento: ABIERTA -> EN_REVISION -> RESUELTA -> CERRADA;
RESUELTA tambien puede volver a EN_REVISION. No se reabre CERRADA.

## Migracion y activacion pendientes

Archivo revisable: backend/prisma/migrations/20261114090000_eps_workspace/migration.sql.

La migracion esta encerrada en BEGIN/COMMIT. Crea afiliados vacia si no existe,
agrega eps_version, indices y ocho tablas EPS con claves foraneas y restricciones.
No elimina tablas ni registros, no crea usuarios ni asigna permisos o entidades.
Incluye triggers minimos para registrar cambios reales de estado de solicitudes
y de existencias EPS. Los cambios de seguimiento y autorizacion generan eventos
en la misma transaccion de la operacion.

Antes de aplicarla se debe aprobar el SQL y revisar el historial de migraciones
de la instancia. No ejecutar indiscriminadamente migrate deploy o db push:
podrian incluir otras migraciones pendientes ajenas a esta entrega. La ejecucion
y el registro de esta migracion concreta deben acordarse con el responsable de
la instancia. No aplicar la migracion sobre EPS_DATABASE_URL: corresponde a la
base principal configurada en DATABASE_URL.

Tras la aprobacion hay que proporcionar datos reales para EpsEntidad (id, nombre,
nit, correo, telefono, direccion, ciudad), confirmar las cuentas EPS autorizadas
y crear sus EpsAcceso. Una cuenta sin esa vinculacion se rechaza; el panel no se
aprovisiona ni se concede acceso automaticamente desde el navegador.

EPS_DATABASE_URL sigue siendo la fuente original independiente de solo lectura
utilizada por los servicios anteriores. Este panel usa afiliados de la base
principal. No se copiaron ni normalizaron datos de esa fuente. Su importacion y
la vinculacion verificada con cuentas existentes requieren una revision y
aprobacion especificas. Sin esas vinculaciones, Pacientes permanece vacio en
lugar de mostrar cuentas globales o inferir identidades.

Las farmacias se pueden vincular en el panel tras la activacion. Para existencias
se necesita una fuente real por farmacia: una integracion de abastecimiento o
una carga autorizada. Se incluye la herramienta de snapshot JSON:

    node scripts/eps-sync-inventory.cjs --eps=ID --file=C:\private\stock.json

Cada fila contiene farmacia_id, medicamento_id, stock y minimo. El modo por
defecto solo valida y genera un plan mediante una transaccion READ ONLY.
Para aplicar un snapshot expresamente aprobado se requieren ambos argumentos
--apply --confirm=ID. La operacion es transaccional: un registro ajeno o invalido
revierte toda la carga. No modifica medicamentos.stock. No se ejecuto contra Neon.
El archivo debe provenir del responsable del inventario; no se suministran
existencias ficticias ni se presupone una sincronizacion automatica.

Comprobacion disponible sin escrituras ni salida de credenciales:

    node scripts/eps-readiness.cjs

## Verificacion reproducible

Desde frontend:

    npm run build
    npm run check

Desde backend, una vez terminado el build:

    npm test
    node --test tests/eps-postgres.isolated.cjs

La suite EPS usa PostgreSQL WASM/PGlite en memoria mediante pg y PrismaPg; no lee
.env ni accede a bases existentes. Usa los paquetes de prueba ya instalados;
no se modificaron versiones ni se agregaron dependencias. Para incluir Edge y
reproducir una base sin afiliados, en PowerShell:

    $env:EPS_BROWSER='1'
    $env:EPS_BASELINE_WITHOUT_AFILIADOS='1'
    node --test tests/eps-postgres.isolated.cjs

Se prueban validaciones, cruce de entidades, identidad y rol actuales, versiones
obsoletas, decisiones y auditoria, seguimiento sin alterar farmacia, stock real
por vinculo, rollback de importacion, lectura por colaborador, perfil y logout.
Edge recorre el menu, registra y actualiza afiliados, crea y rechaza autorizaciones,
guarda seguimientos, consulta historial, verifica 320/390 px y cierra sesion.
No sustituye una prueba de carga o concurrencia entre varias instancias de Neon.

## Archivos de la entrega

- backend/prisma/schema.prisma y la migracion EPS: relaciones y persistencia.
- backend/src/routes/eps.routes.js: rutas del modulo.
- backend/src/controllers/eps.controller.js: contratos HTTP y errores.
- backend/src/services/eps.service.js: consultas y transacciones Prisma.
- backend/src/validators/eps.validator.js: validaciones y lista de campos permitidos.
- backend/src/middlewares/eps-session.middleware.js: permiso vigente y entidad.
- frontend/src/pages/pages/eps.astro: menu y estructura del panel.
- frontend/public/js/eps.js y frontend/public/css/eps.css: interacciones y estilos.
- backend/scripts/eps-readiness.cjs y eps-sync-inventory.cjs: operacion controlada.
- backend/tests/eps-workspace.test.cjs y eps-postgres.isolated.cjs: pruebas EPS.
- backend/tests/api-contracts.test.cjs y frontend.test.cjs: fixtures y expectativas
  EPS actualizados; no se alteran las expectativas de otros modulos.

El cambio previo en backend/package-lock.json se encontro antes de esta tarea
y no se modifico como parte de la implementacion EPS. No hubo cambios a .env,
credenciales, versiones, pantallas de otros roles, commits o pushes.


## Diagnostico y activacion controlada

El informe eps-modulo-validacion.md contiene el destino y planes reales revisados.
Las respuestas EPS diferencian EPS_SCHEMA_PENDING, EPS_PRISMA_CLIENT_PENDING,
EPS_DATABASE_PERMISSION, EPS_DATABASE_UNAVAILABLE y EPS_OPERATION_FAILED.
La verificacion de cuenta/vinculacion no se omite ante ninguno de estos errores.
Los valores de afiliacion se consultan sin distinguir mayusculas para reconocer
la fuente original Activo/Subsidiado; los 13 campos de origen no se normalizan
silenciosamente durante la importacion.

Nuevos archivos de operacion y pruebas:

- backend/src/services/eps-errors.js: diagnosticos saneados del modulo.
- backend/scripts/eps-apply-schema.cjs: plan de SQL y aplicacion exacta y atomica.
- backend/src/services/eps-activation.service.js: planes, conflictos y vinculacion
  de cuentas/afiliados verificados, con fuente exclusivamente de lectura.
- backend/scripts/eps-activate.cjs: CLI de configuracion e importacion controlada.
- backend/tests/eps-activation.isolated.cjs: migracion, rollback y activacion aislados.

Desde backend, ambos comandos siguientes son de solo lectura por defecto:

    node scripts/eps-apply-schema.cjs
    node scripts/eps-activate.cjs --eps=1 --account=5

No se ejecutaron sus modos de aplicacion real. Para aplicar el esquema se debe
recibir autorizacion especifica del SQL y destino del plan. El comando exige
--apply --confirm-hash=HASH_SQL --target=HUELLA_DESTINO. Registra solamente esa
migracion en _prisma_migrations y no marca otras migraciones como aplicadas.
Reconciliar migraciones historicas ajenas a EPS permanece fuera de este alcance.

Despues debe regenerarse el plan de activacion. El modo --apply de eps-activate
exige --confirm-plan=HASH_PLAN --target=HUELLA_DESTINO y solo se ejecuta tras
aprobar la asociacion concreta y la importacion. --metadata=RUTA_JSON permite
aportar nit, correo, telefono y direccion reales, sin editar .env. Los datos no
aportados se representan como campos vacios y se muestran sin registrar.
La CLI permite completar posteriormente campos vacios con otro plan aprobado;
rechaza reemplazar metadatos registrados o trasladar cuentas a otra EPS.

No se inventan afiliados, cuentas, solicitudes, convenios o existencias. Los
pacientes requieren su vinculacion verificada con una cuenta; si no existe,
Afiliados muestra la persona e indica la ausencia de cuenta, mientras Pacientes
permanece limitado a las cuentas realmente vinculadas. Inventario requiere una
fuente autentica por farmacia y no deriva esas cifras de medicamentos.stock.

Prueba adicional, sin .env ni bases reales:

    node --test tests/eps-activation.isolated.cjs
