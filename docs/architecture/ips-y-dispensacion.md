# IPS, autorización y dispensación

## Entidades y compatibilidad

El rol institucional actual usa el ID 4. La sesión EPS comprueba la membresía de la cuenta y el acceso vigente a la entidad. Las tablas `eps_entidades`, `eps_accesos` y `eps_farmacias` también intervienen en la consulta de solicitudes y el aislamiento del directorio de afiliados. El repositorio de solicitudes cruza `afiliado_cuentas_origen.eps_id` con la entidad y la farmacia vinculada. Renombrar todos los identificadores como IPS haría indistinguibles la afiliación a la aseguradora y el ámbito de atención del prestador.

Se propone conservar las referencias y contratos de afiliación EPS y crear el ámbito IPS con una relación explícita al asegurador y una membresía de prestador. La migración debe ser aditiva. Debe validar coincidencias y exigir una correspondencia de entidades y cuentas aprobada antes de asignar acceso. Las rutas históricas deben mantener su autenticación y ámbito durante la transición. Solo se cambiarán el destino del rol 4 y la navegación después de verificar a qué institución pertenece cada cuenta.

## Responsabilidades acordadas

| Etapa | Actor | Decisión y registro |
| --- | --- | --- |
| Emisión | IPS | Registra solicitud, medicamentos, cantidades y referencia de la orden clínica. |
| Autorización | IPS | Autoriza cantidades y vigencia o registra rechazo, corrección o cancelación clínica. |
| Revisión y asignación | Administración | Revisa el trámite y asigna farmacia. Puede devolver por una inconsistencia operativa. |
| Preparación | Farmacia asignada | Un miembro vigente registra disponibilidad y prepara las cantidades dentro del saldo autorizado. |
| Dispensación | Farmacia asignada | Registra la salida efectiva. Si es a domicilio, conserva la custodia y delega la visita al domiciliario asignado. |
| Constancia y cierre | Paciente o receptor autorizado y domiciliario | El receptor firma la constancia. El domiciliario registra el resultado. El sistema aplica el movimiento confirmado y calcula el saldo. |

Aquí los segmentos son etapas del proceso. Cada dispensación puede cubrir una parte de la cantidad autorizada. El pedido debe quedar vinculado a la farmacia asignada. Una visita fallida registra ausencia, rechazo, dirección incorrecta o devolución sin descontar el saldo. Una entrega confirmada descuenta lo dispensado. El cierre total requiere saldo cero o un cierre motivado con trazabilidad, según corresponda.

Los movimientos deben conservar una clave de idempotencia y una referencia a la asignación, el actor y sus cantidades. En una misma transacción se valida membresía, vigencia y saldo, se registra el movimiento y se actualiza el estado. Un reintento con la misma clave y el mismo contenido devuelve el resultado previo. Un cambio de contenido para la misma clave genera conflicto.

## Identidad y constancia

La revisión manual permite verificar identidad utilizando los campos que ya exige el rol y conservar el resultado, fecha y actor. La captura por cámara obtiene una imagen. La prueba de vida estima si la captura corresponde a una persona presente. La comparación facial evalúa una coincidencia entre imágenes. Cada capacidad requiere una decisión separada sobre finalidad, proveedor, coste, conservación y eliminación. La [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) clasifica los datos biométricos como sensibles. La [SIC](https://sedeelectronica.sic.gov.co/comunicado/la-superintendencia-de-industria-y-comercio-ordena-un-conjunto-residencial-habilitar-mecanismos-de-ingreso-que-no-impliquen-el-tratamiento-de-datos-biometricos-y-suprimir-los-datos-biometricos-de-residentes-que-asi-lo-solicitan) ha exigido alternativas sin biometría y autorización previa, expresa e informada.

La aceptación del tratamiento de datos y la constancia de recepción deben guardarse por separado. El registro debe incluir versión del documento, fecha, actor, relación del receptor con el paciente, evidencia de identidad e integridad y acceso a una copia. El método se debe revisar frente a los requisitos de identificación, aprobación y confiabilidad de la [Ley 527 de 1999](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=4276). Los textos y el mecanismo de firma requieren revisión jurídica antes de operar con pacientes reales.
