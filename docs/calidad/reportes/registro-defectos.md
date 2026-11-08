# Registro de defectos y riesgos

**Fecha:** 2026-11-07 · **Versión:** 1.0.0

| ID | Hallazgo | Severidad/estado | Evidencia y acción |
|---|---|---|---|
| QA-001 | El test de carrito consultaba el DOM antes de terminar el render posterior a la petición asíncrona del catálogo. No se observó pérdida del borrador ni desincronización persistente. | Bajo — corregido | `clickCartControl`/`setCartQuantity` esperan la fila concreta; la prueba original aprobó en la regresión final. |
| QA-002 | Campos del formulario de registro carecían de asociación entre `label` y control. El botón de menú y buscador de medicamentos también carecían de nombre accesible. | Moderado — corregido | Etiquetas `for`, `aria-label` y comprobación EV-ACC-003; siete verificaciones de accesibilidad aprobadas. |
| SEC-DEP-001 | Auditoría backend posterior a actualizaciones compatibles reporta 6 vulnerabilidades (2 moderadas, 4 altas), incluyendo dependencias Prisma, Nodemailer y nodemon. | Alto — abierto | `npm audit fix` no forzado corrigió las versiones compatibles. El audit indica que remediar los restantes requiere actualizaciones mayores. |
| SEC-DEP-002 | Auditoría frontend reporta 5 vulnerabilidades (1 baja, 3 altas, 1 crítica); Astro es la crítica. | Crítico — abierto | `npm audit` indica Astro 7.4.1 como corrección fuera del rango Astro 5 actual. Actualización mayor no aplicada por riesgo de incompatibilidad. |
| QA-003 | Cobertura de sentencias total 77.50 %, bajo el objetivo propuesto de 80 %. | Medio — abierto | Reporte generado por Node Test Runner. Hay módulos de repositorio que no se ejecutan contra PostgreSQL. |
| QA-004 | No hay garantía persistente de idempotencia para reintentos/repeticiones de `POST /api/pedidos`; el bloqueo de doble clic observado es solo de frontend. | Alto — pendiente | Prueba de doble clic aprobada; esquema/repositorio no muestran una clave persistente de idempotencia. Requiere diseño y validación de persistencia antes de afirmar deduplicación backend. |
| QA-005 | La suite no verifica transacciones/integridad con PostgreSQL real; repositorios se simulan. | Bloqueado | `npx prisma validate` sí aprobó. La prueba real queda pendiente de ambiente de pruebas aislado y autorización; no se usó Neon ni se migró. |

No se detectó una corrección de aplicación que justificara alterar el contenido de los pedidos para hacer pasar la prueba del carrito.
