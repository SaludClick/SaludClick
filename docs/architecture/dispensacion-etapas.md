# Dispensación por etapas

La migración aditiva `20261124000000_dispensacion_etapas` crea el expediente operativo y los permisos aprobados. `DISPENSACION_ETAPAS_ENABLED=true` habilita las rutas en un entorno aislado. No se crean instituciones, convenios ni membresías al migrar. El alcance y los roles están en la [matriz aprobada](matriz-operativa-pendiente.md).

## Puesta en marcha de una prueba aislada

1. Aplica las migraciones de revocación, alta diferenciada y dispensación, en ese orden, en una base desechable con el esquema anterior. Crea cuentas ficticias y verifica las invitaciones antes de habilitarlas.
2. Administración configura el prestador y un convenio EPS con `PUT /api/dispensacion/instituciones/:ips`. Habilita responsables IPS con `PUT /api/dispensacion/instituciones/:ips/personal/:usuario` y el responsable de farmacia con `PUT /api/dispensacion/farmacia/personal/:usuario`.
3. Los responsables usan esas mismas rutas para su personal. El perfil `CLINICO` exige una referencia de revisión de credenciales y una persona revisora distinta del titular. Un responsable IPS con habilitación clínica puede autorizar. Cada domiciliario tiene una sola farmacia activa.
4. Para cada operación usa `POST /api/dispensacion/solicitudes/:id/etapas/:accion` con un UUID en `Idempotency-Key`. Conserva la clave al reintentar la misma operación. Consulta el estado en `GET /api/dispensacion/solicitudes/:id`. Administración ve solo los datos operativos de asignación.

| Operaciones | Actor |
| --- | --- |
| `AUTORIZAR`, `CORREGIR`, `RECHAZAR`, `CANCELAR` | Personal clínico habilitado de la IPS, con convenio activo para una autorización inicial o corregida. |
| `ASIGNAR` | Administración asigna una farmacia con responsable vigente. |
| `PREPARAR`, `DISPENSAR` | Personal operativo o responsable de la farmacia asignada. `DISPENSAR` corresponde a recogida en farmacia. |
| `ASIGNAR_VISITA`, `REPROGRAMAR_VISITA`, `CONCILIAR_VISITA` | Responsable de la farmacia asignada. |
| `INICIAR_VISITA`, `RESULTADO_VISITA` | Domiciliario asignado. |
| `AUTORIZAR_RECEPTOR`, `FIRMAR` | El paciente autoriza a un receptor por visita. El paciente o receptor firma desde su sesión. |

El cuerpo de autorización contiene `cantidades` por identificador de medicamento, `vence_at` en UTC y, opcionalmente, `etapas` como lista de mapas de cantidades cuya suma coincide con el total. Sin plan explícito se crea una etapa. La validación exige que el plan corresponda al pedido y limita preparación y entrega al saldo de la etapa. Cada operación bloquea la fila de la solicitud y registra el resultado y la clave de reintento en la misma transacción. Las solicitudes con una asignación histórica activa se rechazan al entrar al flujo de etapas.

El domiciliario ve identificador de solicitud, dirección y vigencia de sus visitas. La pantalla de constancia se abre desde Mis pedidos o mediante el enlace compartido con el receptor por el paciente. El receptor necesita una cuenta activa y correo verificado y solo puede ver el detalle de la visita autorizada. La copia conserva el documento exacto, la versión, el firmante y su calidad, la fecha, el método y la huella SHA-256.

El responsable puede registrar `CONCILIAR_VISITA` con el identificador de visita y una referencia de verificación de la entrega cuando el domiciliario perdió acceso, la autorización sigue vigente y se conservaron las dos constancias. El evento identifica al responsable. Se descuentan las cantidades preparadas una sola vez y las constancias se conservan. Una discrepancia sobre la entrega o una autorización vencida requieren revisión antes de cerrar.

## Existencias físicas

`PREPARAR` reserva unidades de la farmacia asignada y solo aplica la diferencia si se cambia la preparación. Cancelar, reprogramar o registrar una visita fallida sin constancias libera esa reserva. La entrega en farmacia, el resultado exitoso de la visita y la conciliación consumen la reserva y reducen la cantidad física. El cierre y su movimiento por medicamento comparten transacción, clave de operación y bloqueo de la solicitud. Un movimiento domiciliario conserva el identificador de visita, el domiciliario original y la persona que cerró o concilió.

La migración `20261124010000_stock_dispensacion` extiende el libro de inventario existente y mantiene los índices de unicidad históricos. Se detiene si encuentra preparaciones o entregas por etapas anteriores a la integración que deban conciliarse. El flujo por etapas rechaza también los pedidos con movimientos históricos de inventario. El checkout histórico actualiza el stock global del catálogo en `medicamentos.stock`. La nueva entrega solo modifica `farmacia_existencias`, que representa el inventario acreditado de la farmacia.

Las confirmaciones usan textos de demostración. Para producción quedan por revisar los [documentos y el método de firma](borradores-entrega-domiciliaria.md). IPS, Administración y Farmacia tienen el acceso **Gestionar dispensación** en sus paneles. Domiciliario registra las visitas desde Entregas asignadas y el paciente confirma desde la constancia de su pedido.

## Demo local en Windows

Compila el frontend con `npm run build` desde `frontend`. Desde la raíz, define `SALUDCLICK_DEMO_PASSWORD` con la contraseña de prueba y ejecuta `backend/scripts/start-dispensacion-demo.ps1 -PostgresBin <carpeta-bin-de-PostgreSQL>`. Si la ejecución de scripts está deshabilitada, ejecuta ese archivo con `powershell.exe -NoProfile -ExecutionPolicy Bypass -File` para limitar la excepción al proceso de la demo.

El script crea un clúster nuevo en loopback y lo detiene al salir. Abre `http://127.0.0.1:4324/demo-login.html` y usa la credencial ficticia de Domiciliario o uno de estos perfiles con la misma contraseña local: `paciente@example.test`, `ips@example.test`, `admin@example.test` y `farmacia@example.test`. La ruta de ingreso local utiliza bcrypt y la autorización real de la aplicación. Solo existe en el proceso de demostración, con correo y Google desactivados. Las migraciones se aplican a esa base vacía.

La demo nueva trae las solicitudes 1 y 2 asignadas. La solicitud 3 está pendiente de autorización. Farmacia es el usuario 3, Domiciliario es el usuario 6 y el producto ficticio tiene código 1. Para la prueba automatizada con datos recién creados, usa `SALUDCLICK_DEMO_E2E=1` y ejecuta `node --test backend/tests/dispensacion-demo.browser.cjs` desde la raíz. Esa prueba realiza transiciones reales en la base de demostración.
