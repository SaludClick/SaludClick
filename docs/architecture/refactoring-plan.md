# Plan de refactorización

El objetivo es mejorar límites de capa sin reconstruir la aplicación, cambiar tecnología, modificar contratos ni tocar el esquema/datos MySQL.

## Etapa 1 — Línea base y contratos

- Documentar las 22 rutas, JSON/status, entradas y permisos en `endpoints.md`.
- Caracterizar autenticación y autorización con JWT firmado localmente y dobles; no usar base real.
- Registrar baseline de `npm test` antes de cambios y repetir tras agregar pruebas.
- No reorganizar módulos en esta etapa.

## Etapa 2 — Módulos de riesgo bajo

- Extraer funciones puras y de formato compartido a utilidades, conservando entradas/salidas.
- Encapsular llamadas frontend al cliente API gradualmente, manteniendo las páginas, rutas HTML y claves de almacenamiento.
- Separar servicios pequeños para health y medicamentos; conservar repositorios y response wrappers.
- Añadir pruebas enfocadas sin introducir dependencias o infraestructura nueva.

## Etapa 3 — Dashboard y administración

- Añadir servicios finos entre controladores y repositorios.
- Mover validación de estados a validadores/casos de uso sin cambiar mensajes, status ni roles 1/3.

## Etapa 4 — Autenticación

- Dividir casos de uso de `auth.service.js` (registro/login, proveedor Google, recuperación, perfil) preservando JWT, bcrypt, expiración, SMTP y contratos.
- Mantener middlewares y campos del payload hasta tener pruebas de regresión suficientes.

## Etapa 5 — Pedidos

- Separar validación de entrada, cálculo/reglas del pedido y pago simulado del servicio de aplicación.
- Mantener transacción, bloqueo de stock, aislamiento por usuario y formatos actuales.

## Etapa 6 — Fórmulas y archivos privados

- Mover validación/IO de archivos a servicio dedicado y conservar el repositorio SQL.
- Mantener propietario, protección JWT/admin, ubicación privada, formatos y tamaño.
- Cubrir fallos de escritura y coherencia archivo/registro antes de cambiar estructura.

## Etapa 7 — Configuración y cierre

- Consolidar configuración/env y manejo de errores comunes solo tras caracterizar respuestas actuales.
- Ejecutar suite completa y revisiones por endpoint, páginas, consultas y permisos.
- Documentar diferencias inevitables antes de pedir autorización para cualquier cambio de contrato o esquema.

## Criterio de avance

Cada etapa debe conservar tests existentes y de caracterización, correr `npm test` y revisar el diff. Ningún archivo SQL, dato, upload privado ni funcionalidad se elimina. No ejecutar migraciones ni apuntar pruebas a producción. El backup requiere análisis antes de una decisión; no se elimina por estar aparentemente sin referencias.
