# Farmacia: retiro de Chat y Entregas

## Resultado y alcance

El menú conserva Dashboard, Usuarios, Solicitudes, Inventario, Medicamentos,
Notificaciones y Perfil. Se retiran Chat y Entregas, sus accesos y los indicadores
LISTA/ENTREGADA del Dashboard. Las dos tarjetas restantes se distribuyen en una
cuadrícula adaptable sin columnas vacías.

Los paneles `/pages/farmacia-chat.html` y `/pages/farmacia-entregas.html` se
sustituyen por páginas mínimas de módulo retirado, sin componentes operativos.
El guard de autorización rechaza esas rutas y devuelve a Farmacia a su Dashboard,
también con parámetros en la URL. Sin JavaScript no existe un panel que revelar.
No son respuestas HTTP 403: el frontend se publica como sitio estático.

`/pages/chat-farmacia.html` conserva el chat de Paciente (2), pero rechaza a
Farmacia (3) antes de cargar conversaciones o conectar sockets. El componente
compartido añade también esa restricción. Se conservan servicios, historial,
conversaciones, pedidos y protecciones del backend.

Se eliminan la inicialización y los retornos del panel retirado, la variante
exclusiva de Entregas en FarmaciaOperaciones y los estilos exclusivos del chat
embebido. Los estados históricos de las solicitudes siguen disponibles en
Solicitudes con los controles existentes; no se amplía su acceso.

## Archivos de esta intervención

- `frontend/src/layouts/FarmaciaLayout.astro`
- `frontend/src/pages/pages/farmacia.astro`
- `frontend/src/pages/pages/farmacia-chat.astro`
- `frontend/src/pages/pages/farmacia-entregas.astro`
- `frontend/src/components/FarmaciaChat.jsx`
- `frontend/src/components/FarmaciaOperaciones.astro`
- `frontend/public/js/farmacia.js`
- `frontend/public/js/farmacia-context.js`
- `frontend/public/js/farmacia-dashboard.js`
- `frontend/public/js/roles.js`
- `frontend/public/css/farmacia.css`
- `backend/tests/farmacia-pages.test.cjs`
- `backend/tests/frontend-roles.test.cjs`
- `backend/tests/frontend.test.cjs`
- `backend/tests/support/farmacia-panel-browser.cjs`
- Este informe.

Los cambios previos en `frontend/src/pages/index.astro` y
`frontend/src/pages/login.astro` se encontraron al iniciar y se conservaron.
No son parte de esta intervención. También se conservaron los archivos de
auditoría, respaldos, stash y worktrees existentes.

## Validación

Las pruebas usan respuestas simuladas y el preload
`backend/tests/support/isolate-database.cjs` para rechazar conexiones inesperadas
a la base de datos. Edge se ejecuta fuera del sandbox porque dentro no respondió
a Runtime.enable. Los registros de ejecuciones anteriores se conservan; no se
suman como pruebas adicionales.

- Suite completa: **566 aprobadas, 0 fallidas, 0 omitidas**. Comando:
  `node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs`.
  Evidencia: `farmacia-retiro-verificacion.tap` en la raíz del repositorio.
- Frontend (`node --test tests/*.test.mjs`): 6 aprobadas, 0 fallidas.
- Farmacia en navegador: 3 aprobadas, 0 fallidas; siete pantallas, revocación,
  responsive, menú, Dashboard y rechazo de URL antiguas.
- Astro check: 0 errores, 0 advertencias; un hint preexistente por `map` sin uso
  en `frontend/public/js/dashboard.js`.
- Astro build: correcto, 18 páginas Astro generadas, incluidas las páginas de
  módulo retirado.
- Prisma validate: esquema válido. La repetición usa una URL local inalcanzable;
  validate no aplica migraciones ni conecta a la base de datos.
- `git diff --check`: correcto.

Los contratos de permisos de Administrador (1), Paciente (2) y EPS (4) no cambian.
Las pruebas incluyen el chat de Paciente y los módulos de los otros roles.
La ejecución final también aprobó el chat administrativo; una ejecución anterior
tuvo un timeout intermitente en ese caso, sin cambios a su código.

Otros registros locales de esta entrega: `farmacia-retiro-frontend.tap`,
`farmacia-retiro-panel.tap`, `farmacia-retiro-check.txt`,
`farmacia-retiro-build.txt` y `farmacia-retiro-prisma.txt`. Las ejecuciones
anteriores permanecen en `farmacia-retiro-suite*.tap`; contienen los fallos del
sandbox y contratos de prueba ajustados antes de la ejecución final.

## Criterios pendientes para completar la operación de Farmacia

Este retiro no convierte los módulos conservados en funcionalidades nuevas ni
levanta sus bloqueos previos:

1. Solicitudes requiere titularidad verificable de cada pedido antes de habilitar
   su cola real; se mantiene `FARMACIA_PEDIDOS_TITULARIDAD_PENDIENTE`. La vinculación
   EPS por sí sola no autoriza pedidos ni estadísticas globales.
2. Usuarios requiere una vinculación EPS vigente y autorizada por el flujo
   correspondiente. No se creó ni cambió ninguna vinculación en este trabajo.
3. Inventario y Medicamentos conservan su alcance informativo actual; el catálogo
   global no acredita existencias propias ni habilita movimientos persistentes.
4. Notificaciones conserva su preactivación y sus bloqueos actuales. Activarla
   requiere completar sus criterios de persistencia y autorización por separado.
5. Chat y Entregas quedan fuera del alcance del panel Farmacia. Una eventual
   reincorporación requiere una solicitud independiente.

No se modificó código de producción del backend ni el esquema Prisma. No hubo
migraciones, escrituras en Neon, cambios a los 50 afiliados de EPS VidaPlena,
vinculaciones EPS, commits, push ni merge a main.
