# Validación de calidad — Fase 4

**Fecha:** 2026-11-08 · **Commit base:** `70061b5` · **Decisión:** **NO-GO**

## PostgreSQL y migraciones

La comprobación inicial encontró `TEST_DATABASE_URL` sin configurar. Aunque el CLI de Docker está disponible, el daemon local no responde. No se intentó conectar a Neon ni a otra base, no se aplicaron migraciones y no se inspeccionaron tablas, relaciones o restricciones en un servidor PostgreSQL real.

La migración `20261107215000_add_order_idempotency` se revisó estáticamente: agrega dos columnas anulables (`UUID` y `CHAR(64)`) y un índice único compuesto por `usuario_id` e `idempotency_key`, consistente con `Solicitud` en `schema.prisma`. `npx prisma validate` aprobó sin conexión con una URL local ficticia; esto no acredita el esquema de una base destino.

## Pedidos e idempotencia

Las pruebas existentes verifican, con dobles, la creación transaccional, la persistencia esperada de pedido/detalle/pago, el descuento de inventario, la orden estable de bloqueos, replay sin descontar stock, conflicto de huella, stock insuficiente y rollback ante fallos.

No se ejecutaron pruebas reales de PostgreSQL. Persistencia entre procesos, reinicio del backend, solicitudes concurrentes, bloqueo/índice único y reversión real quedan **bloqueados**, no aprobados.

## Cobertura y regresión

| Métrica de `backend/src/` | Resultado | Meta |
|---|---:|---:|
| Líneas | 89,75 % | 90 % |
| Ramas | 80,27 % | 90 % |
| Funciones | 78,72 % | 90 % |

`backend> npm test`: **225 aprobadas, 0 fallidas, 0 omitidas**. La suite contiene pruebas unitarias, de contrato/API y frontend con dobles; no demuestra integración real con PostgreSQL. No se confirmaron defectos funcionales en las pruebas ejecutadas. La meta de cobertura no se alcanzó.

## Seguridad

`npm audit` reportó **0 vulnerabilidades** en backend y frontend. La revisión estática acotada cubrió validación de JWT Bearer, autorización por rol, CORS y validadores. No se confirmó una vulnerabilidad en el código revisado; no se verificó la configuración en producción ni se ejecutaron pruebas dinámicas contra servicios externos.

## Frontend y accesibilidad

`frontend> npm run check`: **0 errores, 0 warnings y 2 hints**. `frontend> npm run build`: aprobado; `dist` contiene **14 archivos HTML** y el build no reportó colisiones. Astro generó dos páginas y copió las páginas estáticas restantes desde `public`.

Los manifiestos revisados no definen un runner E2E independiente. Las pruebas frontend dentro de `npm test` sí se ejecutaron, pero no se reportan como E2E de navegador. Las evidencias de accesibilidad `EV-ACC-001`–`EV-ACC-007` son de la fase anterior y no se reejecutaron; la accesibilidad de esta fase queda **no ejecutada**.

## Go/No-Go

**NO-GO** para aceptación integral o despliegue. Condiciones pendientes: habilitar un PostgreSQL de pruebas aislado y accesible, ejecutar allí la migración y las verificaciones de integridad/concurrencia/reinicio/rollback, repetir la regresión afectada y alcanzar la meta acordada de cobertura. Ninguna prueba bloqueada se marca como aprobada.

La evidencia de ejecución resumida está en `../evidencias/EV-QUALITY-003-regresion-fase4.txt`.
