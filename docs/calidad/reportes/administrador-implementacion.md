# Administrador de SaludClick — implementación y habilitación

Fecha: 2026-11-12. Alcance: administración de cuentas, atención administrativa,
mensajes, notificaciones, informes, auditoría, configuración y dashboard.

## Inventario inicial y decisiones

| Existencia inicial | Archivos | Decisión |
| --- | --- | --- |
| Dashboard de usuarios, pagos, pedidos, inventario y fórmulas | `frontend/public/pages/admin.html`, `frontend/public/js/admin.js`, `backend/src/routes/dashboard.routes.js` | Sustituir la interfaz y la ruta administrativa por indicadores exclusivamente administrativos. No alterar el dashboard del paciente. |
| Altas, listado y eliminación de cuentas | `admin.routes.js`, `admin.service.js`, `admin.repository.js`, `admin-cuentas.js` | Unificar las rutas públicas de cuentas en el nuevo controlador. Sustituir baja física por desactivación; no aceptar cambios de contraseña de otras cuentas. |
| Pacientes autorizados y afiliados | `pacientes-autorizados.*`, `afiliados.*` | Conservar el código y la fuente de los 50 afiliados; aplicar sesión administrativa vigente. No incluir importaciones ni migraciones previas en la habilitación de este módulo. |
| Revisión administrativa de fórmulas y cambio de estado de pedidos farmacéuticos | `formula.routes.js`, antiguas rutas `/admin/pedidos` | Bloquear acceso del administrador en el gateway y en las rutas administrativas de compatibilidad. No reasignar ni eliminar funcionalidades de los demás roles. |
| VITALIX | `Chat.jsx`, `vitalix-engine.mjs` | Conservar respuestas programadas y protección de alcance; añadir acceso explícito a soporte humano y FAQ configurables. No transmitir automáticamente el historial local. |
| Chat farmacéutico | `chat.*`, `chat.socket.js` | Mantener intacto: pertenece a cliente/farmacia. Reutilizar Socket.IO para un canal administrativo separado. |
| JWT, bcrypt, Prisma, estilos | `auth.*`, `config/prisma.js`, dependencias existentes | Reutilizar. No añadir proveedores externos ni cambiar el framework instalado. |

La instalación actual declara Astro 7.4.1, React 19 y Express 5. Se conserva;
no se hizo una migración de versión a Astro 5 durante esta entrega.

## Verificación real de solo lectura

Se ejecutó `backend/scripts/preflight-administrative.cjs` dentro de una transacción
`BEGIN READ ONLY`, con límite de tiempo y cierre de conexión. No imprime URLs,
contraseñas, hashes, tokens, correos ni documentos de las cuentas.

Resultado observado:

- Faltan las seis tablas `administrative_*` de esta implementación.
- La base registra aplicadas únicamente la migración inicial y la de fórmulas.
- Existe un administrador con estado `NULL`, dos clientes con estado `NULL`,
  una farmacia activa y una EPS activa.
- El rol 2 se denomina `usuario`; este módulo autoriza por ID, sin renombrarlo.
- No se encontraron grupos de correos duplicados al comparar en minúsculas.
- La auditoría precedente confirmó 50 afiliados en la fuente EPS independiente.
  Esta implementación no escribe en ella ni copia sus registros.

Las cuentas con estado `NULL` no se consideran activas automáticamente. Se
requiere una decisión autorizada sobre su habilitación. Ninguna contraseña o
estado existente fue cambiado durante el desarrollo.

## Implementación

### Backend

- `administrative-session.middleware.js`: JWT verificado, estado exactamente
  ACTIVO, rol vigente en PostgreSQL y fecha de revocación. Falla de forma cerrada
  ante caída de base o esquema ausente.
- `administrative-scope.middleware.js`: bloquea al administrador en medicamentos,
  fórmulas, pedidos, farmacia y EPS. El perfil administrativo utiliza una ruta
  segura que conserva correo, documento, rol y contraseña.
- `administrative-rate.middleware.js`: limita escrituras por cuenta.
- `administrative.validator.js`: listas de campos permitidos, validación de
  identidad, contraseñas, fechas, paginación y transiciones.
- `administrative.repository.js`: persistencia mediante Prisma y SQL
  parametrizado; auditoría y notificaciones en la misma transacción que las
  acciones principales. Consultas de clientes limitadas por propietario.
- `administrative.service.js`: reglas administrativas y hash bcrypt existente.
- `administrative-export.service.js`: CSV con defensa contra fórmulas de hojas
  de cálculo; PDF paginado sin servicios externos. El PDF translitera acentos
  por compatibilidad con la fuente estándar incluida.
- `administrative.controller.js`: respuestas controladas; no expone errores de
  base ni secretos. La exportación queda auditada.
- `administrative.routes.js`: APIs bajo `/api/administrativo`.
- `administrative.socket.js`: namespace Socket.IO `/administrativo`; solo emite
  invalidación, nunca mensajes o datos personales. Cada lectura/escritura real
  vuelve a autorizarse por HTTP. Existe consulta periódica de contadores si el
  canal no está disponible.

Se conserva Prisma como acceso a PostgreSQL. Las consultas nuevas usan
`$queryRawUnsafe` con estructura SQL fija y parámetros vinculados separados;
no interpolan valores del usuario en identificadores ni en SQL. Las tablas
están también representadas como modelos Prisma.

### Interfaz

- `frontend/public/pages/admin.html`: panel administrativo con ocho secciones.
- `frontend/public/js/administrative.js`: formularios, filtros, paginación,
  edición de cuentas, atención, lectura explícita, informes y configuración.
- `frontend/public/css/administrative.css`: diseño adaptable y foco visible.
- `frontend/public/pages/soporte.html`: bandeja privada del cliente.
- `frontend/src/components/AdministrativeSupport.jsx`: derivación humana y FAQ
  desde VITALIX. No se envía el historial del bot sin una acción del cliente.
- `admin-cuentas.js`: redirige la dirección antigua al directorio unificado.
- `admin.js`: compatibilidad con la nueva implementación.
- `auth.js`: reconoce la nueva página privada de soporte.
- `dashboard.html`: añade enlace de soporte sin alterar operaciones del paciente.

Los contadores muestran datos recibidos del backend. Cuando falta el esquema,
la interfaz informa indisponibilidad; no sustituye fallos por ceros simulados.
Los textos enviados por usuarios se escapan antes de incluirse en HTML.

## Contratos principales

| API, relativa a `/api/administrativo` | Roles | Operación |
| --- | --- | --- |
| `GET /dashboard` | 1 | Estadísticas administrativas y actividad |
| `GET, POST /usuarios`; `PATCH /usuarios/:id` | 1 | Cuentas; roles asignables 2, 3 y 4; sin baja física |
| `GET /responsables` | 1 | Administradores activos asignables |
| `GET /atenciones`; `GET /atenciones/:id` | 1, 2 | Bandeja y detalle; el cliente solo ve los suyos |
| `POST /atenciones` | 2 | Solicitud o conversación exclusivamente administrativa |
| `PATCH /atenciones/:id` | 1 | Responsable y estado |
| `POST /atenciones/:id/mensajes` | 1, 2 | Respuesta persistente; se respeta asignación y estado |
| `POST /atenciones/:id/leido` | 1, 2 | Lectura explícita hasta un mensaje visible |
| `GET /notificaciones`; `PATCH /notificaciones/:id/leida` | 1, 2 | Solo destinatario autenticado |
| `GET /informes/:tipo` | 1 | JSON, CSV o PDF; fechas y búsqueda |
| `GET /auditoria` | 1 | Solo consulta; no API de modificación o eliminación |
| `GET /configuracion`; `PUT /configuracion/:clave` | 1 | Solo `general` y `faq` |
| `GET, PUT /preferencias` | 1 | Notificaciones y vista compacta propias |
| `GET, PUT /perfil`; `POST /password` | 1 | Perfil propio y cambio con contraseña actual |
| `GET /faq` | 1, 2 | Orientación administrativa configurada |

Estados: ABIERTA → EN_ATENCION → RESUELTA → CERRADA. Se permite cerrar desde
ABIERTA/EN_ATENCION y reabrir una RESUELTA hacia EN_ATENCION. CERRADA es terminal.

Cada página lista 20 filas por defecto y acepta hasta 100; los mensajes se
consultan en bloques de 100, con navegación hacia anteriores. Los informes
tienen límite explícito de 1.000 filas: deben acotarse por fecha si se alcanza.
Los registros de auditoría de cada atención muestran los 100 eventos recientes;
el administrador puede consultar el historial global paginado en Auditoría.

## Migración preparada: requiere autorización

Archivo: `backend/prisma/migrations/20261112120000_administrative_workspace/migration.sql`.

Contenido:

1. Índice único de correo sin distinguir mayúsculas; no cambia sus valores.
2. Seis tablas administrativas nuevas con claves foráneas RESTRICT a usuarios.
3. Índices de consulta y restricciones de estados/tipo.
4. Función y trigger para rechazar UPDATE y DELETE de la auditoría.

No contiene UPDATE/DELETE de información existente ni cambios en medicamentos,
inventario, fórmulas o afiliados. La inmutabilidad protege la operación normal y
la cuenta de aplicación; un propietario de base con permiso para eliminar
triggers requiere controles operativos adicionales fuera de la aplicación.

**No ejecutar `prisma migrate deploy` a ciegas:** existen migraciones anteriores
pendientes que incluyen módulos ajenos a este alcance. Tampoco usar `db push`.

Plan de habilitación, aún NO EJECUTADO:

1. Aprobar el alcance exacto y la base destino; obtener respaldo operativo y
   comprobar restauración por el responsable de PostgreSQL.
2. Ensayar primero el SQL específico en una base aislada, con datos sintéticos.
   No ejecutar las migraciones de importación o renombrado de afiliados.
3. Revisar tipos actuales de usuarios/roles, índice de correo y permisos para
   crear tablas/trigger. Repetir el preflight de solo lectura.
4. Solo con autorización, aplicar el SQL específico dentro de una transacción
   y registrar esa migración como aplicada con Prisma. El registro de metadatos
   también es una escritura y requiere autorización.
5. Obtener autorización independiente para regularizar el estado del
   administrador existente. No cambiar su contraseña. Las cuentas cliente con
   estado NULL deben revisarse antes de probar la atención con ellas.
6. Verificar el módulo con cuentas de prueba aisladas antes de aceptar pruebas
   de escritura sobre la base principal.

## Pruebas y aceptación

- `backend/tests/administrative-workspace.test.cjs`: seguridad vigente,
  aislamiento, validación, hash, transacciones/auditoría, errores y exportación.
- `backend/tests/admin-contracts.test.cjs`: rutas administrativas de
  compatibilidad, exclusión de pedidos y prohibición de borrado físico.
- Pruebas históricas de contratos actualizadas: ya no esperan autorización
  administrativa para funciones clínicas. Sus fixtures no consultan cuentas
  reales. La seguridad vigente tiene pruebas dedicadas independientes.
- `backend/tests/support/administrative-browser.cjs`: fixtures en memoria y
  recorrido de interfaz de usuario, solicitud, asignación, respuesta,
  notificaciones, informes, configuración y vista móvil.
- `prisma validate`, `astro check` y compilación Astro.

Resultados obtenidos:

| Comprobación | Resultado |
| --- | --- |
| Suite backend sin navegador, en su ejecución general | 321 aprobadas, 0 fallos |
| Suite focalizada administrativa, incluyendo comprobación adicional Socket.IO | 20 aprobadas, 0 fallos; contiene pruebas también incluidas en la ejecución general |
| Suite completa de navegador Edge con fixtures locales | 44 aprobadas, 0 fallos |
| Repetición focalizada de interfaz, incluidos botones CSV/PDF | 5 aprobadas, 0 fallos; descargas bloqueadas para evitar archivos fuera del proyecto |
| Motor VITALIX y resumen de afiliados | 6 aprobadas, 0 fallos |
| Prisma validate | Esquema válido |
| Astro check | 0 errores; una sugerencia preexistente por variable no utilizada en dashboard del paciente |
| Astro build | Compilación satisfactoria |
| Preflight PostgreSQL READ ONLY | Incompatibilidad detectada; ninguna escritura |

Los conteos de ejecuciones focalizadas se superponen con las suites generales:
no deben sumarse como pruebas distintas. Las pruebas de interfaz y contratos
usan datos sintéticos en memoria, no acreditan persistencia real. La prueba de
Socket.IO comprueba autorización/invalidez de sesión e invalidaciones sin datos
personales mediante un namespace de prueba, no una conexión multiusuario real.

Pendientes de aceptación: SQL ejecutado y persistencia real en entorno aislado;
transacciones concurrentes contra PostgreSQL real; verificación de Socket.IO
entre dos sesiones; revisión visual del PDF generado; política operativa de
retención; prueba final con cuenta administrativa habilitada. No declarar
COMPLETO ningún módulo persistente hasta estas comprobaciones.

## Estado por módulo

En todas las filas siguientes se requiere autorizar primero el ensayo de la
migración y después su aplicación principal y la revisión del estado de las
cuentas. La columna de estado describe la entrega integrada, no solo el código.

| Módulo | Implementado | Archivos principales | Pruebas | Estado | Pendiente |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Usuarios, estados, clientes, solicitudes, mensajes, notificaciones y actividad | `admin.html`, `administrative.js`, repositorio administrativo | Navegador y contratos | PARCIAL | Verificar estadísticas sobre persistencia real |
| Usuarios | Crear, buscar, filtrar, editar, roles permitidos, activar/desactivar; sin borrado | Validador, servicio, repositorio y rutas administrativos | Hash, permisos, validación, transacción e interfaz | PARCIAL | Ensayo PostgreSQL y cuenta administradora vigente |
| Solicitudes | Creación por cliente, detalle, asignación, respuestas, transiciones e historial | `soporte.html`, capas administrativas | Cliente → administrador → resolución en fixture | PARCIAL | Persistencia y concurrencia reales |
| Chatbot/mensajes | VITALIX, derivación humana explícita, FAQ, bandeja persistente y aviso en vivo | `AdministrativeSupport.jsx`, `Chat.jsx`, socket administrativo | Motor, contratos, navegador e invalidación | PARCIAL | Conexión en vivo multiusuario con PostgreSQL |
| Notificaciones | Generación transaccional, destinatario, contador, filtros e historial | Repositorio, controlador y panel | Aislamiento y lectura en interfaz | PARCIAL | Verificar almacenamiento real |
| Informes | Siete informes, fechas, búsqueda, CSV y PDF | Exportador, servicio, controlador y panel | Fórmulas CSV, estructura PDF y botones de exportación | PARCIAL | Verificar datos reales y revisión visual del PDF |
| Auditoría | Actor, acción, resultado, entidad, campos, fecha; consulta; trigger inmutable | Migración, repositorio y panel | Transacción, ausencia de secretos y consulta | PARCIAL | Ejecutar/verificar el trigger en entorno aislado |
| Configuración | Perfil propio, cambio seguro de contraseña, preferencias, parámetros y FAQ | Servicio, repositorio y panel | Validación e interfaz con fixtures | PARCIAL | Probar cambio propio y revocación en entorno aislado |

La revocación nueva se comprueba en las rutas administrativas y de soporte.
Los módulos heredados de otros roles mantienen su implementación de
autenticación; extender esa comprobación a todas sus rutas es un trabajo
compartido adicional, que no debe confundirse con esta validación del panel.

## Fuera de alcance y datos preservados

No se ejecutaron migraciones ni acciones de negocio contra datos reales. No
se cambiaron contraseñas, cuentas ni los 50 afiliados. No se hizo commit/push,
no se reiniciaron servidores existentes y se conservaron cambios locales
previos. La carpeta `dist` se regeneró como artefacto local de comprobación.
