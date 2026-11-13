# VITALIX conectado con Solicitudes y notificaciones

Actualización posterior: [atención anónima directa sin correo](vitalix-atencion-anonima-sin-correo.md). Ese informe describe el comportamiento vigente de visitantes y la migración aplicada únicamente en pruebas aisladas.

## Revisión y continuación — 2026-11-13

Esta sección actualiza el comportamiento descrito en el informe histórico de abajo. Se revisaron los cambios locales existentes antes de continuar y se conservaron. No se reconstruyó Solicitudes ni se añadieron servicios, tablas, endpoints o migraciones.

### Componentes existentes que funcionaban

El repositorio administrativo ya guardaba conversaciones, mensajes, notificaciones y comprobantes de reintento en PostgreSQL. La creación y el envío utilizaban transacciones y bloqueos. Los controladores emitían eventos después de confirmar la escritura y suprimían eventos repetidos. El namespace Socket.IO `/administrativo` validaba sesión y rol y notificaba solo a Administración y al propietario. Solicitudes ya permitía consultar historial, responder, leer, cerrar y reabrir. La campana y los enlaces a conversaciones ya estaban conectados.

### Problema corregido

El campo principal enviaba todas las preguntas del cliente autenticado a Administración. Ahora las respuestas automáticas permanecen en el bot hasta que el usuario solicita atención humana, mediante texto o el acceso rápido de contacto. Al derivar se incluye únicamente el último mensaje pertinente del usuario como contexto, excluyendo mensajes clasificados como privados o fuera de alcance. Los mensajes posteriores usan la conversación recuperada, incluso después de recargar. Se conserva el borrador completo con contexto para que un reintento mantenga el contenido y la clave originales. El historial local se muestra antes del intercambio humano y los roles Farmacia y EPS conservan su bot local.

### Archivos modificados en esta continuación

- `frontend/src/components/Chat.jsx`: derivación explícita, contexto, continuidad del historial y reintento del borrador completo; sin formulario administrativo para el cliente autenticado.
- `frontend/src/hooks/useAdministrativeConversation.js`: distinguir elegibilidad y conversación humana activa; conservar el contenido pendiente.
- `frontend/src/lib/vitalix-engine.mjs`: reconocer solicitudes de atención humana, persona real y asesor humano.
- `frontend/tests/vitalix-engine.test.mjs`: cobertura de esas expresiones.
- `backend/tests/support/administrative-browser.cjs`: adaptar el recorrido existente a la solicitud explícita de Administración.
- `backend/tests/administrative-chat.isolated.cjs`: usuario sintético nuevo, consulta local sin creación, contexto, cinco mensajes alternados, envío administrativo consecutivo, cierre/reapertura y recarga de ambas interfaces.
- Este informe. Los demás cambios presentes en el árbol de trabajo pertenecían a la implementación previa y se conservaron.

### Prueba con dos navegadores y PostgreSQL real

Comando: `node tests/run-administrative-chat-isolated.cjs --browser`. Resultado final: **8 pruebas aprobadas, 0 fallidas**. Se usaron dos procesos Edge headless con perfiles separados, las interfaces compiladas, HTTP real y Socket.IO real. Las sesiones sintéticas se inyectaron en los navegadores; este recorrido no verifica el formulario de login ni el captcha.

Destino verificado por el ejecutor: contenedor existente `saludclick-afiliados-validate-20261111`, PostgreSQL en `127.0.0.1:55434`, base `saludclick_test`. Se arrancó el contenedor existente; no fue necesario preparar el esquema. El ejecutor no carga el `.env` principal ni ejecuta migraciones con este comando.

Resultados:

- Una pregunta sobre recuperación de acceso obtiene respuesta local y deja al usuario sin conversación administrativa.
- Solicitar Administración crea una conversación y envía el mensaje con contexto. Se activan contador e indicador de campana; el enlace abre Solicitudes y la lectura actualiza el contador.
- Cinco mensajes alternados se envían desde las interfaces: usuario → administrador → usuario → administrador → usuario. Se verifican además dos respuestas administrativas consecutivas sin un nuevo mensaje del usuario entre ellas.
- Solicitudes muestra el nombre del usuario; VITALIX muestra la respuesta. Se comprueba explícitamente el indicador «En tiempo real» del cliente conectado por Socket.IO.
- Cierre y reapertura desde Solicitudes, recarga de las dos interfaces, recuperación después de corte de red y recepción mediante consulta API después de desconectar el socket.
- Al terminar: **una conversación, nueve mensajes con identificadores únicos y tres notificaciones de mensaje para el administrador sintético**, una por cada mensaje del usuario. Las dos respuestas de recuperación adicionales se enviaron por API para simular mensajes perdidos durante desconexión.
- Seis reintentos concurrentes con la misma clave producen un solo mensaje y una sola notificación por administrador. Recrear el repositorio conserva el comprobante durable; cambiar el contenido con la misma clave devuelve 409.
- Sesiones y permisos: rechazo de roles ajenos y operaciones sobre conversaciones de otro usuario; sus sockets no reciben eventos de la conversación. Historial previo de 105 mensajes recuperable en páginas de 100 y 5.
- Cero excepciones JavaScript en los dos navegadores de la prueba aislada.

### Otras validaciones y conservación

- Pruebas dirigidas de backend (`administrative-chat`, `administrative-workspace`, `administrative-directory`): **38 aprobadas, 0 fallidas**.
- Motor VITALIX: **3 aprobadas, 0 fallidas**.
- Regresión administrativa en Edge con `FRONTEND_TEST_ADMIN_ONLY=1`: **9 aprobadas, 0 fallidas**. Verifica seis módulos, las cinco cuentas sintéticas iniciales y la navegación de los 50 afiliados EPS, filtros y detalle; también comprueba que Farmacia y EPS no transmiten sus preguntas a Administración.
- `npm run build`: aprobado. `npm run check`: 0 errores, 0 advertencias y 1 aviso informativo preexistente por `map` sin usar en `public/js/dashboard.js`.

No se modificaron datos ni contraseñas reales, módulos de Farmacia/EPS o funciones independientes del Paciente. Se mantienen Dashboard, Usuarios, Solicitudes, Notificaciones, Informes y Configuración; no se restauró Pacientes. No se consultó ni escribió la base principal para estas pruebas: la conservación de los 55 registros reales corresponde a que sus fuentes y datos se mantuvieron intactos; la validación visual se hizo con fixtures sintéticos. No se hizo commit, push ni despliegue remoto.

La primera ejecución de la regresión general de navegador terminó con 52 aprobadas y 2 fallos contabilizados (un caso y su suite): el caso de clics en servicios del inicio esperaba `/index.html` y observó `/`. La repetición completa terminó con **54 aprobadas, 0 fallidas**, sin modificar código del inicio. No se determinó la causa de esa incidencia inicial de navegación.

Pendientes y límites: ninguna prueba requerida del flujo local queda pendiente. No se hizo validación en producción, despliegue remoto ni prueba de login/captcha real; no se volvió a ejecutar toda la suite backend general, sino las 38 pruebas dirigidas descritas arriba.

Fecha: 2026-11-12. Implementación local, sin commit ni push.

## Revisión y alcance

Se reutilizaron `administrative_cases`, `administrative_messages`, `administrative_notifications`, la auditoría persistente y el namespace Socket.IO `/administrativo`. Solicitudes ya disponía de bandeja, detalle, respuestas, cierre/reapertura y permisos por propietario. Faltaba conectar el campo principal de VITALIX: previamente usaba respuestas locales y la atención administrativa requería una acción aparte.

El campo principal de VITALIX ahora envía automáticamente los mensajes del cliente autenticado (rol 2) a su conversación administrativa. Abrir el componente consulta el historial sin crear conversaciones vacías. Los invitados y los roles 3 y 4 conservan el bot local. No se transmite automáticamente el historial previo del bot.

## Comportamiento implementado

- Creación/recuperación y mensaje en una transacción; reapertura de la conversación existente cuando corresponde.
- Notificación persistente por mensaje nuevo para cada administrador activo. Los mensajes propios del administrador no le generan notificaciones.
- Clave de reintento por envío y comprobante durable en la auditoría existente: mismo envío devuelve el mensaje confirmado; cambiar su contenido con la misma clave devuelve 409. No requiere tablas ni columnas nuevas.
- Bloqueos transaccionales para impedir conversaciones y mensajes duplicados por concurrencia. Una notificación de apertura adicional no se genera al enviar automáticamente el primer mensaje.
- Respuestas dentro de VITALIX, autor, fecha/hora, historial paginado, borrador recuperable y errores visibles. El usuario puede reintentar con la misma clave cuando se pierde la confirmación.
- Campana con contador e indicador visual; notificación enlaza a la conversación y se marca leída al consultarla. Consultar un historial antiguo no borra avisos de mensajes posteriores aún no vistos.
- Socket.IO autenticado con token vigente al reconectar, sincronización por API al conectar y consulta periódica cada cinco segundos si falla el transporte.
- Se mantienen seis módulos administrativos. No se agregaron Pacientes, Auditoría ni Mensajería.

## Archivos de esta integración

Backend:

- `backend/src/routes/administrative.routes.js`: consulta de conversación actual y envío automático `/api/administrativo/vitalix/mensajes`.
- `backend/src/controllers/administrative.controller.js`: validación, respuestas y supresión de eventos duplicados.
- `backend/src/repositories/administrative.repository.js`: persistencia atómica, notificaciones, reintentos, lectura y concurrencia.
- `backend/src/validators/administrative.validator.js`: contenido, claves y rechazo de campos de suplantación.

Frontend:

- `frontend/src/hooks/useAdministrativeConversation.js`: historial, envío, recuperación, lectura y sincronización.
- `frontend/src/components/Chat.jsx` y `VitalixWidget.jsx`: integración mínima del componente compartido.
- `frontend/public/js/administrative-transport.js`: conexión compartida autenticada y carga del cliente Socket.IO.
- `frontend/public/js/administrative.js`, `administrative-chat.js`, `frontend/public/pages/admin.html` y `frontend/public/css/administrative.css`: campana, lectura, respuestas idempotentes y actualización de bandeja.

Pruebas:

- `backend/tests/administrative-chat.test.cjs` y `administrative-workspace.test.cjs`.
- `backend/tests/administrative-chat.isolated.cjs` y `run-administrative-chat-isolated.cjs`.
- `backend/tests/support/administrative-browser.cjs`.
- `backend/tests/frontend.test.cjs`: cierre ordenado de Edge antes de limpiar su perfil temporal.

## Persistencia real y seguridad

Ejecutado `node tests/run-administrative-chat-isolated.cjs --browser`: **8 pruebas aprobadas, 0 fallidas**. Usa PostgreSQL 17 local en el contenedor aislado `saludclick-afiliados-validate-20261111`, base `saludclick_test`, puerto 55434. El ejecutor verifica el contenedor/destino, obtiene credenciales en memoria y no carga el `.env` principal. Dos navegadores Edge ejecutaron la interfaz compilada contra esa API y Socket.IO reales; sus peticiones se fijaron expresamente al origen aislado.

Resultados comprobados:

- Seis envíos concurrentes con la misma clave: una conversación, un mensaje y una notificación para el administrador de prueba.
- El comprobante de reintento sigue funcionando después de recrear el repositorio. Un envío intencional con clave distinta sí genera otro mensaje.
- Respuesta administrativa repetida: un único mensaje, sin autonotificación.
- Mensaje escrito desde el campo principal de VITALIX: guardado en PostgreSQL, campana actualizada, enlace a Solicitudes, lectura y contador actualizado.
- Respuesta desde Solicitudes visible en VITALIX; historial conservado después de recargar. Reconexión de red y sincronización API después de desconectar Socket.IO aprobadas.
- Al terminar el recorrido automático había **7 mensajes persistidos en una sola conversación** del cliente de prueba.
- Historial previo de **105 mensajes** conservado y recuperado en páginas de 100 y 5.
- Lectura/escritura ajena, campos de identidad falsificados y roles no autorizados rechazados. Clientes ajenos no recibieron eventos. La identidad procede del JWT, nunca del remitente enviado por el navegador.

Para preparar esta base aislada se cargó exclusivamente la migración administrativa ya existente, sin crear una migración nueva. La solicitud actual permite pruebas con escrituras aisladas y prohíbe migraciones en la base principal. No se ejecutó ninguna migración en la base principal ni se modificaron sus cuentas, contraseñas, afiliados EPS o datos históricos. Los fixtures permanecen exclusivamente en la base de pruebas; no se borraron registros.

## Validación adicional

La suite backend general aprobó 411 pruebas. La compilación de frontend aprobó y `npm run check` informó cero errores y cero advertencias; permanece un aviso informativo previo de variable sin usar en `public/js/dashboard.js`.

La suite general de navegador aprobó **54 pruebas, 0 fallidas**, incluyendo que Farmacia y EPS mantienen su bot local sin enviar mensajes administrativos y que sus funciones existentes continúan operativas. Hubo dos incidencias del entorno durante las primeras ejecuciones: inicio del proceso gráfico dentro del sandbox y archivo temporal bloqueado al cerrar Edge. Se ejecutó el navegador fuera del sandbox y se agregó cierre ordenado antes de la limpieza; la repetición completa terminó correctamente.

No se desplegó en un servidor remoto. Las comprobaciones de escritura corresponden a PostgreSQL aislado, no a conversaciones de producción.
