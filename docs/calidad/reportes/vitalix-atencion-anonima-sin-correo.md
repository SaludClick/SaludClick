# VITALIX: atención directa de visitantes sin correo

Actualización posterior: [TLS, respaldo recuperable y migración principal aplicada](vitalix-tls-respaldo-migracion-principal.md). La migración y el flujo contra la base principal ya se verificaron con autorización; los pendientes descritos más abajo reflejan la etapa anterior.

Fecha: 2026-11-13. Cambios locales, sin commit, push ni despliegue.

## Resultado y límite de activación

Implementado y probado el recorrido visitante sin login → VITALIX → Solicitudes → notificación → administrador autenticado → respuesta en VITALIX. Se reutilizan las conversaciones, mensajes, auditoría, notificaciones y el namespace Socket.IO existentes. No se crean cuentas para visitantes, tablas paralelas ni un módulo adicional.

**La ampliación de esquema se aplicó únicamente en PostgreSQL aislado. Su aplicación en la base principal queda pendiente de autorización.** El código por sí solo no habilita visitantes en una base que conserve el esquema anterior. No se ejecutó ninguna migración ni escritura de pruebas contra la base principal.

## Revisión y cambios funcionales

La integración anterior solo admitía propietarios registrados con JWT. Las columnas de propietario, remitente y actor de auditoría exigían una cuenta. Además, VITALIX, el botón Contactar de Inicio y un enlace del dashboard todavía utilizaban el contacto administrativo inexistente. La portada también ofrecía otro enlace de correo como atención pública.

Se eliminaron esos canales de correo de las interfaces públicas y se sustituyeron por acceso a VITALIX. Registro sigue deshabilitado y ahora enlaza a la solicitud de cuenta en el chat. No se tocaron SMTP, recuperación de contraseña, autenticación, credenciales ni servicios internos de correo.

Pedir una cuenta o atención humana deriva la conversación. Las demás consultas continúan con el bot local hasta la derivación. Se incorporó la respuesta solicitada:

> ¡Claro! Puedo comunicarte directamente con Administración de SaludClick. No necesitas iniciar sesión. Escribe aquí tu solicitud y podrás recibir la respuesta en este mismo chat.

«Mensaje guardado y enviado a Administración» aparece solo después de una respuesta satisfactoria del backend. Sin conexión se conserva el borrador y no aparece confirmación ni un mensaje ficticio en el historial humano.

## Sesión anónima y seguridad

- Credencial opaca de 256 bits generada mediante Web Crypto; no es un JWT ni una cuenta. Se conserva en este navegador para recuperar el historial. Si el almacenamiento está bloqueado, queda disponible en memoria durante la página abierta.
- Se envía en la cabecera `Authorization: Vitalix …`, nunca en URL. PostgreSQL conserva únicamente SHA-256 y una caducidad de 30 días. Borrar los datos del navegador elimina su acceso local; no existe recuperación por correo ni acceso entre dispositivos.
- Las rutas `/api/administrativo/visitante/conversacion`, `/visitante/mensajes` y `/visitante/leido` solo operan sobre la conversación vinculada a esa credencial. No aceptan propietario, remitente ni identificador de conversación suministrado por el visitante.
- Una restricción de identidad mantiene propietario registrado o sesión visitante, y un índice único evita conversaciones anónimas duplicadas. Los visitantes no se insertan en `usuarios`.
- Transacciones y bloqueos serializan los reintentos. La auditoría existente conserva el comprobante durable de envío, separado por conversación. La misma clave con otro contenido devuelve 409.
- Los mensajes y notificaciones se guardan antes de emitir eventos. Cada mensaje del visitante genera una notificación por administrador activo; responder al visitante no genera notificaciones administrativas de mensaje.
- Socket.IO comprueba la credencial contra la base antes de entrar en la sala de esa conversación. Una sesión inexistente o caducada se rechaza. La sala no permite acceso a otras conversaciones. Los eventos solo contienen el identificador; el historial se obtiene por API con comprobación de sesión.
- Las rutas registradas y administrativas mantienen su autenticación y permisos normales. Se conservan los límites de frecuencia; las escrituras de visitantes tienen además un límite por IP.

## Archivos modificados en esta tarea

Frontend:

- `frontend/src/components/Chat.jsx`: respuestas sin correo, solicitud de cuenta o atención humana, remitente anónimo y confirmación después del guardado.
- `frontend/src/components/AdministrativeSupport.jsx`: acceso directo al chat sin redirección obligatoria a login.
- `frontend/src/hooks/useAdministrativeConversation.js`: transporte anónimo limitado, historial, reintentos y Socket.IO sin JWT de usuario.
- `frontend/public/js/administrative-transport.js`: credencial visitante, persistencia local, caducidad local y autenticación del socket.
- `frontend/public/js/main.js`: Contactar abre VITALIX.
- `frontend/src/pages/index.astro` y `frontend/public/pages/dashboard.html`: enlaces de atención al chat.
- `frontend/public/registro.html`: solicitud de cuenta por VITALIX, manteniendo el registro deshabilitado.

Backend y esquema:

- `backend/src/middlewares/administrative-visitor.middleware.js`: validación y hash de la credencial, sin permisos registrados.
- `backend/src/routes/administrative.routes.js`: operaciones anónimas limitadas antes de las rutas protegidas existentes.
- `backend/src/controllers/administrative.controller.js`: delegación al mismo repositorio y emisión después de persistir.
- `backend/src/repositories/administrative.repository.js`: propietario visitante, consulta y lectura propias, nombres visibles, notificaciones, caducidad y reintentos atómicos. Las consultas administrativas incluyen visitantes sin perder conversaciones registradas.
- `backend/src/sockets/administrative.socket.js`: acceso a sala visitante solo después de validar su sesión.
- `backend/prisma/schema.prisma`: relaciones opcionales para visitantes y campos de sesión en conversaciones existentes.
- `backend/prisma/migrations/20261113120000_administrative_visitors/migration.sql`: ampliación mínima de tablas existentes. Sin nuevas tablas ni cuentas.
- `backend/scripts/preflight-administrative.cjs`: incluir las columnas necesarias en la revisión de compatibilidad. No se ejecutó contra la base principal.

Pruebas y documentación:

- `backend/tests/administrative-chat.isolated.cjs`: aislamiento anónimo, ausencia de nuevas cuentas, caducidad, concurrencia, Socket.IO y recorrido completo en dos navegadores.
- `backend/tests/run-administrative-chat-isolated.cjs`: preparación explícita `--prepare-visitors`, restringida al destino aislado ya verificado.
- `backend/tests/support/administrative-socket-client.cjs`: credencial anónima en el handshake de prueba.
- `backend/tests/administrative-workspace.test.cjs`: cobertura de salas de actualización de conversación.
- `backend/tests/frontend.test.cjs` y `backend/tests/support/vitalix-browser.cjs`: sustituir expectativas antiguas de correo por VITALIX; mantener las pruebas del bot local y de navegación pública.
- Este informe y referencia desde el informe anterior.

Los demás archivos modificados que ya estaban en el árbol de trabajo antes de esta tarea se conservaron.

## Pruebas realizadas

### PostgreSQL, API, Socket.IO y dos navegadores reales

`node tests/run-administrative-chat-isolated.cjs --prepare-visitors --browser` preparó exclusivamente el esquema de visitantes en `saludclick_test`, contenedor existente `saludclick-afiliados-validate-20261111`, `127.0.0.1:55434`. Las repeticiones usaron `node tests/run-administrative-chat-isolated.cjs --browser`, sin migraciones adicionales. El ejecutor comprueba el destino y no carga el `.env` principal.

Resultado final: **10 pruebas aprobadas, 0 fallidas**. Edge headless ejecutó las interfaces compiladas en procesos y perfiles separados. El visitante entró por Inicio y abrió el widget, sin inyectar token ni usuario registrado. El administrador usó una sesión sintética JWT válida; la prueba no ejercita el formulario de login ni captcha.

Comprobaciones del visitante:

- Solicitud de cuenta desde el widget, sin correo ni login.
- Intento sin red: error visible, borrador conservado, sin confirmación y sin mensaje humano ficticio. Reintento con red: confirmación después de guardado.
- Campana y contador activados, enlace desde Notificaciones a Solicitudes, nombre «Visitante», respuesta en el mismo widget.
- Cinco mensajes alternados desde las interfaces, estado de Socket.IO «En tiempo real», recarga del visitante con historial conservado y cierre/reapertura por el administrador.
- Resultado: una conversación, cinco mensajes únicos, tres notificaciones de mensaje para el administrador de ese recorrido y ninguna cuenta registrada creada por el visitante.

Comprobaciones adicionales de API:

- Seis envíos concurrentes con la misma clave: un mensaje, una conversación y una notificación por administrador.
- Reinicialización del repositorio conserva el historial y el comprobante de reintento.
- Otra credencial no puede consultar la conversación; el hash almacenado no sirve como credencial original.
- Credenciales mal formadas, envíos sin clave, campos falsificados y contenido diferente con la misma clave se rechazan.
- La credencial visitante no permite consultar Usuarios ni rutas autenticadas de atención. Un socket sin conversación válida o con sesión caducada se rechaza.
- Mensajes anónimos aparecen en Solicitudes, se marcan leídos y mantienen fecha y remitente. La caducidad impide seguir consultando y enviando mediante esa sesión.
- El recorrido registrado anterior también aprobó: recarga de ambas interfaces, mensajes administrativos consecutivos, corte/reconexión de red, recuperación por API al desconectar el socket, nueve mensajes únicos en su conversación y permisos por propietario.

En una ejecución inicial, la suma de operaciones de varios recorridos con el mismo administrador sintético agotó el límite existente y produjo 429. Se separaron los administradores sintéticos por recorrido y la repetición completa aprobó, sin aumentar ni deshabilitar el límite del producto.

### Regresión y compilación

- Backend dirigido (`administrative-chat`, `administrative-workspace`, `administrative-directory`): **38 aprobadas, 0 fallidas**.
- Motor VITALIX: **3 aprobadas, 0 fallidas**.
- Regresión general en Edge: **54 aprobadas, 0 fallidas**, incluyendo Contactar sin sesión, registro deshabilitado, seis módulos, los 50 afiliados EPS mediante datos sintéticos y que Farmacia/EPS conservan el bot local sin derivar sus preguntas.
- `npm run build`: aprobado.
- `npm run check`: 0 errores y 0 advertencias; permanece un aviso informativo previo por `map` sin usar en `public/js/dashboard.js`.
- `prisma validate`: esquema válido, con URL sintética de validación y sin migrar ni conectar a la base principal.
- `git diff --check`: aprobado. Búsqueda en fuentes frontend: sin dirección administrativa inexistente ni enlaces `mailto:` en las interfaces.

## Conservación y pendientes

Se mantienen Dashboard, Usuarios, Solicitudes, Notificaciones, Informes y Configuración. No se restauró Pacientes. Las fuentes de las cinco cuentas locales y los 50 afiliados EPS no se modificaron; la comprobación visual usó fixtures sintéticos. No se tocaron funciones independientes del Paciente, Farmacia, EPS, contraseñas ni datos reales.

La única modificación del dashboard personal fue reemplazar su enlace de contacto inexistente por VITALIX. No se cambiaron sus operaciones ni permisos.

Pendiente para activar en la base principal: revisar y autorizar la migración `20261113120000_administrative_visitors`, aplicarla en el destino autorizado y desplegar los cambios. No se ejecutaron esas acciones. No hay pruebas locales requeridas pendientes; no se afirma validación en producción.
