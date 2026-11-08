# Plan de Calidad, Pruebas y Aceptación — SaludClick

**Versión del proyecto:** 1.0.0
**Fecha de revisión:** 2026-11-07
**Estado:** línea base QA; no constituye autorización de publicación.

No se encontró un Plan de Calidad previo en `docs/`; este documento establece la línea base de las secciones 8–16 sin atribuir resultados no medidos.

## 8. Estrategia de calidad

Usar Node.js Test Runner (`node:test`) para pruebas unitarias, de contratos HTTP y de frontend en Edge headless. Las pruebas actuales usan repositorios simulados, servidores locales y datos ficticios; no se conectan a una base de producción. Validar por separado compilación Astro, diagnósticos, esquema Prisma y dependencias con `npm audit`.

## 9. Alcance y trazabilidad

La matriz de `reportes/matriz-trazabilidad.md` relaciona las funcionalidades solicitadas con las suites y evidencia disponible. Las verificaciones de API con dobles de prueba no se consideran pruebas de integración con PostgreSQL real. El detalle de cobertura incluye todos los archivos medidos por Node, no solo código de producción.

## 10. Ambiente y datos

Ejecución en Windows con Node.js, dependencias ya presentes, Edge headless y servidores efímeros enlazados a loopback. Las pruebas usan tokens, usuarios, tarjetas y datos ficticios. Prisma valida el esquema PostgreSQL desde su configuración local; no se ejecutaron migraciones, consultas de aceptación sobre Neon ni escrituras en datos reales. Los archivos `.env` permanecen ignorados y no se incluyen en el repositorio.

## 11. Ejecución y clasificación

- **Aprobada:** resultado observado y aserciones satisfechas.
- **Fallida:** una o más aserciones no satisfechas durante esa ejecución.
- **Bloqueada:** requiere ambiente o sistema externo no disponible/no autorizado.
- **Pendiente:** no ejecutada o falta cobertura para concluir.

Los resultados históricos de 167 pruebas (165 aprobadas, 2 fallidas) se conservaron como antecedente. La nueva ejecución reprodujo la falla del carrito; tras sincronizar la prueba con el render asíncrono, la regresión final pasó.

## 12. Criterios de aceptación

Requisitos propuestos, no declarados cumplidos por defecto:

- Pruebas críticas aprobadas: 100 %.
- Requisitos críticos con evidencia: 100 %.
- Cobertura global de sentencias: al menos 80 %.
- Cero defectos críticos abiertos.

El estado medido actual no alcanza todos los criterios: cobertura global 77.50 % y `npm audit` reporta una vulnerabilidad crítica en dependencias frontend. Consulte `reportes/go-no-go.md`.

## 13. Seguridad y accesibilidad

Las suites cubren JWT, vencimiento de token, roles administrativos, validación de entradas, errores de API, CORS y sesiones simuladas. El análisis de dependencias con `npm audit` encontró vulnerabilidades abiertas; su clasificación y remediación están en `reportes/registro-defectos.md`. No se usaron credenciales reales ni se realizó una prueba de penetración.

### 13.2 Accesibilidad — WCAG 2.2 AA

Se ejecutaron siete verificaciones de navegador para teclado, foco, etiquetas/mensajes, contraste de texto, jerarquía de encabezados, atributos `alt` y viewport/diseño de 320 px. Las siete aprobaron en la página de inicio y/o formulario de registro según la comprobación. Evidencias EV-ACC-001 a EV-ACC-007 corresponden a esa ejecución; no implican una auditoría WCAG completa de cada ruta, contenido dinámico, lector de pantalla o navegador.

## 14. Datos e integridad

Las pruebas de servicios/repositorios usan dobles y verifican validación, duplicados dentro de líneas, cantidades y stock. Se añadió una prueba de doble clic que observa una sola solicitud POST desde el checkout. No existe verificación en base real ni clave de idempotencia persistente para deduplicar reintentos de POST entre sesiones/instancias; queda pendiente.

## 15. Resultados y defectos

La regresión final reportó 175 pruebas aprobadas y cero fallidas. El build Astro y `npx prisma validate` aprobaron; `astro check` reportó cero errores, cero warnings y dos hints. Cobertura Node: 77.50 % de sentencias, 84.76 % de ramas y 82.99 % de funciones. Los dos informes `npm audit` y los defectos restantes están en `reportes/`.

## 16. Aceptación y liberación

La decisión actual es **NO-GO** para declarar lista una publicación: hay una vulnerabilidad crítica reportada para Astro, otras dependencias vulnerables, cobertura inferior al 80 % y falta idempotencia persistente de pedidos y validación con PostgreSQL real. No se debe ejecutar una migración ni desplegar a producción basándose solo en esta suite. Repetir regresión, auditoría y revisión de aceptación después de resolver los pendientes.
