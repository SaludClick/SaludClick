# Evaluación Go/No-Go

**Fecha:** 2026-11-07 · **Versión:** 1.0.0
**Decisión:** **NO-GO**

## Evidencia favorable

- `npm test`: 225 pruebas aprobadas; 0 fallidas y 0 omitidas.
- EV-ACC-001–007: siete verificaciones automatizadas aprobadas en Edge headless.
- Build Astro: aprobado; 14 páginas HTML presentes en `dist`, sin colisiones. `astro check`: 0 errores, 0 warnings y 2 hints.
- Prisma 7.10.1: esquema válido y cliente generado.
- Auditorías backend y frontend: 0 vulnerabilidades reportadas.
- Cobertura de `backend/src/`: 89,75 % líneas, 80,27 % ramas y 78,72 % funciones. `order.repository.js`: 100 % líneas, 95 % ramas y 100 % funciones.
- No se usaron credenciales reales ni se conectó, migró o escribió en Neon/producción.

## Criterios aún incumplidos o bloqueados

- La cobertura aspiracional de 100 % no se alcanza; ramas y funciones están por debajo de ese objetivo.
- La migración se revisó estáticamente, pero no se aplicó ni se probó en PostgreSQL. No existe configuración de base de pruebas aislada autorizada en este entorno.
- La integración de persistencia y el resultado de la migración para la base destino siguen pendientes de revisión y autorización.
- La meta aspiracional de 100 % de cobertura no se alcanza; ramas y funciones críticas aún tienen condiciones sin ejecutar.

## Condiciones para reconsiderar

1. Configurar y autorizar un PostgreSQL de pruebas aislado; aplicar allí la migración y comprobar reintentos concurrentes, rollback y consistencia del stock.
2. Repetir pruebas de aceptación de frontend/backend con base PostgreSQL aislada; no usar Neon ni datos reales.
3. Continuar ampliando cobertura real, especialmente servicios/controladores y ramas; no excluir módulos para elevar el porcentaje.
4. Continuar cubriendo módulos de administración/chat y ramas restantes; reevaluar los dos hints informativos de Astro.

Las evidencias actuales no autorizan despliegue ni migración. El estado continúa **NO-GO**.
