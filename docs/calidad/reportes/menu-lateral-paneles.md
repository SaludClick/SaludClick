# Menú lateral de Administrador, EPS y Farmacia

## Verificación previa a la publicación

La integración se probó en un worktree desde `origin/main` en `937eeb9`. Antes de la corrección, Edge reprodujo el fallo de Administrador a 1440 px con el botón por encima del área visible. El encabezado administrativo tenía posicionamiento normal y se desplazaba junto con el contenido. El encabezado ahora se mantiene visible durante el desplazamiento. El cambio está en `frontend/public/css/panel-menu.css` y la prueba en `backend/tests/panel-menu-browser.test.cjs` recorre las seis secciones de Administrador, desplaza la página y comprueba apertura y cierre.

En la nueva ejecución pasaron las 54 pruebas del menú, las nueve combinaciones de Edge y la prueba adicional de la portada. Astro generó 19 páginas y revisó 94 archivos sin incidencias. La batería de regresión obtuvo 99 de 100 resultados aprobados. La única prueba fallida sigue siendo la de archivos estáticos.

Express devuelve HTTP 500 para `/restablecer.html` en el worktree. El stack original comienza con `ForbiddenError: Forbidden` en `send/index.js:464`, pasa por `ServerResponse.sendFile` y llega a `backend/src/app.js:45`. La llamada usa una ruta absoluta con `dotfiles: "deny"`. La dependencia considera oculto el segmento `.integration-worktrees` y devuelve 403. El manejador general de Express lo transforma en 500. La misma prueba falla en una copia limpia de `origin/main` en la misma jerarquía. El servidor auxiliar sí devuelve 200 con `Referrer-Policy: no-referrer`.

Publicación detenida antes del commit y push por el fallo de Express. El código del servidor y la prueba de seguridad quedaron intactos. Las capturas enlazadas se regeneraron después de la corrección.

El menú se integra en las seis secciones del administrador, los dos paneles de EPS y las siete páginas vigentes de Farmacia. Cada panel conserva sus enlaces, colores y marcado de la sección activa. En escritorio, la preferencia se conserva por rol durante la sesión de la pestaña. En tablet y móvil, el menú comienza cerrado y se abre sobre el contenido. El foco queda dentro del menú abierto y vuelve al botón de hamburguesa al cerrar con Escape, el botón de cierre o el fondo. La animación respeta la preferencia de movimiento reducido.

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `frontend/public/css/panel-menu.css`, `frontend/public/js/panel-menu.js` | Estilos, interacción, persistencia y accesibilidad compartidos. |
| `frontend/public/pages/admin.html` | Botón superior y panel lateral de administración. |
| `frontend/src/pages/pages/eps.astro`, `frontend/src/pages/pages/eps-v1.astro` | Integración en el panel principal y Gestión EPS. |
| `frontend/src/layouts/FarmaciaLayout.astro` | Integración en las siete páginas de Farmacia. |
| `frontend/public/js/administrative.js`, `frontend/public/js/eps.js` | Ajuste de los eventos de menú anteriores. El soporte del paciente conserva su manejador. |
| `frontend/public/js/farmacia.js`, `frontend/public/js/farmacia-notificaciones.js` | Retiro de los manejadores de menú que duplicaban la interacción compartida. |
| `backend/tests/panel-menu-browser.test.cjs` | Prueba en Edge con datos sintéticos y captura opcional. |

## Validación

- `npm --prefix frontend run build` generó 19 páginas.
- `npm --prefix frontend run check` revisó 93 archivos con 0 errores, 0 advertencias y 0 sugerencias.
- 54 pruebas aprobadas, incluidas nueve combinaciones de rol y ancho en Microsoft Edge, la regresión de las siete páginas de Farmacia y las suites de roles, EPS, administración y frontend.
- En Edge se verificaron los enlaces por rol, la sección activa al navegar, la persistencia de escritorio, el fondo oscurecido, el foco y su retorno, el cierre con Escape y el ancho del contenido. Se comprobó el paso de EPS a Gestión EPS y de Farmacia a Usuarios.
- Se comprobó `FARMACIA_OPERACION_ENABLED=false` en la configuración local. Las pruebas de Edge usaron respuestas HTTP simuladas, con la operación de Farmacia deshabilitada, sin conexiones a PostgreSQL ni Neon. Los recursos externos se bloquearon durante las capturas, por lo que la iconografía que depende del CDN puede faltar en las imágenes.
- Los cambios de aplicación se limitan al frontend de los tres roles. Las rutas retiradas siguen mostrando su aviso. Sin commit ni push.

## Capturas en Microsoft Edge

| Panel | Ancho | Menú abierto | Menú cerrado |
| --- | --- | --- | --- |
| Administrador | 1440 px | [Abierto](../evidencias/menu-paneles/administrador-1440-abierto.png) | [Cerrado](../evidencias/menu-paneles/administrador-1440-cerrado.png) |
| Administrador | 768 px | [Abierto](../evidencias/menu-paneles/administrador-768-abierto.png) | [Cerrado](../evidencias/menu-paneles/administrador-768-cerrado.png) |
| Administrador | 390 px | [Abierto](../evidencias/menu-paneles/administrador-390-abierto.png) | [Cerrado](../evidencias/menu-paneles/administrador-390-cerrado.png) |
| EPS | 1440 px | [Abierto](../evidencias/menu-paneles/eps-1440-abierto.png) | [Cerrado](../evidencias/menu-paneles/eps-1440-cerrado.png) |
| EPS | 768 px | [Abierto](../evidencias/menu-paneles/eps-768-abierto.png) | [Cerrado](../evidencias/menu-paneles/eps-768-cerrado.png) |
| EPS | 390 px | [Abierto](../evidencias/menu-paneles/eps-390-abierto.png) | [Cerrado](../evidencias/menu-paneles/eps-390-cerrado.png) |
| Farmacia | 1440 px | [Abierto](../evidencias/menu-paneles/farmacia-1440-abierto.png) | [Cerrado](../evidencias/menu-paneles/farmacia-1440-cerrado.png) |
| Farmacia | 768 px | [Abierto](../evidencias/menu-paneles/farmacia-768-abierto.png) | [Cerrado](../evidencias/menu-paneles/farmacia-768-cerrado.png) |
| Farmacia | 390 px | [Abierto](../evidencias/menu-paneles/farmacia-390-abierto.png) | [Cerrado](../evidencias/menu-paneles/farmacia-390-cerrado.png) |
