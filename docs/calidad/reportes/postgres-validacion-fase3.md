# Revisión de migración e infraestructura PostgreSQL — Fase 3

**Fecha:** 2026-11-07 · **Versión:** 1.0.0
**Estado:** revisión estática aprobada; validación en base bloqueada.

## Entorno comprobado

- `TEST_DATABASE_URL` no estaba definido en el proceso.
- No había archivos `backend/.env.test`, `backend/.env.test.local` ni manifiesto de PostgreSQL de pruebas.
- No se detectó un servicio PostgreSQL local. Docker está disponible, pero no se creó un contenedor ni una base sin autorización/configuración del usuario.
- No se leyó ni utilizó una URL de producción/Neon. No hubo conexiones, escrituras ni migraciones.

## Revisión estática

`backend/prisma/migrations/20261107215000_add_order_idempotency/migration.sql` agrega `idempotency_key UUID` y `idempotency_hash CHAR(64)` anulables a `solicitudes`, y crea un índice único compuesto por `usuario_id` y `idempotency_key`. Los tipos PostgreSQL y el nombre del índice corresponden al modelo `Solicitud` y su `@@unique` en `schema.prisma`. La nulabilidad permite que los pedidos anteriores sigan existiendo sin clave.

La migración requiere que la tabla y columna `solicitudes.usuario_id` ya existan. No contiene guardas para reaplicación manual; debe aplicarse una sola vez mediante el historial de Prisma en una base aislada cuyo esquema de partida haya sido verificado. La compatibilidad estática no prueba el esquema real, las restricciones ni la concurrencia.

## Resultado

`npx prisma validate` y `npx prisma generate` aprobaron sin conexión a la base, usando una URL local ficticia únicamente para satisfacer la configuración de Prisma. La migración **no fue ejecutada**. Replay persistente, reinicio del servidor, dos transacciones simultáneas, rollback PostgreSQL e inventario concurrente quedan **bloqueados** hasta disponer de una base de pruebas aislada y autorización explícita.
