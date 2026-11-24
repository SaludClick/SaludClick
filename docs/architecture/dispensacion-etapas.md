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

Las confirmaciones usan textos de demostración. Para producción quedan por revisar los [documentos y el método de firma](borradores-entrega-domiciliaria.md) y la integración con existencias físicas. Las operaciones de IPS, administración y farmacia se prueban por API, mientras que Domiciliario y la constancia tienen pantallas propias.
