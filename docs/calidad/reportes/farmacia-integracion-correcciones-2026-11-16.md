# Correcciones para integrar Farmacia en main

## Alcance y conservación

Base de Farmacia: `fafb09852f7ce7c8f097dd4e5f5f6ee6e7aa2a4a`.
Main remoto al iniciar: `461d052ff6c0573c8cbb5c68aea65f4be137d772`.
Se conserva intacto el worktree `farmacia-main-validacion-20261116`, con su
merge pendiente y 43 archivos en staging. Hay una copia binaria de su diff
en `.integration-worktrees/merge-original-43-preservado.patch`.

Los avances locales de Farmacia se revisan y confirman explícitamente en
`integracion/farmacia-pendientes`, excluyendo auditorías de Administrador,
archivos temporales, TAP locales y cambios globales de estilos de Inicio/Login.
Las rutas nuevas de administración EPS–Farmacia conservan `requireAdmin` y
no cambian las rutas existentes ni se invocan para crear un vínculo real.
La extracción del formulario de perfil conserva su URL y contrato compartidos.

## Causas y correcciones

### Pedidos sin titularidad

`Solicitud` no contiene relación verificable con farmacia o establecimiento.
El filtro anterior por estado/ID era una cola global. Se añade
`requirePedidoScope` después de JWT y cuenta vigente a listado, detalle y
transición de pedidos. Responde 503 con
`FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE`, sin consultar ni escribir pedidos.
No hay bypass por query, flag o vínculo EPS. El frontend retira datos anteriores
si una consulta falla. Este cierre afecta también el resumen de solicitudes del
Dashboard de Farmacia; no debe interpretarse como una cola vacía exitosa.

### Cuenta inactiva y sesiones antiguas

`verificar-acceso` ahora pasa por `requireFarmaciaVigente`: verifica JWT con
expiración y consulta el usuario actual, exigiendo `rol_id=3` y `estado=ACTIVO`.
Inactivos, bloqueados, cuentas eliminadas, rol cambiado o consulta fallida se
rechazan. Chat y perfil revalidan Farmacia sin cambiar contratos de otros roles;
Socket.IO revalida participantes y sesiones de Farmacia antes de eventos y
entregas, y desconecta sesiones revocadas/expiradas.

### 503 del Dashboard en contratos publicados

La fixture de `api-contracts.test.cjs` no suministraba `usuario.findUnique`
después de introducir la verificación de cuenta vigente. El preload rechazaba
correctamente esa consulta y el middleware devolvía 503. Se suministra una
cuenta sintética activa en la fixture; se conserva la expectativa legítima 200.
También se declara stock positivo explícito en el medicamento disponible.
No se convierte un fallo de autorización en una respuesta exitosa.

Se añaden casos de Dashboard con cuenta inactiva, rol cambiado, autenticación
no disponible (503) y catálogo no disponible (500 sin estadísticas ficticias).
El conteo de disponible exige estado DISPONIBLE y stock mayor que cero.

## Avances incorporados y límites

Incluye el directorio mínimo de pacientes condicionado a EPS vinculada y vigente,
consulta informativa global de catálogo/inventario, aviso de saldo bajo orientativo,
nueve pantallas independientes, chat, perfil y pruebas de las fases anteriores.
No se certifica inventario propio a partir del saldo global.

Entregas y movimientos contienen dominio preparado con pruebas aisladas, sin
adaptador persistente ni rutas nuevas de escritura. No se presentan como módulos
terminados. Las rutas históricas de pedidos están cerradas en la aplicación real;
las fixtures que ejercitan sus controladores históricos se identifican como
contratos preparados y no como autorización real de operación.

La migración EPS se incorpora solo como propuesta revisada; no se ejecuta.
No se activa Notificaciones, no se escribe en Neon, no se crea la vinculación
Farmacia 4–EPS VidaPlena 1 y no se modifican datos de pacientes.

## Validación y publicación

Verificación dirigida inicial: **117 pruebas aprobadas, 0 fallidas**, con mocks
de BD y JWT exclusivamente sintéticos de prueba; no se crean sesiones reales
de Administrador. La suite completa y auditoría adicional deben ejecutarse
sobre el commit exacto de Farmacia y nuevamente sobre el merge exacto antes
de publicar main. La migración no forma parte de esas ejecuciones.

```text
node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs
node --test tests/*.test.mjs
npm run check
npm run build
npx --no-install prisma validate
```

Prisma validate usa una URL local inalcanzable. Las pruebas completas usan el
preload que impide conexiones inesperadas. La auditoría externa se conserva
fuera de los commits y se dirige al worktree que se esté validando.

Publicación sujeta a todas las pruebas aprobadas, revisión de los cambios
seleccionados, ausencia de secretos y respeto de las protecciones de GitHub.
El informe final de la sesión identifica SHA, resultados y estado del remoto.
