# Reporte de ejecución de calidad

**Fecha:** 2026-11-07
**Versión:** 1.0.0
**Ambiente:** Windows, Node.js, Edge headless; datos ficticios y servidores locales; sin conexión a PostgreSQL/Neon durante la suite. No se usaron credenciales reales.

## Resumen medido

| Comprobación | Resultado |
|---|---|
| `npm test` en `backend/` | 175 ejecutadas, 175 aprobadas, 0 fallidas, 0 omitidas |
| `node --test --experimental-test-coverage tests/*.test.cjs` | 175 aprobadas; 77.50 % sentencias, 84.76 % ramas, 82.99 % funciones |
| `npm run build` en `frontend/` | Aprobado; 14 páginas Astro generadas |
| `npm run check` en `frontend/` | 0 errores, 0 warnings, 2 hints |
| `npx prisma validate` en `backend/` | Esquema PostgreSQL válido; no conecta ni migra la base |
| `npm audit` en `backend/` | 6 vulnerabilidades: 2 moderadas, 4 altas |
| `npm audit` en `frontend/` | 5 vulnerabilidades: 1 baja, 3 altas, 1 crítica |
| Accesibilidad EV-ACC-001–007 | 7 aprobadas en Edge headless, con alcance descrito en la sección 13.2 del plan |

El antecedente de 167 pruebas, 165 aprobadas y 2 fallidas fue reproducido. El error `No se encontró la línea del carrito: Acetaminofén` provenía de una carrera en el test: `go()` esperaba `document.readyState`, no el render terminado del catálogo asíncrono. El estado local se persistía y el catálogo de prueba respondía; la búsqueda se sincronizó con la aparición de la fila sin cambiar la aserción. La ejecución final aprobó la prueba.

Se crearon ocho verificaciones: siete accesibilidad y una prueba de doble clic de pago. Se asociaron etiquetas a los campos del formulario de registro y nombres accesibles al botón de menú y al buscador de medicamentos.

## Seguridad y base de datos

Se actualizaron dependencias dentro de los rangos compatibles usando `npm audit fix` sin `--force`. Esto eliminó el hallazgo crítico de `proxy-addr` en backend; quedan 6 avisos backend. Frontend conserva un hallazgo crítico en Astro y avisos adicionales; el remedio que ofrece el audit requiere Astro 7.4.1, fuera del rango mayor actual. No se hizo el salto mayor automáticamente. No se ejecutó una migración ni se modificaron datos reales.

Los tests de API usan repositorios simulados. La integración con PostgreSQL real y el comportamiento persistente entre instancias están pendientes. El checkout evita el doble clic en el navegador; el backend no tiene clave de idempotencia persistente y no garantiza deduplicación de solicitudes repetidas.

**Decisión:** NO-GO según los umbrales propuestos: cobertura inferior a 80 %, dependencias con hallazgo crítico abierto y validación de integración real pendiente. Consulte `go-no-go.md`.

## Archivos de evidencia

- `../evidencias/EV-QUALITY-001-tests.txt`: transcripción de la regresión final.
- `cobertura-node.txt`: transcripción completa del reporte de cobertura.
- `build-frontend.txt`, `prisma-validate.txt`: compilación, diagnóstico y validación Prisma.
- `npm-audit-backend.txt`, `npm-audit-frontend.txt`: informes completos de auditoría.
- `../evidencias/EV-ACC-001.txt` a `EV-ACC-007.txt`: salidas aprobadas de accesibilidad.
