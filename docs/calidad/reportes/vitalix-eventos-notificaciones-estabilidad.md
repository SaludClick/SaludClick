# Eventos y notificaciones: fallo de la suite general resuelto

Fecha: 2026-11-13. Resultado final: **suite general de navegador, 54 aprobadas y 0 fallidas**. Sin commit ni push.

## Prueba identificada y reproducción

Caso: `new events refresh notifications and preserve an unsent reply`, en `backend/tests/support/administrative-browser.cjs`, invocado desde la suite `backend/tests/frontend.test.cjs`.

Se reprodujo la ausencia de «Evento nuevo» dentro del plazo de 7.500 ms. El resultado inicial fue 52 aprobadas y dos fallos contabilizados: el caso y su suite contenedora. La reproducción utilizó exclusivamente el servidor HTTP simulado y datos sintéticos.

Antes de corregir se instrumentaron temporalmente el callback Socket.IO simulado y las respuestas HTTP de notificaciones. Se observó:

```json
{
  "callback": "refreshVisible",
  "document.hidden": true,
  "aria-busy": "false",
  "hash": "#notificaciones",
  "filtros": {"buscar": "", "estado": ""},
  "eventos_disparados": 1,
  "peticion_de_notificaciones_despues_del_evento": false
}
```

El callback sí se ejecutaba, la vista no estaba cargando y los filtros estaban vacíos. La página controlada por CDP estaba oculta. Ejecutar JavaScript mediante DevTools no activa automáticamente su pestaña.

## Causa comprobada

La función existente `refreshVisible` en `frontend/public/js/administrative.js` omite deliberadamente la actualización de una página oculta. `refreshNotificationCount` también respeta esa condición. La prueba suponía una vista visible sin establecer esa precondición, algo que no se cumplía en la ejecución completa.

La causa no fue un evento duplicado ni un fallo de persistencia: hubo una única invocación observada y la notificación estaba en el fixture. Tampoco fue un fallo del servidor Socket.IO: este caso usa un callback simulado y llegó efectivamente al manejador del frontend. El diagnóstico de `fetch failed` incluido en el timeout era información acumulada por el ejecutor durante su búsqueda inicial de DevTools; las evaluaciones CDP de diagnóstico seguían respondiendo y permitieron observar la condición real.

La [evidencia resumida de reproducción](../evidencias/eventos-notificaciones-reproduccion.json) conserva los campos relevantes, sin datos reales ni credenciales.

## Corrección mínima

Se modificó únicamente el caso automatizado en `backend/tests/support/administrative-browser.cjs`:

- Activar el target controlado con `Page.bringToFront`.
- Esperar visibilidad real, carga inicial terminada y callback disponible antes de comprobar la actualización visible.
- Conservar el mismo timeout, el callback existente y las comprobaciones del borrador y de recepción de mensajes.

La instrumentación de diagnóstico se retiró después de identificar la causa. No se modificaron el frontend funcional, los handlers de notificaciones, Socket.IO, los estilos, endpoints, autenticación o PostgreSQL. No se falseó `document.hidden`, no se desactivó el guard de visibilidad ni se sustituyó el evento por un refresco manual.

## Estabilidad y cobertura de regresión

El caso ahora realiza cinco ciclos con ventanas/pestañas reales de Edge:

1. Crear un target temporal que deja la página de Administración en segundo plano.
2. Esperar `document.hidden === true`, insertar una notificación sintética y disparar el callback.
3. Comprobar que ese evento no reemplaza la vista oculta.
4. Traer Administración al frente, comprobar su visibilidad y disparar el evento en primer plano.
5. Esperar la notificación, comprobar una sola entrada por identificador y verificar contador e indicador de campana.
6. Cerrar únicamente el target temporal creado por ese ciclo.

Después de los cinco ciclos se verifican el borrador sin enviar, la llegada de otro mensaje al chat y la conservación del borrador tras actualizar el historial.

Se completaron tres ejecuciones administrativas aprobadas y una ejecución general final aprobada, con **20 ciclos de visibilidad/notificación verificados en esas cuatro ejecuciones**. El caso fallido pasó en todas ellas. Las ejecuciones se realizaron secuencialmente.

## Resultados finales exactos

| Comprobación | Aprobadas | Fallidas |
| --- | ---: | ---: |
| Suite completa de navegador | 54 | 0 |
| Administrativa, ejecución 1 | 9 | 0 |
| Administrativa, ejecución 2 | 9 | 0 |
| Administrativa, ejecución 3 | 9 | 0 |
| Diseño de chats en escritorio y móvil | 10 | 0 |
| PostgreSQL aislado, API, Socket.IO y dos navegadores | 10 | 0 |

Comandos:

```text
node --test tests/frontend.test.cjs
FRONTEND_TEST_ADMIN_ONLY=1 node --test tests/frontend.test.cjs
node --test tests/chat-layout.browser.cjs
node tests/run-administrative-chat-isolated.cjs --browser
```

La variable de entorno del segundo comando se estableció mediante PowerShell. La prueba aislada se ejecutó **sin** `--prepare-schema` ni `--prepare-visitors`; utilizó el esquema de pruebas ya existente, sin migraciones. El ejecutor fija el contenedor `saludclick-afiliados-validate-20261111`, base `saludclick_test`, puerto local 55434, y no carga el `.env` principal.

Los registros completos finales permanecen localmente en archivos `.events-*.log`, excluidos de Git. El resultado de 54/54 corresponde a la ejecución completa final guardada en `backend/.events-browser-full.log`; no se presenta la reproducción fallida como una ejecución aprobada.

## Funciones conservadas y verificadas

- VITALIX y Solicitudes: conversación de visitante y administrador desde las interfaces, respuestas en tiempo real, historial, recarga y reconexión.
- Notificaciones: campana, contador, enlace a Solicitudes y reintentos sin duplicación, comprobados además con PostgreSQL y Socket.IO reales en el entorno aislado.
- Burbujas: nueve variantes de widget, página y Solicitudes en 1440, 390 y 320 píxeles, más su suite; ancho, alineación, texto largo y campo de escritura aprobados.
- Administración: seis módulos, directorio sintético con cinco cuentas y 50 afiliados EPS, controles y permisos.
- Farmacia y EPS: las pruebas de regresión mantienen sus flujos y el bot local sin derivar sus preguntas.

## Archivos de esta intervención

- `backend/tests/support/administrative-browser.cjs`: activación real de la página, precondiciones y cinco ciclos de regresión de visibilidad.
- `docs/calidad/evidencias/eventos-notificaciones-reproduccion.json`: evidencia sintética resumida de la causa.
- Este informe y referencia de resolución desde el informe de diseño anterior.
- Capturas y mediciones de diseño regeneradas por la prueba existente.

No se modificaron datos reales, los afiliados EPS originales, los módulos, contraseñas o permisos. No hubo consultas a la base principal ni migraciones. Las escrituras de integración corresponden únicamente a fixtures sintéticos de la base aislada. No se hicieron commit ni push.
