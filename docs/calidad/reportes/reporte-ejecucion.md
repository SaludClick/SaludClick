# Reporte de ejecución de calidad

**Fecha:** 2026-11-07 · **Versión:** 1.0.0
**Ambiente:** Windows, Node.js v22.23.1, Edge headless, datos ficticios y servidores locales. No se conectó a PostgreSQL/Neon ni se usaron credenciales reales.

## Resultados comprobados

| Comprobación | Resultado |
|---|---|
| `npm test` en `backend/` | 199 ejecutadas, 199 aprobadas, 0 fallidas, 0 omitidas |
| Cobertura Node sobre `backend/src/**/*.js` | 85,98 % líneas; 77,49 % ramas; 74,29 % funciones |
| `npm run build` en `frontend/` | Aprobado; 14 páginas Astro generadas |
| `npm run check` en `frontend/` | 0 errores, 0 warnings, 2 hints |
| `npx prisma validate` y `npx prisma generate` | Aprobados con Prisma 7.10.1; sin conexión ni migración |
| `npm audit` en `backend/` | 0 vulnerabilidades reportadas |
| `npm audit` en `frontend/` | 0 vulnerabilidades reportadas |
| Accesibilidad EV-ACC-001–007 | 7 verificaciones aprobadas en Edge headless |

El antecedente de 167 pruebas (165 aprobadas, 2 fallidas) se reprodujo en la fase anterior. La falla del carrito era una carrera del test que consultaba el DOM antes de terminar el render asíncrono; se corrigió esperando la fila concreta, sin cambiar la aserción ni ocultar el defecto.

Se añadieron pruebas de contrato para la clave idempotente, repetición/reuso y conflictos; pruebas transaccionales con dobles PostgreSQL; pruebas de repositorios de autenticación, administración, fórmulas y dashboard; y verificaciones del esquema/instaladores PostgreSQL. El checkout ahora envía una clave UUID estable durante reintentos, y el backend persiste la clave y la huella dentro de la transacción. La huella no incluye PAN ni CVV, y los bloqueos de inventario se solicitan en orden estable por medicamento. El repositorio de administración también dejó de contener una implementación SQL duplicada que quedaba sobrescrita por la de Prisma.

## Seguridad, persistencia y límites

Las auditorías finales de ambos proyectos reportaron cero vulnerabilidades. Se actualizaron Astro a 7.4.1 y Prisma/Client a 7.10.1; Prisma usa ahora el adaptador PostgreSQL compatible con la versión mayor. Se generó el DDL de instalación desde `schema.prisma`, se alinearon sus defaults y los scripts MySQL de actualización que alteraban columnas/inventario quedaron retirados con error explícito.

La cobertura de líneas supera el umbral propuesto de 80 %, pero ramas (77,49 %), funciones (74,29 %) y la meta aspiracional de 100 % no se alcanzaron. Los tests de transacción y deduplicación usan dobles; no demuestran concurrencia ni persistencia en PostgreSQL real. El cambio de idempotencia es una migración aditiva aún no aplicada. No había una base de pruebas aislada disponible/autorizada; no se intentó conectar a Neon.

El build final aprobó, aunque Astro informó colisiones preexistentes entre algunas rutas `src/pages` y archivos del directorio `public`. `astro check` no detectó errores ni warnings y reportó dos hints.

**Decisión:** **NO-GO** para liberar o afirmar aceptación integral hasta validar la migración y el comportamiento concurrente con PostgreSQL aislado, y completar la cobertura pendiente. Consulte `go-no-go.md`.

## Evidencias

- `../evidencias/EV-QUALITY-001-tests.txt`: transcripción actualizada de `npm test`.
- `cobertura-node.txt`: transcripción de cobertura exclusiva de `backend/src/`.
- `build-frontend.txt`, `prisma-validate.txt`: build, diagnósticos y validación/generación Prisma.
- `npm-audit-backend.txt`, `npm-audit-frontend.txt`: auditorías finales.
- `../evidencias/EV-ACC-001.txt` a `EV-ACC-007.txt`: comprobaciones WCAG automatizadas ejecutadas.
