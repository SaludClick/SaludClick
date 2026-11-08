# Validación de calidad — Fase 4

**Fecha:** 2026-11-08 · **Commit base:** `e33f2a6` · **Decisión:** **NO-GO**

## PostgreSQL y migraciones

La comprobación de `TEST_DATABASE_URL` en el entorno de procesos no encontró la variable. Se detuvieron las operaciones de base de datos antes de consultar el contenedor o abrir una conexión. No se intentó conectar a Neon ni a otra base, no se aplicaron migraciones y no se inspeccionaron tablas, relaciones o restricciones en un servidor PostgreSQL real.

`prisma.config.ts` usa `DATABASE_URL` para migraciones, no `TEST_DATABASE_URL`. Cuando la variable de pruebas esté disponible, el comando de migración deberá recibirla explícitamente como `DATABASE_URL` solo tras validar host, puerto, base y contenedor. La migración `20261107215000_add_order_idempotency` se revisó estáticamente: agrega dos columnas anulables (`UUID` y `CHAR(64)`) y un índice único compuesto por `usuario_id` e `idempotency_key`, consistente con `Solicitud` en `schema.prisma`. `npx prisma validate` aprobó sin conexión con una URL local ficticia; esto no acredita el esquema de una base destino.

## Pedidos e idempotencia

Las pruebas existentes verifican, con dobles, la creación transaccional, la persistencia esperada de pedido/detalle/pago, el descuento de inventario, la orden estable de bloqueos, replay sin descontar stock, conflicto de huella, stock insuficiente y rollback ante fallos.

No se ejecutaron pruebas reales de PostgreSQL. Persistencia entre procesos, reinicio del backend, solicitudes concurrentes, bloqueo/índice único y reversión real quedan **bloqueados**, no aprobados.

## Cobertura y regresión

| Métrica de `backend/src/` | Resultado | Meta |
|---|---:|---:|
| Líneas | 92,35 % | 90 % |
| Ramas | 81,63 % | 90 % |
| Funciones | 81,56 % | 90 % |

`backend> node --test --experimental-test-coverage --test-coverage-include="src/**/*.js" tests/*.test.cjs`: **238 aprobadas, 0 fallidas, 0 omitidas**. Incluye contratos API y 31 subpruebas de Edge headless. El backend de la prueba de navegador es simulado; no demuestra integración con PostgreSQL.

Una primera ejecución encontró una carrera en el test de checkout: esperaba las filas del carrito antes de terminar el render asíncrono. Se sincronizó el test con las cinco filas esperadas sin relajar la aserción. El E2E focalizado y la regresión final aprobaron. No se confirmó un defecto de aplicación.

## Seguridad

`npm audit` reportó **0 vulnerabilidades** en backend y frontend. La revisión estática acotada cubrió validación de JWT Bearer, autorización por rol, CORS y validadores. No se confirmó una vulnerabilidad en el código revisado; no se verificó la configuración en producción ni se ejecutaron pruebas dinámicas contra servicios externos.

## Frontend y accesibilidad

`frontend> npm run check`: **0 errores, 0 warnings y 2 hints**. `frontend> npm run build`: aprobado; `dist` contiene **14 archivos HTML** y el build no reportó colisiones. Astro generó dos páginas y copió las páginas estáticas restantes desde `public`. `npx prisma validate` y `npx prisma generate` aprobaron sin conexión.

No hay un runner E2E independiente, pero `backend/tests/frontend.test.cjs` ejecuta 31 subpruebas en Edge headless con servidor de API simulado. Las siete verificaciones EV-ACC-001–007 se reejecutaron y aprobaron dentro de esa suite. Esto no cubre backend/PostgreSQL desplegados.

## Go/No-Go

**NO-GO** para aceptación integral o despliegue. Condiciones pendientes: configurar `TEST_DATABASE_URL` en el entorno de pruebas, verificar el contenedor/destino, ejecutar allí la migración y las verificaciones de integridad/concurrencia/reinicio/rollback, y elevar ramas y funciones al 90 %. Ninguna prueba bloqueada se marca como aprobada.

Evidencias: `../evidencias/EV-QUALITY-003-regresion-fase4.txt`, `../evidencias/EV-POSTGRES-001-fasefinal.txt` y `../evidencias/EV-IDEMPOTENCIA-001-fasefinal.txt`. Cobertura detallada: `cobertura-fasefinal.md`.
