# Validación del runner de integración PostgreSQL

**Fecha:** 2026-11-08 · **Commit base:** `126f5a5` · **Decisión:** **NO-GO publicación**

## Runner implementado

Se agregó `backend/tests/postgres.integration.cjs`, basado en el runner existente de Node.js `node:test`, con el comando `npm run test:integration:postgres`. Incluye siete escenarios reales: persistencia, replay/conflicto idempotente, concurrencia de la misma clave, competencia por inventario, pedido de varios medicamentos, rollback por conflicto único de pago y recuperación mediante dos procesos HTTP del backend.

Antes de importar la configuración de base de datos o escribir, `tests/support/postgres-test-safety.cjs` exige `TEST_DATABASE_URL` con protocolo PostgreSQL, host `127.0.0.1`, puerto `55432`, base `saludclick_test` y autenticación. La conexión efectiva comprueba `current_database()` y el esquema `public`, además de verificar las cuatro migraciones requeridas en `_prisma_migrations`. El runner no invoca `migrate deploy`. Solo después de validar el destino asigna esa URL al nombre `DATABASE_URL` que espera la configuración existente; no modifica `backend/.env`.

Los fixtures crean roles, categorías, usuarios y medicamentos únicos. La limpieza usa exclusivamente los IDs insertados por cada fixture y borra sus pedidos, detalles y pagos en una transacción. No borra filas preexistentes ni cambia tablas o migraciones.

## Verificaciones ejecutadas en este entorno

- Instalación limpia (`npm ci`): **aprobada**. `postinstall` genera Prisma Client con una URL local reservada solo para generación; no conecta a PostgreSQL ni ejecuta migraciones. `package-lock.json` coincide con las dependencias del manifiesto; los scripts no se almacenan en el lockfile.
- Ejecución de `npm run test:integration:postgres`: el script se inicia y su preflight se detiene de forma segura porque `TEST_DATABASE_URL` **no está disponible** en este ejecutor. No se conectó ni se escribieron datos desde aquí.
- Integración PostgreSQL: el usuario informa que ejecutó la suite desde PowerShell contra la base local; resultado reportado: **7 aprobadas, 0 fallidas, 0 omitidas**, duración aproximada de 5 s. Este agente no reprodujo la conexión ni la suite.
- Sintaxis del runner, worker y helpers: **aprobada**.
- Regresión backend después de la instalación limpia: **267 aprobadas, 0 fallidas, 0 omitidas**.
- Cobertura de integración PostgreSQL: **39,20 %** (resultado informado por el usuario).
- Cobertura de regresión completa: **98,37 % líneas, 90,63 % ramas, 95,07 % funciones**.

Los porcentajes de cobertura corresponden a ejecuciones distintas y no deben combinarse: 39,20 % para la suite de integración (resultado del usuario) y las métricas indicadas para la regresión completa (ejecutada por el agente). La aplicación previa de las cuatro migraciones también fue informada por el usuario; este ejecutor no inspeccionó los logs ni consultó la base.

## Incidencia del reinicio: SQLSTATE 42804

Se confirmó el error `column "simulacion" is of type boolean but expression is of type integer`: el `INSERT INTO pagos` en `backend/src/repositories/order.repository.js` enviaba el literal entero `1` a la columna `simulacion BOOLEAN`. Se cambió a `TRUE`, sin modificar el esquema ni las migraciones, y se agregó una aserción en `order-repository-idempotency.test.cjs` que exige el literal booleano en el SQL generado.

La búsqueda encontró una sola escritura de `simulacion` y una sola columna booleana en el modelo Prisma; no se encontró otro entero asignado a una columna booleana. La causa del 500 queda corregida en el origen. Según los resultados informados, la suite real pasó después de la corrección, incluyendo HTTP 201 y persistencia tras reiniciar el backend.

El worker también conserva el diagnóstico sanitizado del controlador si vuelve a producirse un 500. No se repitieron desde este ejecutor la conexión PostgreSQL, la consulta del historial de migraciones, las transacciones ni el stock real.

## Estado antes de publicar

La verificación de integración PostgreSQL se considera aprobada según el resultado comunicado por el usuario, no reproducido por este agente. La meta de cobertura está satisfecha. La publicación global permanece **NO-GO** porque no se encontró evidencia verificable de rotación o revocación de la credencial de Neon reportada como expuesta, y porque las comprobaciones integrales de despliegue no se repitieron. No se conectó a Neon.
