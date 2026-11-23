# Cierre técnico del módulo EPS y preparación de VidaPlena

## Resultado

- Desarrollo verificado del alcance actual: **100 %**. Los nueve módulos y el flujo integrado se comprobaron contra la API real de la aplicación sobre PostgreSQL aislado, con checkout en modo simulado. La aprobación aplica al alcance implementado y probado.
- Preparación operativa verificada: **43 % (3 de 7 hitos)**. El cálculo asigna el mismo peso a los hitos operativos de la tabla. La estimación anterior de 75 % se emitió antes de consultar Neon.
- Se revisó la versión local basada en `6d45c46`. El árbol estaba limpio al iniciar. Las consultas a Neon se ejecutaron en transacciones de solo lectura. Esta intervención dejó cambios locales y un informe, sin commits ni pushes.

## Funcionalidades verificadas

| Módulo EPS | Comprobación |
| --- | --- |
| Dashboard | Indicadores de la entidad y navegación al detalle. |
| Afiliados | Listado, alta, edición, filtros, rechazo de duplicados y conflictos de versión. |
| Pacientes vinculados | Consulta limitada a cuentas vinculadas de la entidad. |
| Farmacias | Convenios vigentes y consulta de inventario por farmacia. |
| Solicitudes | Seguimiento e historial, conservando el estado operativo del pedido. |
| Autorizaciones | Alta, aprobación, rechazo, historial y asignación a farmacia habilitada. |
| Inventario | Búsqueda, filtros, paginación y estados de existencias del convenio. |
| Notificaciones | Destinatarios por cuenta y rol, avisos y confirmación de lectura. |
| Perfil | Consulta y edición de datos permitidos. El cierre de sesión revoca el token anterior. |

Las suites comprueban formularios, autenticación JWT, vigencia de cuenta y rol, aislamiento por EPS y farmacia, validación de entradas, errores de API, control de versiones, atomicidad e idempotencia. Administrador gestiona vínculos y consulta estados operativos con alcances restringidos. Paciente consulta su propia afiliación, solicitudes y autorizaciones. EPS revisa y asigna. Farmacia consulta sus pedidos, gestiona existencias del convenio y registra la preparación y entrega. El paciente recibe el estado y los avisos. El checkout de esta prueba usa el modo simulado identificado por la aplicación.

## Hallazgos y correcciones

- El controlador de pedidos registraba excepciones completas. El recorrido aislado reprodujo referencias de pago simulado y trazas en la salida. Los errores de creación, búsqueda y detalle ahora registran el nombre de la operación. Se conservaron las respuestas HTTP del controlador. Archivo: `backend/src/controllers/order.controller.js`.
- La comprobación responsive explícita de EPS cubría 390 y 320 px. Se añadieron 1440 y 820 px a la prueba de ausencia de desbordamiento horizontal en Inventario. En móvil también se verifica la navegación, el foco, el desplazamiento interno de la tabla y el cuadro de registro de afiliado. Archivo: `backend/tests/eps-postgres.isolated.cjs`.
- La falta de cuentas de paciente y de existencias se verificó como un pendiente de datos. Los mecanismos existentes para vincular identidades y registrar existencias se comprobaron en aislamiento. No fue necesario agregar rutas, cambiar contratos ni modificar vistas.
- Este informe se registra en `docs/calidad/reportes/eps-cierre-vidaplena.md`.

## Resultados de la validación

| Validación | Resultado |
| --- | --- |
| Regresión de backend | 636 aprobadas. |
| EPS, integración de cuatro roles y activación sobre PostgreSQL aislado | 29 aprobadas, incluidas las pruebas de Edge habilitadas con `EPS_BROWSER=1` y `EPS_ROLES_BROWSER=1`. |
| Pruebas de frontend | 6 aprobadas. |
| Compilación Astro | 18 páginas generadas, incluida `/pages/eps.html`. |
| Astro check | 75 archivos, 0 errores, 0 advertencias y 0 sugerencias. |
| Responsive EPS en Edge | Inventario a 1440, 820, 390 y 320 px. |
| PostgreSQL operativo | Lectura de esquema, afiliación, convenio e inventario. |

La suite aislada emitió una advertencia de deprecación de `pg` por consultas concurrentes sobre un mismo cliente. Las pruebas terminaron correctamente. La validación de navegador de esta intervención usó la API aislada.

## Preparación de VidaPlena

| Hito | Evidencia o dato requerido |
| --- | --- |
| Acceso EPS activo | Confirmado. La base tiene una cuenta EPS activa con acceso vigente y VidaPlena está activa. |
| Padrón disponible | Confirmado. 50 afiliados de VidaPlena y 0 documentos duplicados. |
| Farmacia habilitada | Confirmado. Un convenio activo con una cuenta de farmacia activa. |
| Paciente del piloto vinculado | Pendiente. Hay 0 cuentas vinculadas. Hace falta la identificación comprobable del afiliado y la cuenta activa de paciente correspondiente. Administrador dispone de la operación de vínculo. |
| Medicamentos y existencias del piloto | Pendiente. Hay 0 registros de existencias en convenios activos de VidaPlena. Hace falta acordar la lista autorizada de medicamentos y cantidades del piloto, identificar cada medicamento en el catálogo y suministrar stock disponible y mínimo por convenio. Farmacia puede registrar los saldos mediante su sección de integración. |
| Perfil administrativo completo | Pendiente. La ciudad consta en el registro. Hace falta aportar NIT, correo, teléfono y dirección de VidaPlena. |
| Recorrido en preproducción | Pendiente. Hace falta un entorno de preproducción identificado, acceso a las cuentas autorizadas para los cuatro roles y los datos anteriores. El ensayo debe comprobar solicitud, resolución, asignación, inventario disponible, preparación, entrega y consulta del estado. |

La lectura operativa no permite comprobar disponibilidad para medicamentos concretos hasta disponer de la lista del piloto. El modo simulado cubre la prueba técnica del checkout. Los cobros reales requieren un proveedor de pagos. La dispensación de medicamentos sujetos a fórmula o con requisito desconocido permanece bloqueada según las reglas vigentes.

## Esquema y migraciones

- Neon registra finalizadas y sin reversión las cuatro migraciones EPS revisadas, incluida `20261115120000_farmacia_eps_unica`. El índice `eps_farmacias_una_eps_activa_key` existe.
- `20261120180000_presentacion_medicamento_texto` está en el repositorio y no figura aplicada en el destino consultado. Prisma declara `Text` y Neon conserva `character varying`. Para EPS se comprobó la lectura de catálogo en aislamiento. La migración de catálogo queda independiente del cierre EPS. Su eventual aplicación requiere prueba aislada y respaldo restaurable verificado.
- `medicamentos.stock_minimo` existe en Neon como entero `NOT NULL`, con valor por defecto `0` y restricción `CHECK (stock_minimo >= 0)`. El modelo Prisma revisado no lo declara. No se ejecutó `db push`, no se propuso una migración EPS y no se alteró el esquema.

