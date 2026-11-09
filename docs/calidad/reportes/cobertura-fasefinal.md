# Cobertura — Fase final

**Fecha:** 2026-11-08 · **Node.js:** v22.23.1 · **Ámbito:** `backend/src/**/*.js`

Comando ejecutado desde `backend/`:

```text
node --test --experimental-test-coverage --test-coverage-include="src/**/*.js" tests/*.test.cjs
```

| Métrica | Regresión anterior | Regresión final | Meta |
|---|---:|---:|---:|
| Líneas | 92,45 % | **98,37 %** | 90 % |
| Ramas | 81,97 % | **90,63 %** | 90 % |
| Funciones | 81,56 % | **95,07 %** | 90 % |

La suite final ejecutó **267 pruebas: 267 aprobadas, 0 fallidas y 0 omitidas**, en aproximadamente 50 segundos. Se añadieron pruebas unitarias y con API simulada para autorización de chat, sockets, autenticación, pedidos, reCAPTCHA, fórmulas, dashboard y errores de persistencia. No se alteró código de producción para aumentar la cobertura ni se redujeron umbrales.

Las tres métricas superan la meta. La cobertura reportada corresponde a `backend/src/**/*.js`; el reporte incluye los módulos y no excluye archivos. La cobertura de integración PostgreSQL **39,20 %** es una medición distinta y no se suma a la cobertura de regresión.
