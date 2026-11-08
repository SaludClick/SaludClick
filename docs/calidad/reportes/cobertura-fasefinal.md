# Cobertura — Fase final

**Fecha:** 2026-11-08 · **Node.js:** v22.23.1 · **Ámbito:** `backend/src/**/*.js`

Comando ejecutado desde `backend/`:

```text
node --test --experimental-test-coverage --test-coverage-include="src/**/*.js" tests/*.test.cjs
```

| Métrica | Fase anterior | Fase final | Meta |
|---|---:|---:|---:|
| Líneas | 89,75 % | **92,45 %** | 90 % |
| Ramas | 80,27 % | **81,97 %** | 90 % |
| Funciones | 78,72 % | **81,56 %** | 90 % |

La suite final ejecutó 238 pruebas: 238 aprobadas, 0 fallidas y 0 omitidas. Se agregaron casos de administración, middleware de farmacia y normalización de documentos de perfil; también se estabilizó una espera E2E para el render asíncrono del checkout. No se excluyeron módulos ni se alteraron aserciones para elevar métricas.

La meta del 90 % se alcanzó únicamente en líneas. Permanecen huecos relevantes en `chat.repository.js`, `chat.socket.js`, `auth.service.js` y ramas de controladores. El objetivo de ramas/funciones no se declara aprobado.
