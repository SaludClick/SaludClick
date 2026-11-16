# Farmacia — Fase 3: inventario

Rama: `integracion/farmacia-pendientes`. Cambios locales; sin commit ni push.

## Auditoría y resultado

El esquema real contiene `Medicamento.stock`, estado y categoría. No contiene
titularidad de inventario, establecimiento, movimientos, mínimos, lotes ni
vencimientos. La asociación cuenta Farmacia–EPS preparada anteriormente no
demuestra propiedad del saldo global. No se consultó Neon durante esta fase.

Se conserva la consulta autenticada del catálogo global, búsqueda, filtros,
paginación y detalle. No se presenta ese saldo como inventario propio ni como
conteo físico. La API declara alcance global, titularidad no verificada y
movimientos deshabilitados. No acepta `farmacia_id` para aparentar aislamiento.

Se añaden filtro `disponibilidad=bajos`, conteo global y avisos en listado y
detalle. Bajo significa estado DISPONIBLE y saldo entre 1 y 5 inclusive.
El umbral 5 es una convención visual explícita, no un mínimo persistido,
aprobado por el negocio o específico de un medicamento. Los bajos forman
parte de los disponibles; no deben sumarse ambas cifras. Los indicadores
son globales e independientes de los filtros, dentro de RepeatableRead.
Inactivos, desconocidos e inconsistencias no generan este aviso. Los errores
retiran el aviso anterior y muestran que no está disponible. No se activa
Notificaciones. El filtro se conserva al recargar.

JWT con expiración, cuenta activa y rol vigente 3 siguen protegidos por los
middlewares existentes. Las consultas usan selecciones explícitas sin datos
clínicos, credenciales, contactos ni pagos. No se agregan rutas de escritura.

## Stock y movimientos bloqueados

`order.repository.js` bloquea cada medicamento con `SELECT ... FOR UPDATE`,
comprueba saldo y descuenta al crear la solicitud, dentro de la transacción.
`farmacia.repository.js::avanzarPedido` actualiza únicamente estado y fecha;
no vuelve a descontar stock. Conserva actualización condicionada al estado
anterior, pago aprobado no simulado y requisito de fórmula conocido como falso.
No se modifica el flujo compartido de pedidos ni sus interfaces o permisos.

Persisten riesgos anteriores: pago simulado puede afectar el saldo al crear
el pedido, eliminación sin reposición y falta de CHECK global de saldo.
Las lecturas no corrigen esos registros ni garantizan integridad de escritores
externos. No se certifica dispensación real por este trabajo.

Entradas, salidas y ajustes quedan diseñados y bloqueados, sin formulario que
aparente guardar: falta titularidad verificable e historial transaccional.
Antes de implementarlos se requiere:

1. Relación cuenta–establecimiento–inventario autorizada por servidor.
2. Movimiento persistente con actor obtenido del JWT vigente, fecha del servidor,
   tipo, cantidad entera positiva, motivo obligatorio, saldos anterior/final,
   referencia y clave idempotente única por ámbito; nunca actor/fecha del cliente.
3. Una transacción que revalide permisos, bloquee saldo, compruebe saldo final
   no negativo y escriba saldo e historial juntos. Reintento idéntico devuelve
   el movimiento existente; misma clave con otro contenido produce conflicto.
4. Ajustes como delta trazable con aprobación definida; correcciones mediante
   contramovimiento. Conciliar reservas y descuento existente antes de salidas.
5. Integración de lotes y vencimientos con políticas aprobadas, sin inventar
   campos actuales ni reutilizar el registro sanitario como lote.

No se crean modelos, migraciones, SQL ni repositorios de escritura ficticios.
Las pruebas usan dobles en memoria; no certifican persistencia PostgreSQL.

## Archivos de esta fase

- `backend/src/config/farmacia-inventario.js` (nuevo umbral visual).
- `backend/src/repositories/farmacia-existencias.repository.js`.
- `backend/src/services/farmacia-existencias.service.js`.
- `backend/src/validators/farmacia-existencias.validator.js`.
- `backend/tests/farmacia-existencias.test.cjs`.
- `frontend/src/components/FarmaciaExistencias.astro`.
- `frontend/public/js/farmacia-existencias.js`.
- `frontend/public/js/farmacia-context.js`.
- Este informe y evidencias TAP en la raíz.

El componente compartido también muestra las advertencias en Medicamentos,
exclusivamente dentro de Farmacia. No cambia el alcance funcional de otros roles.
Se conservan todos los cambios previos, archivos de auditoría y migración
pendiente de la asociación EPS, que no se ejecuta ni modifica.

## Criterios verificables de Inventario

Evaluación conservadora de los once requisitos del encargo: un punto por
requisito satisfecho completamente, cero para parciales o bloqueados. Es una
matriz nueva explícita, no una sustitución silenciosa de una auditoría anterior.

| Requisito | Puntos | Evidencia o bloqueo |
|---|---:|---|
| 1. Inventario autorizado propio | 0 | Solo saldo global; falta titularidad |
| 2. Buscar y filtrar | 1 | API y navegador |
| 3. Disponible, agotado y bajo | 1 | Clasificación y límites |
| 4. Alertas bajas | 1 | Avisos visuales orientativos; mínimos por medicamento pendientes |
| 5. Movimientos cuando el esquema permita | 0 | Diseño preparado; escritura bloqueada |
| 6. Responsable, fecha, tipo, cantidad y motivo | 0 | No hay historial persistente |
| 7. Negativos y duplicados | 0 | Sin escritores nuevos, pero falta garantía global de BD |
| 8. Evitar segundo descuento | 1 | Flujo auditado y regresión existente |
| 9. Revisar lotes y vencimientos | 1 | Esquema inspeccionado; sin migraciones |
| 10. Pantalla independiente | 1 | Ruta y menú conservados |
| 11. Adaptable | 1 | Pruebas de navegador a 1440/820/390 px |

Resultado: **7/11 = 63,6 % de cumplimiento del encargo**, condicionado a las
verificaciones finales registradas abajo. No significa 63,6 % de inventario
físico operativo. Consulta de saldos propios y movimientos reales siguen bloqueados.

No se encontró una matriz anterior de avance general FARMACIA con criterios,
pesos y denominador en los informes locales ni en `AUDITORIA_PROFESIONAL.md`.
Se solicitó su referencia. No es posible recalcular un porcentaje comparable
sin inventarla. Se mantiene el alcance anterior de los demás módulos; el delta
de esta fase es stock bajo orientativo y declaración explícita del alcance global.

## Verificación

| Verificación | Resultado |
|---|---|
| Regresión completa con aislamiento de BD, secuencial y Edge | 546 aprobadas, 0 fallidas, 0 omitidas; 381,39 s |
| Frontend `.test.mjs` | 6 aprobadas, 0 fallidas |
| Astro build final | 18 páginas compiladas |
| Astro check final | 0 errores, 0 advertencias, 1 sugerencia previa en `dashboard.js` |
| Prisma validate con URL local inalcanzable | Aprobado; no abre conexión ni migra |
| `git diff --check` | Sin errores de espacios |

La regresión final está en `fase3-regresion-final.tap`. Incluye Administrador,
Paciente y EPS, seguridad de Farmacia, movimientos de solicitudes, perfil,
chat, búsqueda, filtros, detalle y diseño adaptable. Inventario prueba ahora
stock bajo en navegador, aviso y persistencia al recargar, además de límites,
estados excluidos, filtros combinados y rechazo de parámetros de ámbito.
El contador anterior de 545 sube a 546 por un caso nuevo de API con múltiples
aserciones; el escenario de navegador existente también fue ampliado.

La primera ejecución (`fase3-tests.tap`) falló al iniciar DevTools dentro del
sandbox. Se repitió fuera del sandbox conservando el preload de aislamiento:
`node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs`.
El resultado de 546 corresponde a esa repetición completa, sin omitir casos.
Los logs finales de Astro están en `fase3-astro-build.log` y
`fase3-astro-check.log`. No se detectaron regresiones en las pruebas ejecutadas.
Persistencia y concurrencia con PostgreSQL real no fueron ensayadas; los dobles
de prueba bloquean accesos inesperados a las conexiones reales.
