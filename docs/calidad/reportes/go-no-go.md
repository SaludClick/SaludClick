# Evaluación Go/No-Go

**Fecha:** 2026-11-08 · **Versión:** 1.1.0
**Decisión:** **NO-GO publicación; rotación de credencial Neon pendiente de evidencia**

## Cierre de calidad

- Regresión backend ejecutada en este cierre: **267 aprobadas, 0 fallidas, 0 omitidas**.
- Cobertura de regresión completa de `backend/src/`: **98,37 % líneas, 90,63 % ramas y 95,07 % funciones**; las tres métricas superan la meta de 90 %.
- Integración PostgreSQL local: el usuario reporta ejecución desde PowerShell, **7 aprobadas, 0 fallidas, 0 omitidas**. No fue ejecutada ni inspeccionada por este agente porque su entorno no recibe `TEST_DATABASE_URL`.
- Cobertura de integración: **39,20 %**, métrica separada de la cobertura de regresión completa.
- SQLSTATE 42804 corregido: el `INSERT` de pagos ahora usa `TRUE` para `simulacion BOOLEAN`; no se alteró el tipo de la columna ni las migraciones.
- Auditorías npm backend/frontend: 0 vulnerabilidades reportadas.
- Astro check/build aprobados según la evidencia previa; 14 HTML en `dist`, sin colisiones; 2 hints.
- Edge headless: 31 subpruebas E2E y siete verificaciones de accesibilidad aprobadas usando API simulada.
- Detalle versionado: `cobertura-fasefinal.md`, EV-QUALITY-003, EV-POSTGRES-001 y EV-IDEMPOTENCIA-001.

## Evidencia favorable

- Suite Node: 267 pruebas aprobadas; 0 fallidas y 0 omitidas.
- EV-ACC-001–007: siete verificaciones repetidas y aprobadas en Edge headless dentro de `frontend.test.cjs`.
- Build Astro: aprobado; 14 páginas HTML presentes en `dist`, sin colisiones. `astro check`: 0 errores, 0 warnings y 2 hints.
- Prisma 7.10.1: esquema válido y cliente generado.
- Auditorías backend y frontend: 0 vulnerabilidades reportadas.
- Cobertura final de regresión de `backend/src/`: 98,37 % líneas, 90,63 % ramas y 95,07 % funciones. La cobertura de integración (39,20 %) se reporta aparte.
- Integración PostgreSQL real: 7/7 escenarios aprobados según resultados ejecutados por el usuario en PowerShell; el agente no los reprodujo.
- SQLSTATE 42804 corregido y protegido por prueba unitaria de regresión.
- No se usaron credenciales reales ni se conectó, migró o escribió en Neon/producción.

## Alcance y pendientes de despliegue

- La meta de cobertura está satisfecha. Las auditorías de dependencias previas reportaron 0 vulnerabilidades, pero no se repitieron en este cierre.
- Se reportó una credencial de Neon expuesta; no se encontró evidencia verificable de su rotación en el árbol ni en el historial Git local. La rotación y revocación quedan pendientes. No se conectó a Neon ni se intentó validar la credencial.
- La evidencia PostgreSQL corresponde a la ejecución del usuario en PowerShell y no fue reproducida por este agente; conservar su salida original y registrar su resultado en EV-POSTGRES-001.
- E2E de Edge y accesibilidad siguen cubriendo la API simulada; los 7 escenarios reales PostgreSQL reportados complementan esa validación.
- Build, auditorías y conexión PostgreSQL no se volvieron a ejecutar en esta fase.

## Condiciones para reconsiderar

1. Revocar y rotar la credencial de Neon expuesta y conservar evidencia segura del cambio; no incluir la nueva credencial en el repositorio.
2. Preservar el log original de PowerShell que acredita los 7/7 casos y la cobertura de integración de 39,20 %.
3. Repetir las comprobaciones de build, seguridad e integración requeridas por el proceso de despliegue.
4. No usar Neon ni datos reales para pruebas.

El objetivo de cobertura está **GO**. La publicación continúa **NO-GO** hasta verificar la rotación/revocación de la credencial reportada y completar las comprobaciones de despliegue pendientes.
