# Plan de Calidad, Pruebas y Aceptación — SaludClick

**Versión del proyecto:** 1.0.0
**Fecha de revisión:** 2026-11-07
**Estado:** línea base QA; no constituye autorización de publicación.

## 8. Estrategia de calidad

Usar Node.js Test Runner (`node:test`) para pruebas unitarias, de servicios, repositorios con dobles, contratos HTTP y frontend en Edge headless. Complementar con build/check de Astro, Prisma validate/generate y auditorías npm. Las suites con dobles no se presentan como integración real con PostgreSQL.

## 9. Alcance y trazabilidad

La matriz de `reportes/matriz-trazabilidad.md` vincula autenticación, permisos, catálogo, carrito, pedidos, formularios, privacidad y accesibilidad con suites y límites. Las pruebas nuevas cubren idempotencia, rollback simulado, repositorios de autenticación/administración/fórmulas/dashboard y los scripts públicos PostgreSQL. Quedan ramas de servicios/controladores y repositorios sin cubrir; consultar `reportes/cobertura-node.txt`.

## 10. Ambiente y datos

Ejecución en Windows con Node.js v22.23.1, Edge headless, servidores locales y datos de prueba. Los tokens, tarjetas y cuentas son ficticios. Prisma valida el schema PostgreSQL y genera el cliente; no se ejecutaron migraciones, consultas de aceptación ni escrituras en Neon u otra base real. Los `.env` no se publican.

## 11. Ejecución y clasificación

- **Aprobada:** resultado observado y aserciones satisfechas.
- **Fallida:** una o más aserciones no satisfechas durante esa ejecución.
- **Bloqueada:** requiere ambiente o sistema externo no disponible/no autorizado.
- **Pendiente:** no ejecutada o falta evidencia para concluir.

El antecedente de 167 pruebas (165 aprobadas, 2 fallidas) permanece como histórico. La falla del carrito se reprodujo en la fase anterior y se corrigió sincronizando la prueba con el render asíncrono, sin reducir aserciones. La regresión final actual registró 199 aprobadas, 0 fallidas y 0 omitidas.

## 12. Criterios de aceptación

Metas propuestas: 100 % de pruebas críticas y requisitos críticos con evidencia, 100 % cobertura aspiracional y cero defectos críticos abiertos. La cobertura medida exclusiva de `backend/src/` es 85,98 % líneas, 77,49 % ramas y 74,29 % funciones: el umbral propuesto de 80 % en líneas se supera, pero la meta de 100 % no. Las auditorías finales reportaron cero vulnerabilidades. La aceptación de persistencia sigue bloqueada por falta de PostgreSQL aislado. No declarar cumplidas metas no medidas.

## 13. Seguridad y accesibilidad

Las suites verifican JWT ausente/inválido/vencido, roles, validación de datos, errores de API, CORS, rutas privadas, sesión y comportamiento de checkout. `npm audit` final reportó cero vulnerabilidades en ambos proyectos. No se usaron credenciales reales ni se realizó una prueba de penetración; auditoría de dependencias no equivale a pentest.

### 13.2 Accesibilidad — WCAG 2.2 AA

EV-ACC-001–007 son comprobaciones automatizadas ejecutadas en Edge para teclado, foco, etiquetas/mensajes, contraste, encabezados, textos alternativos y zoom/diseño a 320 px. Las siete aprobaron en las rutas/elementos indicados por cada evidencia. No constituyen auditoría WCAG completa de todas las rutas, contenidos dinámicos, lectores de pantalla o navegadores.

## 14. Datos e integridad

La clave `Idempotency-Key` UUID está vinculada al usuario; su huella excluye PAN/CVV. Una restricción única y la creación del pedido dentro de una transacción permiten replay, conflicto 409 y rollback. Las pruebas de servicio/repositorio/contrato con dobles aprobaron, incluida la protección frente a doble descuento de stock. La migración aditiva no se aplicó; falta probar concurrencia, integridad y persistencia en PostgreSQL aislado antes de afirmar aceptación.

Los instaladores públicos se generaron desde `schema.prisma`. Las actualizaciones MySQL antiguas se retiraron para evitar ejecutar scripts incompatibles o cambios de datos. No se probó la sintaxis mediante ejecución PostgreSQL.

## 15. Resultados y defectos

`npm test`: 199/199; build Astro aprobado con 14 páginas; `astro check`: cero errores, cero warnings y dos hints; Prisma 7.10.1 validate/generate aprobados; auditorías backend/frontend: cero vulnerabilidades. Cobertura backend: 85,98 % líneas, 77,49 % ramas y 74,29 % funciones. La decisión y riesgos vigentes están en `reportes/go-no-go.md` y `reportes/registro-defectos.md`.

## 16. Aceptación y liberación

**NO-GO** para publicar o migrar. Requiere validar primero la migración aditiva y los reintentos concurrentes en una base PostgreSQL aislada, revisar las colisiones de rutas que Astro reporta en el build y continuar mejorando cobertura sin excluir código válido. No ejecutar contra Neon ni datos reales sin autorización explícita.
