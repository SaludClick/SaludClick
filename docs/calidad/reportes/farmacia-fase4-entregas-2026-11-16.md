# Farmacia — Fase 4: entregas

Rama comprobada: `integracion/farmacia-pendientes`.
HEAD: `fafb09852f7ce7c8f097dd4e5f5f6ee6e7aa2a4a`.
Trabajo local sin commit, push, migraciones ni acceso a Neon.

## Auditoría previa y resultado

Se comprobaron rama, HEAD y `git status --short` antes de editar. El árbol ya
contenía cambios de fases anteriores, la migración EPS pendiente, auditorías,
respaldos y evidencias. No se restauraron archivos ni se aplicaron stash.
Se revisaron los informes de fases 1–3, continuación integrada y el código de
vinculación EPS. Usuarios conserva su consulta condicionada al vínculo;
Inventario conserva la consulta global informativa; Notificaciones sigue
desactivado por flag.

`Solicitud` tiene fecha de solicitud, estado, tipo de entrega, dirección,
observaciones, timestamps y claves idempotentes de CREACIÓN por usuario.
No tiene farmacia, establecimiento, responsable, receptor, fecha efectiva,
versión de entrega, firma ni relación con una autorización clínica. Sus estados
son PENDIENTE, APROBADA, PREPARANDO, LISTA, ENTREGADA y CANCELADA. La cola histórica
opera con los cuatro estados centrales. No existe un modelo de entrega ni
historial de transiciones. `updated_at` no acredita fecha efectiva de entrega.

`Pago` permite comprobar APROBADO y simulacion=false. Esto no constituye una
integración real con pasarela ni una conciliación de importes. `FormulaMedica`
no acredita validación clínica para cada detalle de solicitud. Medicamentos
con requisito true o desconocido deben seguir bloqueados.

Hallazgo: los endpoints de pedidos filtraban por estado, pero no por farmacia.
Por ello se cierra su lectura Y escritura después de verificar JWT y cuenta
activa con rol vigente 3. Responden 503 con código
`FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE`, sin consultar solicitudes, pagos,
medicamentos o destinatarios. No es una cola vacía exitosa ni un filtro real
por farmacia. No hay parámetro, flag o vínculo EPS que evite este cierre.
Dos cuentas Farmacia reciben el mismo bloqueo sin ver pedidos ajenos.

La corrección afecta también Solicitudes y los indicadores de pedidos del
Dashboard de FARMACIA, porque reutilizan estos endpoints. Es una reducción
intencional de acceso inseguro. No cambia rutas ni permisos de roles 1, 2 o 4.
La vinculación pendiente Farmacia 4 → EPS 1 no se activa ni se usa como permiso.

`order.repository.js` bloquea medicamentos con FOR UPDATE y descuenta stock al
crear el pedido. El avance histórico solo actualiza estado y timestamp; no
descuenta nuevamente. No se cambió ninguno de esos repositorios compartidos.
Persisten los riesgos previos de creación con pagos simulados y conciliación
del saldo; esta fase no certifica su resolución.

## Interfaz y endpoints

Se conserva `/pages/farmacia-entregas.html`, el menú independiente, filtros por
ID/estado y paginación preparados. No se habilitan consultas globales para que
estos controles aparenten funcionar. El aviso explica los bloqueos de
titularidad, responsables, historial, recepción y fecha efectiva.
Ante error se retiran filas, detalle, selección, diálogos y contadores anteriores;
se mantiene la opción de reintentar. No se capturan firmas, responsables ni
evidencias que no puedan guardarse. Diseño verificado a 1440, 820 y 390 px.

No se crean endpoints. Se protegen los existentes:

| Método y endpoint | Resultado actual tras autenticación vigente |
|---|---|
| GET `/api/farmacia/pedidos` | 503 estructural; sin datos globales |
| GET `/api/farmacia/pedidos/:id` | 503 estructural; sin detalle personal |
| PATCH `/api/farmacia/pedidos/:id/estado` | 503 estructural; sin escritura |

Se reutiliza `/api/farmacia/verificar-acceso` antes de iniciar la pantalla.

## Dominio preparado: no operativo

`farmacia-entregas.service.js` no tiene adaptador persistente, conexión ni ruta.
Su instancia por defecto rechaza el registro con 503. Los nombres del contrato
de adaptador son operaciones de dominio propuestas, NO tablas ni columnas reales.
Los tests proporcionan exclusivamente un adaptador con mutex y rollback en memoria.

La preparación incluye:

- Avance consecutivo APROBADA → PREPARANDO → LISTA → ENTREGADA.
- Actor obtenido por servidor, nunca aceptado del cuerpo; fecha del servidor.
- Autorización de cuenta vigente, titularidad y permiso dentro de transacción.
- Clave UUID v4 y huella canónica; reintento idéntico retorna el evento existente;
  misma clave con contenido distinto produce 409. Reautorizar incluso reintentos.
- Estado esperado y versión; compare-and-swap con exactamente una fila modificada.
- Pago aprobado no simulado, detalles no vacíos y fórmula conocida como false.
- Recepción declarada obligatoria al entregar, observaciones limitadas a 500
  caracteres y rechazo de campos de fecha, actor o firma enviados por cliente.
- Estado y evento auditable atómicos; si la auditoría falla se revierte el estado.
- Ninguna operación de saldo ni stock en el contrato.

El actor del evento acredita quién registra la transición; NO permite asignar
otro preparador o transportista. La recepción es una declaración textual; NO
certifica identidad del receptor ni firma. Todo sigue preparado, sin registro real.

Contrato obligatorio para un futuro adaptador autorizado:

1. Derivar el establecimiento/ámbito del servidor; acreditar relación individual
   pedido–farmacia y permiso de cada transición, no inferirlos desde EPS.
2. Bloquear el ámbito idempotente antes de consultar clave o pedido; el índice
   único debe incluir el ámbito definido. Nunca buscar claves globalmente.
3. Bloquear pedido y condiciones de autorización, pago y requisito clínico para
   impedir cambios entre comprobación y actualización. Definir aislamiento y
   política de reintentos de serialización. El doble en memoria no prueba SQL.
4. Persistir versión, evento inmutable, actor, estados anterior/nuevo, fecha,
   recepción, observaciones, clave y huella en la misma transacción. Restringir
   modificaciones y definir retención/minimización; no reutilizar auditoría de
   pacientes autorizados o administrativa sin una política autorizada.
5. Obtener aprobación del esquema y de la política de evidencias. No guardar
   historial en observaciones, logs o localStorage como sustituto de persistencia.

## Archivos de esta fase

Nuevos:

- `backend/src/middlewares/farmacia-pedidos-scope.middleware.js`
- `backend/src/services/farmacia-entregas.service.js`
- `backend/tests/farmacia-entregas.test.cjs`
- Este informe y logs/TAP `fase4-*`.

Modificados incrementalmente, conservando cambios locales anteriores:

- `backend/src/routes/farmacia.routes.js`
- `backend/tests/farmacia-api.test.cjs`
- `backend/tests/farmacia-solicitudes.test.cjs`
- `backend/tests/farmacia-pages.test.cjs`
- `backend/tests/support/farmacia-panel-browser.cjs`
- `frontend/public/js/farmacia-solicitudes.js`
- `frontend/src/pages/pages/farmacia-entregas.astro`

Los contratos históricos se conservan en fixtures explícitas que montan
controladores antes del router real. NO representan rutas habilitadas ni
simulan titularidad real. `farmacia-entregas.test.cjs` importa la aplicación
real y verifica el cierre sin sustituir el middleware de ámbito.

## Cumplimiento de Entregas

Un punto solo por requisito completamente satisfecho del encargo; parciales,
preparados y bloqueados puntúan cero. La excepción de diseño del requisito 7
es literal al encargo: no equivale a historial operativo.

| # | Requisito | Puntos | Evidencia o bloqueo |
|---|---|---:|---|
| 1 | Pantalla independiente | 1 | Ruta y menú conservados |
| 2 | Únicamente entregas autorizadas | 1 | Cierre backend, sin cola global; no implica consulta operativa |
| 3 | Búsqueda, filtros y paginación | 0 | Contrato/interfaz preparados; lectura bloqueada |
| 4 | Estado actual y fechas verificables | 0 | Falta acceso autorizado y fecha efectiva |
| 5 | Detalle mínimo autorizado | 0 | No existe titularidad individual |
| 6 | Responsables con autorización | 0 | No hay persistencia/asignación autorizada |
| 7 | Diseñar historial auditable | 1 | Contrato transaccional y pruebas aisladas |
| 8 | Evidencia de entrega | 0 | Declaración preparada; sin persistencia real |
| 9 | Validar transiciones | 0 | Política probada; operaciones reales bloqueadas |
| 10 | Duplicados y concurrencia | 0 | Memoria y CAS histórico; sin garantía persistente por ámbito |
| 11 | Interfaz adaptable | 1 | Navegador en ordenador, tableta y móvil |

**4/11 = 36,4 % del encargo.** No es un porcentaje de entregas operativas.
Inventario conserva su matriz específica: **7/11 = 63,6 %**.

## Matriz general de FARMACIA

No existe denominador histórico uniforme para todo el rol. Se establece una
base conservadora nueva: nueve módulos con peso igual; un módulo cuenta como
completo solo si su flujo principal funciona con autorización verificable y
sin bloqueos estructurales conocidos. La interfaz preparada no cuenta como
módulo terminado. Esta matriz no promedia porcentajes de encargos diferentes
ni es comparable con una cifra anterior que no tenga estos mismos criterios.

| Módulo | Completo (0/1) | Estado y condición pendiente |
|---|---:|---|
| Dashboard | 0 | Catálogo visible; resumen de pedidos bloqueado por ámbito |
| Usuarios | 0 | Directorio condicionado a esquema y vínculo EPS real pendiente |
| Solicitudes | 0 | Contratos preparados; lectura/escritura global cerrada |
| Inventario | 0 | 7/11; saldo propio y movimientos persistentes pendientes |
| Medicamentos | 1 | Consulta informativa global, búsqueda, filtros y detalle; no inventario propio |
| Entregas | 0 | 4/11; titularidad, historial, responsables y evidencia pendientes |
| Notificaciones | 0 | Desactivadas; no se habilitan en esta fase |
| Chat | 0 | Flujo implementado con participantes; pendiente auditoría integral del ámbito de asignación al establecimiento |
| Perfil | 1 | Lectura/edición limitada de datos propios con validación de sesión vigente |

**2/9 = 22,2 % de módulos completos bajo esta matriz conservadora nueva.**
Es una evaluación del código y bloqueos conocidos, no certificación de
operación real en Neon. No implica que el resto del trabajo no exista.
El Chat se deja pendiente conservadoramente porque esta fase no acredita su
ciclo completo de asignación a una farmacia; no se modifica su comportamiento.

## Próximos pasos para el 100 %

1. Acordar y autorizar titularidad individual de pedidos, establecimiento y
   permisos. Activar EPS–Farmacia solo mediante otro trabajo autorizado;
   ese vínculo por sí solo no resuelve titularidad de pedidos.
2. Aprobar esquema de eventos, versión, responsables y evidencia; implementar
   adaptador transaccional y restricciones únicas. Migrar en fase autorizada.
3. Integrar pagos reales conciliados y validación clínica autorizada por detalle.
4. Sustituir el cierre por consultas mínimas con ámbito en TODAS las consultas,
   contadores, detalles y escrituras. No retirar el cierre antes de demostrarlo.
5. Conectar responsable y evidencia a la interfaz; diferenciar fechas de solicitud,
   actualización y entrega efectiva. No inferir datos históricos no registrados.
6. Probar PostgreSQL aislado real: carreras, reintentos, rollback, revocación,
   autorización cruzada y ausencia de segundo descuento. Después, repetir regresión.
7. Resolver por separado Usuarios/vínculo, inventario propio y movimientos,
   asignación de chat y activación autorizada de Notificaciones. Actualizar las
   matrices con el mismo denominador; conservar evidencias de cada fase.

## Verificación

| Comprobación | Resultado |
|---|---|
| Suite completa backend final, secuencial, BD aislada y Edge | **564 aprobadas, 0 fallidas, 0 canceladas, 0 omitidas; 171,36 s** |
| Frontend `node --test tests/*.test.mjs` | 6 aprobadas, 0 fallidas |
| Astro build final | 18 páginas compiladas |
| Astro check final | 0 errores, 0 advertencias, 1 sugerencia previa en `dashboard.js` |
| Prisma validate | Esquema válido, URL local inalcanzable; sin conexión ni migración |
| `git diff --check` | Sin errores de espacios; avisos de conversión LF/CRLF en archivos locales |

Las ejecuciones fallidas se conservan; no se eliminan ni se presentan como
aprobadas. `fase4-dirigidas.tap` registró 17 aprobadas y 2 fallidas: falta de ruta
de Notificaciones en la fixture inicial y fallo DevTools del sandbox. Se añadió
el app real como fallback de la fixture y se ejecutó Edge fuera del sandbox.
`fase4-regresion-final.tap`: 554 aprobadas, 10 fallidas. Se corrigieron las
fixtures históricas y sus aserciones sobre datos anteriores, sin reabrir rutas.
`fase4-regresion-cierre.tap`: 563 aprobadas y 1 fallida; quedaba una expectativa
antigua de conservar el contador 18 tras un error. Se sustituyó por la comprobación
de retirada del contador y de filas, manteniendo la prueba de recuperación.

La suite completa se ejecuta desde backend, con preload que rechaza conexiones
inesperadas y dobles de BD; no certifica persistencia PostgreSQL real:

```text
node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs
```

Incluye regresión de roles 1, 2 y 4, búsqueda, filtros, paginación, estados,
JWT expirado, roles distintos, cuenta inactiva, ambas farmacias sin ámbito,
pagos simulados, fórmula requerida/desconocida, reintentos y concurrencia,
rollback de auditoría y ausencia de doble descuento en contratos aislados.
La aplicación real bloquea lectura y escritura; las pruebas de transición
exitosa son del dominio preparado, no de una entrega real.

Logs de frontend: `fase4-frontend.tap`, `fase4-astro-build-final.log` y
`fase4-astro-check-final.log`. Rama y HEAD se volvieron a comprobar sin cambios.

Resultado final de la suite completa: `fase4-regresion-verificada.tap`.
El incremento de 557 a 564 son siete casos nuevos de Entregas con múltiples
aserciones cada uno; también se amplían los escenarios existentes de navegador.
No se retiraron casos ni se omitieron pruebas. No se detectaron regresiones en
la pasada final, dentro del alcance aislado descrito.
