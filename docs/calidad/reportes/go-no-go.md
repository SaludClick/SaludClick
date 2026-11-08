# Evaluación Go/No-Go

**Fecha:** 2026-11-07 · **Versión:** 1.0.0
**Decisión:** **NO-GO**

## Evidencia favorable

- 175 pruebas ejecutadas, 175 aprobadas y ninguna fallida u omitida en la regresión.
- Siete controles de accesibilidad en Edge headless aprobados; evidencias EV-ACC-001–007.
- Build de Astro aprobado; `astro check`: cero errores, cero warnings y dos hints.
- `npx prisma validate`: esquema PostgreSQL válido.
- Sin credenciales reales; no hubo acceso, migración ni escritura a Neon/producción.

## Criterios aún incumplidos

- Cobertura de sentencias: **77.50 %**, inferior al umbral propuesto de 80 %.
- `npm audit` frontend: **1 vulnerabilidad crítica**, 3 altas y 1 baja.
- `npm audit` backend: 4 altas y 2 moderadas.
- Sin prueba transaccional de aceptación contra PostgreSQL aislado.
- La interfaz bloquea el doble clic, pero no hay garantía persistente backend contra reintentos o solicitudes repetidas.

## Condiciones para reconsiderar

1. Resolver el hallazgo crítico de Astro mediante actualización mayor revisada y repetir build/regresión/audit.
2. Evaluar las actualizaciones mayores restantes de dependencias y volver a ejecutar ambos audits.
3. Llevar cobertura medida a 80 % o documentar una exclusión aprobada con denominador reproducible.
4. Diseñar y probar idempotencia persistente de pedidos y una prueba aislada de PostgreSQL, sin tocar datos reales.

Las actualizaciones mayores requieren revisión de compatibilidad; no se ejecutó `npm audit fix --force`. Esta evaluación no autoriza despliegue.
