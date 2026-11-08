# Reporte de ejecución de calidad

**Fecha:** 2026-11-07 · **Versión:** 1.0.0
**Ambiente:** Windows, Node.js v22.23.1, Edge headless, datos ficticios y servidores locales. No se conectó a PostgreSQL/Neon ni se usaron credenciales reales.

## Resultados comprobados

| Comprobación | Resultado |
|---|---|
| `npm test` en `backend/` | 225 ejecutadas, 225 aprobadas, 0 fallidas, 0 omitidas |
| Cobertura Node sobre `backend/src/**/*.js` | 89,75 % líneas; 80,27 % ramas; 78,72 % funciones |
| `npm run build` en `frontend/` | Aprobado; 14 páginas HTML verificadas en `dist`, sin colisiones |
| `npm run check` en `frontend/` | 0 errores, 0 warnings, 2 hints |
| `npx prisma validate` y `npx prisma generate` | Aprobados con Prisma 7.10.1; sin conexión ni migración |
| `npm audit` en `backend/` | 0 vulnerabilidades reportadas |
| `npm audit` en `frontend/` | 0 vulnerabilidades reportadas |
| Accesibilidad EV-ACC-001–007 | 7 verificaciones aprobadas en Edge headless |

El antecedente de 167 pruebas (165 aprobadas, 2 fallidas) se reprodujo en la fase anterior. La falla del carrito era una carrera del test que consultaba el DOM antes de terminar el render asíncrono; se corrigió esperando la fila concreta, sin cambiar la aserción ni ocultar el defecto.

Se añadieron pruebas de contrato para la clave idempotente, repetición/reuso y conflictos; pruebas transaccionales con dobles PostgreSQL; validaciones límite de pedido/pago, rollback y consultas de historial/eliminación; pruebas de repositorios de autenticación, administración, fórmulas y dashboard; y verificaciones del esquema/instaladores PostgreSQL. El checkout envía una clave UUID estable durante reintentos, y el backend persiste la clave y la huella dentro de la transacción. La huella no incluye PAN ni CVV, y los bloqueos de inventario se solicitan en orden estable por medicamento. El repositorio de administración también dejó de contener una implementación SQL duplicada que quedaba sobrescrita por la de Prisma.

## Seguridad, persistencia y límites

Las auditorías finales de ambos proyectos reportaron cero vulnerabilidades. Se actualizaron Astro a 7.4.1 y Prisma/Client a 7.10.1; Prisma usa ahora el adaptador PostgreSQL compatible con la versión mayor. Se generó el DDL de instalación desde `schema.prisma`, se alinearon sus defaults y los scripts MySQL de actualización que alteraban columnas/inventario quedaron retirados con error explícito.

La cobertura de líneas (89,75 %) y ramas (80,27 %) supera el umbral propuesto de 80 %; funciones (78,72 %) y la meta aspiracional de 100 % no se alcanzaron. Los tests de transacción y deduplicación usan dobles; no demuestran concurrencia ni persistencia en PostgreSQL real. La migración aditiva fue revisada estáticamente, pero no aplicada. No había `TEST_DATABASE_URL`, archivo de pruebas o servicio local PostgreSQL configurado; no se intentó conectar a Neon.

Se identificaron 12 colisiones entre rutas `.astro` y archivos con la misma ruta bajo `public/`. Se retiraron las fuentes Astro redundantes porque los HTML de `public/` eran las páginas efectivamente copiadas al build; se conservaron sus rutas y las dos páginas Astro únicas. La prueba de inventario y `dist` confirman 14 páginas HTML y el build ya no reporta colisiones. `astro check` reportó 0 errores, 0 warnings y 2 hints.

**Decisión:** **NO-GO** para liberar o afirmar aceptación integral hasta configurar un PostgreSQL aislado autorizado y validar migración, persistencia y concurrencia. Consulte `go-no-go.md`.

## Evidencias

- `../evidencias/EV-QUALITY-002-regresion-fase3.txt`: transcripción de la regresión Fase 3 (`npm test`, 225/225).
- `../evidencias/EV-QUALITY-001-tests.txt`: transcripción de la regresión previa.
- `cobertura-node.txt`: transcripción de cobertura exclusiva de `backend/src/`.
- `build-frontend.txt`, `prisma-validate.txt`: build, diagnósticos y validación/generación Prisma.
- `npm-audit-backend.txt`, `npm-audit-frontend.txt`: auditorías finales.
- `../evidencias/EV-ACC-001.txt` a `EV-ACC-007.txt`: comprobaciones WCAG automatizadas ejecutadas.
