# Registro de defectos y riesgos

**Fecha:** 2026-11-07 · **Versión:** 1.0.0

| ID | Hallazgo | Severidad/estado | Evidencia y acción |
|---|---|---|---|
| QA-001 | El test del carrito consultaba antes del render del catálogo asíncrono. | Bajo — corregido | La espera se sincronizó con la fila concreta sin cambiar la aserción. La regresión final aprobó. |
| QA-002 | Campos del registro, botón del menú y buscador carecían de nombres accesibles. | Moderado — corregido | Etiquetas/nombres accesibles añadidos; EV-ACC-001–007 aprobadas. |
| SEC-DEP-001 | Hallazgos de dependencias backend reportados previamente por `npm audit`. | Alto — corregido según auditoría | Prisma/Client 7.10.1 y adaptador PostgreSQL; auditoría final: 0 vulnerabilidades reportadas. |
| SEC-DEP-002 | Hallazgos de Astro y dependencias frontend reportados previamente por `npm audit`. | Crítico — corregido según auditoría | Astro 7.4.1 y `@astrojs/react` 7.1.0; auditoría final: 0 vulnerabilidades reportadas. |
| QA-003 | No se alcanza la meta aspiracional de 100 % de cobertura. | Medio — abierto | Node mide `backend/src/`: 85,98 % líneas, 77,49 % ramas y 74,29 % funciones. La línea supera el umbral propuesto del 80 %. |
| QA-004 | Idempotencia persistente de pedidos requiere validación en PostgreSQL. | Alto — implementación lista; validación bloqueada | Clave UUID por usuario, huella sin datos de tarjeta, índice único y reclamación dentro de transacción; pruebas con dobles aprobadas. Migración no aplicada. |
| QA-005 | Concurrencia, rollback e integridad no se verificaron contra una base PostgreSQL real. | Bloqueado | No hay base de pruebas aislada disponible/autorizada. Se validó el esquema y se probaron contratos/transacciones con dobles; no se conectó a Neon. |
| DB-001 | Instaladores/actualizaciones antiguos tenían SQL MySQL incompatible con PostgreSQL; uno modificaba stock. | Corregido/retirado | Instaladores públicos regenerados desde Prisma y semilla PostgreSQL; scripts peligrosos de actualización retirados y con error explícito. No se ejecutó SQL contra una base. |

No se detectó una corrección de aplicación que justificara alterar el contenido del carrito para hacer pasar su prueba. No se reportaron vulnerabilidades críticas/altas en las auditorías finales.
