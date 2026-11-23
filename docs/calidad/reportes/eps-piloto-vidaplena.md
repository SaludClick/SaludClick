# Piloto simulado de VidaPlena

## Estado

**Piloto en PostgreSQL aislado: 100 % (7 de 7 hitos).** La corrida reproduce el tamaño del padrón con 50 afiliados sintéticos generados localmente. Uno usa la cuenta de prueba ya presente en la suite y los otros 49 ejercitan la creación de cuentas nuevas.

**Neon operativo: 43 % (3 de 7 hitos del cierre anterior).** La consulta de solo lectura en VidaPlena confirmó 50 afiliados, 0 vinculaciones a cuentas, 1 coincidencia de tipo y número de documento con una cuenta activa de paciente, 1 convenio con farmacia activa y 0 registros de existencias. La coincidencia de documento queda pendiente de validación de identidad y autorización. Los datos de Neon no se exportaron al piloto.

| Hito | Evidencia en PostgreSQL aislado |
| --- | --- |
| Acceso EPS activo | Administrador habilitó la membresía y EPS consultó su entidad con JWT. La revocación posterior se comprobó por API. |
| Padrón disponible | Se verificaron 50 afiliados de VidaPlena con 50 identificadores de usuario distintos. |
| Farmacia habilitada | El convenio activo permitió asignar el pedido a su farmacia. Una segunda farmacia recibió una cola filtrada y acceso denegado al pedido ajeno. |
| Pacientes vinculados | Se replicó la vinculación mediante la ruta de Administrador, con identidad exacta y autorización vigente. La segunda ejecución conservó cuentas, identificadores, versiones, fechas de verificación y cantidad de eventos. |
| Medicamento y existencias | Para el artículo del recorrido se registraron 8 unidades y mínimo 5 en el convenio. EPS y Farmacia comprobaron el saldo. La suite cubrió stock bajo, agotado, rechazo de versión obsoleta y aislamiento por convenio. |
| Perfil administrativo | Nombre con la etiqueta SIMULACION SIN VALIDEZ OPERATIVA, NIT PRUEBA-VIDAPLENA, correo reservado example.test, teléfono de ceros y dirección ficticia. |
| Recorrido completo | Paciente envió el pedido con pago simulado, EPS lo autorizó y asignó, Farmacia registró preparación y entrega, y Paciente consultó el estado final. Se verificaron historial, notificaciones, reintentos y permisos. |

El aprovisionamiento está dentro de la suite `backend/tests/eps-roles.isolated.cjs`, que crea su propia instancia PGlite y conecta Prisma a un puerto local efímero. Genera contraseñas con 32 bytes aleatorios, persiste hashes bcrypt de coste 10 y comprueba el hash al crear una cuenta. Las credenciales de texto claro se descartan en la prueba. La suite utiliza JWT de prueba para las solicitudes del recorrido. Neon operativo se consultó en solo lectura. No se ejecutaron migraciones operativas ni se hicieron commits o pushes.

## Resultados

- 30 pruebas de integración, PostgreSQL y activación aprobadas, incluida la navegación Edge de los cuatro roles.
- Regresión completa del backend aprobada con código de salida 0.
- 22 pruebas focalizadas de EPS y Farmacia aprobadas.
- La primera corrida de Edge conservaba una expectativa con el nombre anterior de la entidad. Se actualizó la expectativa y pasó la corrida completa.
- Las suites de PostgreSQL emitieron la advertencia conocida de deprecación de consultas concurrentes de `pg`.

## Reproducción

Con el frontend compilado, ejecutar desde `backend`:

```powershell
$env:EPS_BROWSER = '1'
$env:EPS_ROLES_BROWSER = '1'
node --test tests/eps-roles.isolated.cjs tests/eps-postgres.isolated.cjs tests/eps-activation.isolated.cjs
```

