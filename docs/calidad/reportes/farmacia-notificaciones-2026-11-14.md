# Farmacia: notificaciones — implementación preparada, activación pendiente

Fecha: 2026-11-14. Alcance: rol FARMACIA (3). No se ejecutaron migraciones,
consultas ni escrituras contra Neon; no se realizó commit, push o despliegue.

## Revisión y decisión

`NotificacionAdministrativa` está ligada a `AtencionAdministrativa`, sus rutas
y permisos pertenecen a Administración/Paciente y carece de referencia única
al evento de farmacia. No se reutiliza su almacenamiento ni sus emisores.
Se reutiliza el servidor Socket.IO, agregando únicamente el namespace
`/farmacia-notificaciones` y un registro en `server.js`. Los canales anteriores
permanecen intactos.

Se prepara `NotificacionFarmacia`, relacionada con el destinatario en `Usuario`.
La relación inversa en Prisma no agrega columnas a `usuarios`. Ningún modelo,
ruta, interfaz o permiso de los otros roles se cambia.

## Interfaz implementada

- Apartado y enlace Notificaciones en el panel existente de Farmacia.
- Campana con contador y etiqueta accesible; `—` indica contador no disponible.
- Listado, tipo, fecha/hora de Colombia, leído/no leído y estados vacíos.
- Filtros todas/no leídas/leídas, paginación y recarga explícita.
- Lectura individual y masiva confirmadas por el backend, sin estado persistente
  alternativo en localStorage.
- Socket.IO invalida el listado después del commit. Recarga al reconectar,
  recuperar foco/visibilidad y cada 60 segundos mientras la página esté visible.
- Contenido construido con `textContent`; no se inserta HTML de notificaciones.
- Módulo sin activar o esquema ausente: mensaje de indisponibilidad, controles
  de lectura desactivados y ningún listado vacío o contador cero inventado.

## Contrato HTTP

Todas las rutas verifican JWT con expiración, ID entero y rol 3, además de
consultar que el usuario aún sea FARMACIA y esté ACTIVO en PostgreSQL.
Destinatario obtenido exclusivamente de la sesión, nunca del body/query.
Respuestas `Cache-Control: no-store`.

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/api/farmacia/notificaciones` | `notificaciones`, `noLeidas`, `paginacion` |
| GET | `/api/farmacia/notificaciones/no-leidas/count` | `noLeidas` |
| PATCH | `/api/farmacia/notificaciones/:id/leida` | `notificacion` propia, o 404 |
| PATCH | `/api/farmacia/notificaciones/leer-todas` | `actualizadas` del destinatario |

Listado: `estado=todas|no-leidas|leidas`, `pagina=1..100000`, `tamano=1..50`
(20 por defecto). Orden `created_at DESC, id DESC`. Listado y contadores usan
la misma instantánea mediante transacción RepeatableRead.
PATCH admite body ausente o `{}`; rechaza destinatarios u otros campos.
Lecturas individuales y masivas son idempotentes. Reintentar una lectura
individual no reemplaza su fecha de lectura original.

Errores: 400 validación; 401 JWT ausente/inválido/expirado; 403 rol o cuenta no
vigente; 404 ID inexistente o ajeno indistinguibles; 503 módulo sin activar o
esquema ausente; 500 fallo interno sanitizado. No se publican diagnósticos de BD.

## Evento conectado dentro del alcance autorizado

El avance existente de Farmacia mantiene sus transiciones consecutivas y exige
un pago `APROBADO` con `simulacion=false`. Ninguna aprobación simulada permite
iniciar preparación, marcar listo o confirmar entrega. El endpoint de avance
también revalida cuenta activa y rol actual, sin depender solo del JWT antiguo.

Con el módulo habilitado, actualización y avisos se guardan en una transacción
Prisma: si falla el aviso, se revierte el estado. El evento se distribuye entre
usuarios ACTIVO de rol 3 porque el listado operativo existente es una cola
compartida y no existe asignación por sucursal/farmacia en el modelo actual.
Cada destinatario conserva su propia lectura.

Evento persistido: `SOLICITUD_ESTADO`. Referencia interna:
`solicitud:<id>:estado:<estado>`. Índice único por destinatario/referencia más
`createMany(skipDuplicates: true)` evitan duplicaciones. El texto es genérico;
no contiene paciente, dirección, medicamentos, fórmula ni mensajes de chat.

Socket.IO emite solo `farmacia:notificaciones:actualizadas`, sin contenido
clínico ni lista de destinatarios. Revalida la cuenta antes de cada emisión y
desconecta el namespace al expirar el JWT. No ofrece eventos de selección de
destinatario, ingreso a salas arbitrarias ni escrituras desde el socket.
El fallo de transporte después del commit no transforma la operación en error;
la siguiente consulta HTTP recupera el estado persistido.

La emisión implementada recorre conexiones del proceso actual. En un futuro
despliegue con varias instancias se requeriría revisar el adaptador/bus de
Socket.IO; el sondeo HTTP sigue recuperando la información persistida.

## Cambio de base de datos pendiente de autorización

Archivo preparado, NO aplicado:
`backend/prisma/migrations/20261114120000_farmacia_notificaciones/migration.sql`.

Una tabla `notificaciones_farmacia` con:

- `id`, `destinatario_id`, `tipo`, `titulo`, `mensaje`, `referencia_evento`.
- `created_at` y `leida_at` con zona horaria.
- FK a `usuarios`, eliminación restringida.
- Índice único `(destinatario_id, referencia_evento)`.
- Índices de destinatario/fecha/ID y destinatario/lectura.

No modifica tablas clínicas, datos previos, roles ni permisos SQL.
No agrega filas históricas o de demostración.

El interruptor `FARMACIA_NOTIFICACIONES_ENABLED` solo se activa con el valor
literal `true`; por defecto está desactivado. No se editó ningún `.env`.
Con el interruptor apagado, las operaciones anteriores no acceden a la tabla
propuesta. Las notificaciones responden 503 y el panel sigue disponible.

Para activar: autorizar/aplicar la migración revisada al destino acordado,
regenerar Prisma Client, verificar allí la integración y autorizar la activación
del interruptor/reinicio. No ejecutar un despliegue indiscriminado de todas las
migraciones pendientes en Neon.

## Partes detenidas por depender de flujos compartidos

| Evento | Punto propuesto para revisión | Cambio que requiere aprobación |
|---|---|---|
| Nueva solicitud válida | `order.service.js` / `order.repository.js`, detrás de `/api/pedidos` | Publicación durable después de verificar pago real y confirmar pedido; requerirá diseño transaccional con la capa pg existente. No publicar desde GET ni inferir eventos al abrir el panel. |
| Nuevo mensaje de chat | `chat.service.js`, `chat.repository.js`, `chat.socket.js` | Aviso por ID de mensaje a un agente activo identificado y autorizado. Referencia única por mensaje. No incluir contenido del mensaje ni difundir conversaciones no asignadas. |
| Stock mínimo | Sin regla/modelo existente | Definir umbral, quién lo configura y cuándo se considera cruzado antes de implementar eventos. |

No se modificó ninguno de esos archivos compartidos. No se generan alertas
de fórmulas ni se crea un nuevo flujo de entregas. Solo se notifica el cambio
de estado ya autorizado del pedido existente.

## Archivos creados

- `backend/src/config/farmacia-notificaciones.js`
- `backend/src/controllers/farmacia-notificaciones.controller.js`
- `backend/src/middlewares/farmacia-notificaciones.middleware.js`
- `backend/src/repositories/farmacia-notificaciones.repository.js`
- `backend/src/services/farmacia-notificaciones.service.js`
- `backend/src/sockets/farmacia-notificaciones.socket.js`
- `backend/src/validators/farmacia-notificaciones.validator.js`
- `backend/prisma/migrations/20261114120000_farmacia_notificaciones/migration.sql`
- `backend/tests/farmacia-notificaciones.test.cjs`
- `backend/tests/farmacia-notificaciones-socket.test.cjs`
- `frontend/src/components/FarmaciaNotificaciones.astro`
- `frontend/public/js/farmacia-notificaciones.js`
- Este informe.

## Archivos modificados

- `backend/prisma/schema.prisma`: nuevo modelo y relación inversa exclusivamente.
- `backend/server.js`: registro del namespace exclusivo.
- `backend/src/routes/farmacia.routes.js`: nuevas rutas y sesión vigente en avance.
- `backend/src/controllers/farmacia.controller.js`: emisor del evento tras commit.
- `backend/src/services/farmacia.service.js`: aviso posterior al commit y mensaje de pago real.
- `backend/src/repositories/farmacia.repository.js`: transacción, avisos y rechazo de pagos simulados.
- `backend/tests/farmacia-api.test.cjs`: contrato de pago real y JWT con expiración.
- `frontend/src/pages/pages/farmacia.astro`: apartado, campana y carga del script.
- `frontend/src/components/FarmaciaOperaciones.astro`: explicación de la restricción de pagos simulados.
- `frontend/public/css/farmacia.css`: estilos acotados a las nuevas notificaciones.

Los archivos administrativos no rastreados que ya existían al comenzar no se
editaron ni se incluyen en esta entrega.

## Verificación ejecutada y límites

- `node scripts/generate-prisma-client.cjs`: aprobado. Usa URL local reservada
  para generación; no conecta ni ejecuta migraciones.
- `prisma validate` con URL local reservada: aprobado.
- `npm run build` en frontend: aprobado.
- Suites `farmacia-notificaciones`, `farmacia-notificaciones-socket`,
  `farmacia-api` y `farmacia-middleware`: **32 aprobadas, 0 fallidas, 0 omitidas**.
- Selección de regresión de Administración, separación de roles, Paciente/EPS,
  pedidos, medicamentos, chat y arranque: **122 aprobadas, 0 fallidas**.
  Incluye 15 verificaciones de Farmacia también presentes en la selección anterior;
  no sumar ambos resultados como si fueran pruebas distintas.
- Edge headless contra HTTP/Socket.IO reales locales y almacenamiento de prueba
  en memoria: filtros, páginas, lectura, recarga, contador, evento en vivo,
  aislamiento al leer todas, estado 503 y ausencia de excepciones JavaScript.
- Geometría responsive de notificaciones a 1440, 820 y 390 píxeles: aprobada.
- Pruebas de Socket.IO con WebSocket real: acceso, destinatario, ausencia de
  contenido sensible, rechazo de salas arbitrarias, desactivación y expiración.

El primer intento de Edge dentro del sandbox no respondió a DevTools. Al
ejecutar la prueba fuera del sandbox se identificó y corrigió el origen CORS
del servidor de pruebas, sin cambiar CORS de la aplicación. La ejecución final
aprobó. La API del navegador quedó fijada al origen local aislado.

**PostgreSQL real no fue utilizado para estas pruebas.** Persistencia al
reiniciar PostgreSQL, restricción única y rollback real de esta nueva tabla
requieren aplicar el esquema en un entorno de prueba autorizado y ejecutar
integración. La prueba de recarga verifica persistencia mediante backend y
repositorio reales con Prisma sustituido por un doble en memoria; no certifica
persistencia en Neon ni tras reiniciar el proceso del servidor.

No se usaron registros de prueba como datos reales del producto.
