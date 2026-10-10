# Dependencias y flujo de módulos

## Dependencias de ejecución

| Paquete | Uso observado |
|---|---|
| `express` | Aplicación, middleware y routers HTTP |
| `mysql2` (`mysql2/promise`) | Pool y consultas MySQL parametrizadas |
| `jsonwebtoken` | Firma/verificación JWT |
| `bcrypt` | Hash y comparación de contraseñas |
| `google-auth-library` | Verificación de credencial Google |
| `nodemailer` | SMTP para recuperación |
| `cors` | Middleware CORS global |
| `dotenv` | Carga de variables de entorno |
| `nodemon` (desarrollo) | Reinicio del servidor de desarrollo |

No se detectó ORM, framework frontend, validador de esquemas, bundler ni cliente de estado externo. La suite de navegador usa APIs integradas de Node, Edge y WebSocket/CDP, sin dependencia de navegador en `package.json`.

## Arranque y backend

```text
backend/server.js
 ├─ dotenv.config() desde backend/.env
 ├─ backend/src/config/database.js → mysql2/promise pool
 └─ backend/src/app.js
     ├─ cors / cabeceras / express.json / estáticos de frontend/
     └─ /api → backend/src/routes/index.js
         ├─ rutas → middlewares + controladores
         ├─ controladores de auth/order/health → servicios → repositorios
         ├─ admin.controller → admin.service → admin.validator + admin.repository
         └─ controladores de dashboard/medication/formula → servicios/repositorios según módulo
```

`auth.service.js` depende de JWT util, bcrypt, auth repository, crypto, nodemailer, Google Auth y `auth.validator`. `user.service.js` depende de `auth.repository` y `user.validator`; `auth.controller.js` usa auth y user services. `order.service.js` depende de crypto y order repository. Los repositorios dependen del pool MySQL. `formula.controller.js` depende de filesystem, path, crypto y formula repository. Los middlewares dependen de JWT; `admin.middleware.js` compone `validarJWT`.

## Mapa ruta → controlador → servicio/repositorio

| Prefijo de ruta | Controlador | Capa intermedia actual | Persistencia/externos |
|---|---|---|---|
| `/health` | `health.controller` | `health.service` | `health.repository` → MySQL |
| `/auth` | `auth.controller` | `auth.service` (registro, login, Google y recuperación); `user.service` (perfil) | `auth.repository` → MySQL; validadores auth/user, bcrypt, Google, JWT y SMTP |
| `/pedidos` | `order.controller` | `order.service` | `order.repository` → MySQL/transacciones |
| `/medicamentos` | `medication.controller` | Ninguna | `medication.repository` → MySQL |
| `/dashboard` | `dashboard.controller` | Ninguna | `dashboard.repository` → MySQL |
| `/formulas` | `formula.controller` | Ninguna | `formula.repository` → MySQL y `backend/private_uploads` |
| `/admin` | `admin.controller` | `admin.service` (valida estado con `admin.validator`) | `admin.repository` → MySQL |

## Frontend y API

- `frontend/*.html` y `frontend/pages/*.html` contienen las pantallas públicas y privadas.
- `frontend/js/api.js` añade JSON y token a `apiFetch`; en `401` limpia sesión/redirige mediante `auth.js`.
- `frontend/js/auth.js` mantiene JWT/usuario en `localStorage` o `sessionStorage`, valida destinos permitidos y protege navegación de interfaz.
- Scripts de página consumen módulos API con `apiFetch` y, en algunos flujos de login/recuperación/archivo, `fetch` directamente.
- `pedido-temporal.js` maneja el borrador local; el backend vuelve a validar productos/precios/stock al crear pedido.
- CSS e imágenes son estáticos. No hay enrutador cliente: la navegación es entre archivos HTML.

## Observaciones de empaquetado

- Scripts backend: ejecutar `npm run dev`, `npm start` o `npm test` desde `backend/`; no existe build frontend.
- `backend/package.json` declara `main: index.js`, pero el inventario no contiene `index.js`; el servidor se ejecuta por `backend/server.js` mediante scripts.
- El frontend independiente se sirve con `node ../backend/scripts/frontend-server.js` desde `frontend/`; `/api` se reenvía al backend configurado en `BACKEND_URL` (por defecto `http://127.0.0.1:3000`).
- `auth.service.backup.js` no es importado por rutas/controladores identificados; verificar historial/referencias antes de cualquier decisión futura. Esta etapa no lo elimina.
