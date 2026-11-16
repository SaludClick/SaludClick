# Farmacia — continuación integrada Usuarios EPS e Inventario

Fecha: 2026-11-15. Rama comprobada antes de editar:
`integracion/farmacia-pendientes`. Se inspeccionó `git status --short` y se
conservaron las modificaciones y archivos no rastreados de las fases previas.
No se encontraron instrucciones AGENTS.md en el árbol consultado.

## Resultado y reutilización

El directorio Usuarios ya existía en código: no se ha vuelto a implementar.
Se reutilizan controlador, servicio, validador, repositorio SQL, pantalla
independiente y autenticación vigente. `afiliados` es la fuente consultada
directamente; no se crea otra tabla, cuenta, EPS ni copia de pacientes.
El vínculo activo se resuelve en servidor con la cuenta autenticada, nunca
desde parámetros ni claims adicionales de EPS enviados por el navegador.

Las consultas de nombres, apellidos y estado, junto con la EPS resuelta,
ocurren en `REPEATABLE READ READ ONLY`. Totales y filas comparten instantánea.
Se filtra por EPS y `lower(btrim(estado))='activo'`, sin exigir cuenta local,
conversación, pedido ni autorización farmacéutica. Cada consulta vuelve a leer
el vínculo y los registros actuales. Solo hay rutas de lectura para Farmacia.

Se mejora la privacidad de la pantalla: retira filas y contadores anteriores
mientras revalida. Ante error, oculta tabla, retira la EPS anterior, deshabilita
búsqueda/paginación y conserva Actualizar consulta para recuperarse.

La prueba nueva reproduce 50 afiliados ficticios de EPS textual `1` para
Farmacia `4`, dos páginas de 25, exclusión de inactivos y otra EPS, ausencia de
lectura sin vínculo y actualización de nombre, estado y EPS sobre los mismos
registros. No son los pacientes reales de Neon ni una comprobación en vivo.

**Estado real:** no se ha creado el vínculo 4→1. El directorio no puede mostrar
los 50 pacientes reales hasta resolver los bloqueos siguientes. Sin vínculo
responde HTTP 200 con `vinculacion.estado: SIN_VINCULO` y lista vacía; si falta
esquema responde 503 sanitizado. No se simula un vínculo exitoso en producción.

Límite adicional de verificación: en este árbol, el rol EPS tiene solamente
`GET /api/eps/verificar-acceso`, no un listado de pacientes propio. Existe otro
lector administrativo de origen EPS por `EPS_DATABASE_URL` con catálogo `eps`,
mientras el directorio Farmacia reutilizado consulta `afiliados` y
`eps_entidades` de la conexión de aplicación. Sin consultar ni modificar
entornos reales no se certifica identidad entre bases distintas configuradas.
La prueba acredita lectura de la misma tabla de afiliados del workspace, no
equivalencia entre conexiones externas. No se añadió acceso a la fuente
administrativa ni se cargaron sus 13 campos personales para Farmacia.

## Bloqueo de EPS conservado

Revisión del árbol de migraciones y `git log --all` por las rutas originales:
siguen ausentes los dos SQL originales. No se reconstruyeron ni ejecutaron.
Los datos y checksums siguientes proceden del informe anterior de preparación,
no de una nueva lectura de Neon:

| Original requerido | SHA-256 registrado anteriormente |
|---|---|
| `20261114090000_eps_workspace/migration.sql` | `2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835` |
| `20261115090000_eps_role_integration/migration.sql` | `99b5dca81847e36f95f4f0d1372dd4598705abb5eb98f408ead9d7637212076e` |

Se necesita recuperar ambos archivos exactos del autor u otro respaldo,
verificar los bytes y su historial aplicado; no volver a ejecutarlos. Después,
y en una intervención autorizada por separado, revisar e instalar únicamente
el índice parcial preparado `eps_farmacias_una_eps_activa_key` en
`eps_farmacias(farmacia_id) WHERE activa=true`, verificando ausencia de duplicados
y conciliación del historial. No ejecutar despliegue general de migraciones.

Se revisó y conservó sin modificar el código administrativo existente:
`GET/PUT /api/admin/farmacias/:id/eps`, protegido por `requireAdmin`. El PUT
revalida las cuentas bajo bloqueo ordenado, verifica el índice real, exige
versión del vínculo, comprueba EPS vigente y escribe vínculo y auditoría en
una sola transacción. Sin índice falla antes de mutar. La auditoría fallida
revierte el vínculo. No se construyó una sesión administrativa real.

La asociación futura `PUT /api/admin/farmacias/4/eps` con
`{"epsId":"1","vinculoActual":null}` necesita autorización posterior y sesión
administrativa auténtica, tras revalidar el estado con GET. Este informe no
autoriza ni ejecuta el índice o el PUT.

## Preparación segura de inventario

Se mantienen consulta global, búsqueda, filtros, detalle, paginación,
contadores, aviso orientativo de 1–5 unidades y diseño adaptable. El esquema
Prisma sigue sin titularidad, establecimiento, movimientos, lotes,
vencimientos ni mínimos. Asociar EPS no demuestra propiedad del inventario.

Nuevo validador y servicio de dominio, **sin adaptador persistente ni ruta de
escritura**, permiten probar entradas, salidas manuales y ajustes en aislamiento.
La exportación por defecto devuelve 503 `INVENTARIO_ESTRUCTURA_PENDIENTE` para
un comando válido. No hay flag de entorno que permita habilitarlos.

El DTO del servicio (`inventarioId`, medicamento, cantidad, tipo, motivo,
dirección para ajustes y UUID v4 idempotente) describe un contrato futuro;
no representa columnas o tablas existentes. Rechaza actor, fecha, lote y
campos adicionales enviados por cliente. El actor debe venir de una sesión
validada en servidor; fecha y huella se generan dentro del servicio.

El adaptador futuro deberá implementar una única transacción con estas
garantías; el doble de pruebas solo las simula:

1. `autorizar`: revalidar y bloquear cuenta activa rol 3 y relación explícita
   de titularidad inventario–establecimiento–cuenta. Verificar permiso por
   ENTRADA/SALIDA/AJUSTE. Bloquear la relación para impedir revocación concurrente.
2. `bloquearInventario`: serializar todas las operaciones del inventario,
   incluidas claves repetidas dirigidas a medicamentos distintos. Mantener
   orden estable de bloqueos (cuenta, relación, inventario, existencia).
3. `bloquearSaldo`: seleccionar existencia por inventario y medicamento bajo
   bloqueo. Nunca usar solo el ID global de medicamento como autorización.
4. `buscarClave`: consultar clave única por inventario. Igual huella y actor
   devuelve el registro anterior; contenido distinto da conflicto. Revalidar
   titularidad incluso al repetir; no devolver auditoría tras una revocación.
5. `actualizarSaldo`: comparar versión y actualizar una sola fila. Cantidad
   entera positiva; saldo final entero entre 0 y 2147483647. CHECK y UNIQUE
   persistentes serán necesarios cuando se apruebe el esquema.
6. `registrarAuditoria`: INSERT inmutable con responsable, fecha, tipo,
   cantidad, motivo, delta, saldo anterior/final, clave y huella. Cualquier
   fallo revierte también el saldo. No borrar movimientos; contramovimientos
   requieren un diseño posterior de referencias y aprobación.

El mutex de las pruebas no sustituye bloqueos o restricciones PostgreSQL.
No se implementó un repositorio que escriba contra el saldo global, ni se
añadieron campos a Prisma. La aprobación específica de ajustes se representa
en `tiposPermitidos`, cuya fuente persistente sigue pendiente. Salidas del
servicio preparado son operaciones manuales futuras: no se integran con
entregas, pagos ni recetas, ni acreditan dispensación.

La pantalla Inventario incorpora un componente informativo de movimientos
bloqueados, sin formulario que aparente persistencia. Lotes, vencimientos y
mínimos configurables siguen pendientes de esquema, permisos y políticas.
No se equipara un registro sanitario con un lote ni un umbral visual con un
mínimo configurado.

El diseño pendiente de mínimos requiere una política por inventario y
medicamento, umbral entero no negativo, autor, fecha y versión, permisos de
configuración y auditoría del cambio. La evaluación visual debe usar esa
política verificada; no guardar valores en localStorage como si fueran del
establecimiento. Lotes requieren identificación persistente, relación con la
existencia autorizada, recepción, vencimiento y cantidades conciliadas; definir
cuarentena, vencidos y selección FEFO antes de admitir salidas. Son requisitos
de diseño futuros, no campos actuales ni migraciones preparadas en esta fase.
Se conserva la propuesta conceptual previa de
`farmacia-inventario-medicamentos-2026-11-14.md`.

Se conserva `order.repository.js`: el pedido descuenta stock al crearse bajo
`FOR UPDATE`. La transición de entrega actualiza estado/fecha, no existencias.
Una prueba HTTP adicional envía entregas concurrentes y un reintento, y falla
si la entrega intenta acceder al repositorio de medicamentos. Pago simulado
y fórmula requerida/desconocida continúan bloqueando el avance de Farmacia.
Los riesgos del escritor compartido ya descritos en Fase 3 permanecen fuera
de este cambio: no se certifica integridad global ni dispensación real.

## Archivos de esta continuación

Nuevos:

- `backend/src/validators/farmacia-movimientos.validator.js`.
- `backend/src/services/farmacia-movimientos.service.js`.
- `backend/tests/farmacia-movimientos.test.cjs`.
- `frontend/src/components/FarmaciaMovimientosEstado.astro`.
- Este informe y evidencias `integracion-*` en la raíz.

Modificados sobre el trabajo local anterior:

- `frontend/public/js/farmacia-usuarios.js`: retirada de información obsoleta.
- `frontend/src/pages/pages/farmacia-inventario.astro`: componente informativo.
- `backend/tests/farmacia-eps.test.cjs`: 50 afiliados, actualización del origen,
  error/reintento de consulta en navegador sin conservar datos anteriores.
- `backend/tests/farmacia-solicitudes.test.cjs`: no doble descuento al entregar.
- `backend/tests/farmacia-notificaciones-socket.test.cjs`: margen temporal del
  token de prueba de expiración, de 1 a 3 segundos, manteniendo expiración real.
  JWT redondea la emisión a segundos y antes podía vencer durante el handshake.
  No cambia la configuración ni la activación del módulo de producción.

No se modificaron rutas, interfaces, permisos o datos de otros roles, código
administrativo de vinculación, esquema, migraciones o configuración de
Notificaciones. Se conserva el stash `farmacia-pendientes-respaldo-20261114`
y los archivos/respaldos de auditoría. Sin commit, push ni conexión a Neon.

## Endpoints

No se crean endpoints. Se reutilizan:

| Endpoint | Uso |
|---|---|
| GET `/api/farmacia/eps` | Vínculo de cuenta autenticada |
| GET `/api/farmacia/usuarios` | Afiliados activos, búsqueda, paginación y total |
| GET `/api/farmacia/inventario` y `/:id` | Consultas y stock bajo orientativo |
| GET `/api/farmacia/medicamentos` y `/:id` | Catálogo conservado |
| PATCH `/api/farmacia/pedidos/:id/estado` | Transición existente sin segundo descuento |
| GET/PUT `/api/admin/farmacias/:id/eps` | Solo revisados; no modificados ni ejecutados contra Neon |

## Porcentajes y matriz

Inventario conserva los mismos once criterios y pesos binarios de Fase 3:
**7/11 = 63,6 %**. Los criterios 1 (inventario propio), 5 (movimientos reales),
6 (auditoría persistente) y 7 (integridad global negativa/duplicada) siguen en
cero. Preparar código aislado no cambia su estado operativo. Los otros siete
criterios mantienen sus evidencias; el 4 corresponde solo a avisos orientativos,
y el 9 a revisión del soporte de lotes/vencimientos, no a su implementación.

No hay matriz histórica de avance general con pesos verificables en los
informes disponibles. Para evitar un porcentaje incomparable presentado como
continuidad, se establece **matriz de preparación v1**: nueve pantallas ya
existentes, cuatro evidencias de igual peso por módulo. No se añaden Fórmulas
ni se amplía el alcance a otros roles.

- P: pantalla independiente y adaptable comprobada.
- A: control de acceso vigente del backend y bloqueo de roles ajenos comprobado.
- F: flujo funcional del alcance del módulo completo en pruebas aisladas;
  un directorio condicionado al vínculo puede cumplir F sin cumplir V.
- V: persistencia, ámbito y operación real del módulo certificados en entorno
  equivalente autorizado; pruebas con dobles no bastan. No certificado = 0.

| Módulo | P | A | F | V | Total /4 |
|---|---:|---:|---:|---:|---:|
| Dashboard | 1 | 1 | 1 | 0 | 3 |
| Usuarios EPS | 1 | 1 | 1 | 0 | 3 |
| Solicitudes | 1 | 1 | 1 | 0 | 3 |
| Inventario | 1 | 1 | 0 | 0 | 2 |
| Medicamentos | 1 | 1 | 1 | 0 | 3 |
| Entregas | 1 | 1 | 0 | 0 | 2 |
| Notificaciones | 1 | 1 | 0 | 0 | 2 |
| Chat | 1 | 1 | 1 | 0 | 3 |
| Perfil | 1 | 1 | 1 | 0 | 3 |

**24/36 = 66,7 % de evidencias de preparación**, no porcentaje de operación
real ni comparación numérica con una matriz anterior no disponible. F de
Entregas sigue pendiente de registro completo de entrega; Notificaciones
permanece desactivado. V queda sin certificar para todos: esta intervención
no prueba persistencia real y no sustituye esa evidencia por mocks. Este
denominador y estas reglas deben mantenerse en las próximas fases para que
el cambio sea comparable. Si aparece la matriz original, recalcular con sus
pesos y presentar ambas versiones por separado.

## Pruebas

| Verificación final | Resultado |
|---|---|
| Suite completa backend, preload de aislamiento y Edge | **557 aprobadas, 0 fallidas, 0 canceladas, 0 omitidas**, 172,70 s |
| Frontend `tests/*.test.mjs` | **6 aprobadas**, 0 fallidas |
| Astro check | 0 errores, 0 advertencias, 1 sugerencia previa de variable sin uso en `public/js/dashboard.js` |
| Astro build | 18 páginas compiladas |
| Prisma validate | Aprobado, con URL local inalcanzable; sin conexiones ni migraciones |
| `git diff --check` | Sin errores de espacios |

Regresión de cierre, ejecutada desde backend:

```text
node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs
```

Evidencia final: `integracion-farmacia-regresion-cierre.tap`. El preload sustituye
los clientes de aplicación y rechaza cualquier conexión inesperada. Las
escrituras y concurrencia de movimientos son exclusivamente de memoria.
Se incluyen las suites de los demás roles, las pantallas a 1440/820/390 px,
la retirada de filas/contadores ante errores del directorio, recuperación,
vínculos, filtros, privacidad, entregas y bloqueos de pagos simulados.

El incremento de 546 a 557 corresponde a nueve casos de dominio de movimientos,
uno del directorio de 50 afiliados y uno de no doble descuento al entregar.
El caso de navegador del directorio existente también se amplió. No se
omitieron ni retiraron pruebas para conseguir el resultado.

Pasadas previas conservadas para trazabilidad:

- `integracion-farmacia-regresion.tap`: 540 aprobadas, 16 fallidas y 1 cancelada.
  Hubo timeout del escenario administrativo móvil y pérdida de DevTools con
  fallos en cascada al agotarse el tiempo del bloque de navegador. No se
  modificó código administrativo; el escenario aprobó en ambas repeticiones.
- `integracion-farmacia-regresion-final.tap`: 556 aprobadas, 1 fallida. Únicamente
  la prueba del token de 1 segundo falló durante el handshake. Se corrigió su
  margen temporal, manteniendo expiración y Socket.IO reales.
- `integracion-socket-verificacion.tap`: los 3 casos Socket.IO aprobaron tras
  la corrección. La regresión completa posterior de 557 también la incluye.

Los navegadores se ejecutaron fuera del sandbox por los problemas de DevTools
ya comprobados en Fase 3, manteniendo datos y bases aislados. No se certifica
persistencia, restricciones o bloqueos PostgreSQL con este resultado.

Otros logs: `integracion-frontend.tap`, `integracion-astro-build.log` e
`integracion-astro-check.log`. No se detectaron regresiones funcionales en la
pasada final. Permanecen los bloqueos estructurales y de verificación real
descritos arriba, que impiden declarar el módulo o el rol completos al 100 %.
