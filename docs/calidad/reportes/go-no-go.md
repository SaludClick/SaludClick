# Evaluación Go/No-Go

**Fecha:** 2026-11-08 · **Versión:** 1.1.0
**Decisión:** **NO-GO**

## Actualización Fase 4

- Regresión ejecutada: 238 aprobadas, 0 fallidas y 0 omitidas.
- Cobertura real de `backend/src/`: 92,45 % líneas, 81,97 % ramas y 81,56 % funciones; ramas y funciones no alcanzan la meta de 90 %.
- Auditorías npm backend/frontend: 0 vulnerabilidades reportadas.
- Astro check/build aprobados; 14 HTML en `dist`, sin colisiones; 2 hints.
- `TEST_DATABASE_URL` no está disponible. Se detuvieron las operaciones antes de consultar el contenedor/conectar/migrar.
- Edge headless: 31 subpruebas E2E y siete verificaciones de accesibilidad aprobadas usando API simulada.
- Detalle verificable: `validacion-fase4.md`, `cobertura-fasefinal.md` y las evidencias EV-QUALITY-003, EV-POSTGRES-001 y EV-IDEMPOTENCIA-001.

## Evidencia favorable

- Suite Node: 238 pruebas aprobadas; 0 fallidas y 0 omitidas.
- EV-ACC-001–007: siete verificaciones repetidas y aprobadas en Edge headless dentro de `frontend.test.cjs`.
- Build Astro: aprobado; 14 páginas HTML presentes en `dist`, sin colisiones. `astro check`: 0 errores, 0 warnings y 2 hints.
- Prisma 7.10.1: esquema válido y cliente generado.
- Auditorías backend y frontend: 0 vulnerabilidades reportadas.
- Cobertura de `backend/src/`: 92,45 % líneas, 81,97 % ramas y 81,56 % funciones. `order.repository.js`: 100 % líneas, 95 % ramas y 100 % funciones.
- No se usaron credenciales reales ni se conectó, migró o escribió en Neon/producción.

## Criterios aún incumplidos o bloqueados

- Ramas y funciones están por debajo de la meta de 90 %.
- La migración se revisó estáticamente, pero no se aplicó ni se probó en PostgreSQL. `TEST_DATABASE_URL` no está disponible y el destino/container no se verificaron.
- La integración de persistencia y el resultado de la migración para la base destino siguen pendientes de revisión y autorización.
- E2E de Edge y accesibilidad aprobaron contra API simulada; la aceptación de persistencia real sigue bloqueada.

## Condiciones para reconsiderar

1. Configurar `TEST_DATABASE_URL` localmente; comprobar que `DATABASE_URL` de Prisma se sustituya solo tras verificar el destino autorizado y loopback Docker.
2. Aplicar migraciones solo en la base aislada y ejecutar persistencia, reintentos, concurrencia, reinicio, rollback e inventario reales.
3. Ampliar pruebas significativas de ramas/funciones hasta la meta, sin excluir módulos ni alterar métricas.
4. Repetir regresión tras resolver los bloqueos; nunca usar Neon ni datos reales para estas pruebas.

Las evidencias actuales no autorizan despliegue ni migración. El estado continúa **NO-GO**.
