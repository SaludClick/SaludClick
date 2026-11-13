# VITALIX y Solicitudes: burbujas legibles y campos de escritura

Actualización posterior: [fallo de eventos resuelto y suite general con 54 aprobadas, 0 fallidas](vitalix-eventos-notificaciones-estabilidad.md). El pendiente descrito abajo corresponde al estado anterior; la causa comprobada fue la visibilidad de la página controlada por la prueba, no la compresión de burbujas.

Fecha: 2026-11-13. Corrección exclusivamente de presentación, sin commit ni push.

## Causa y corrección

Los mensajes humanos de VITALIX utilizan la clase `vitalix-message-assistant`, compartida con las respuestas del bot. Esa clase define una cuadrícula con una primera columna de 36 píxeles para el avatar. Como el mensaje humano no tiene avatar, su único bloque de contenido ocupaba esa primera columna y el texto se dividía verticalmente.

Se añadieron reglas específicas para los mensajes humanos existentes, identificados por `data-vitalix-message`, sin cambiar HTML, componentes React ni renderizadores JavaScript:

- Burbujas en bloque, adaptables al contenido, con máximo del 85 % del chat y mínimo limitado por el espacio disponible. El remitente, contenido y fecha quedan apilados.
- Administración a la izquierda y visitante a la derecha en VITALIX. Solicitudes mantiene visitante a la izquierda y administrador a la derecha.
- Sin contracción de las burbujas. Contenedores flex/grid con `min-width: 0` donde corresponde.
- `overflow-wrap: break-word` y `word-break: normal`: las palabras normales conservan sus cortes; las cadenas largas sin espacios pueden ajustarse dentro del chat.
- Se elimina el doble relleno de la burbuja del visitante y se aplica a su contenido el fondo verde existente.
- El campo VITALIX utiliza una cuadrícula con una columna flexible y otra reservada al botón de envío. El campo administrativo ocupa el espacio restante del contenedor flex sin forzar un ancho del 100 % más el botón.
- En Solicitudes se explicitan ancho adaptable, mínimo seguro, máximo del 85 % también en móvil, remitente en bloque y pie flexible.

Se mantienen colores, tipografía, radios, bordes y sombras existentes. Las respuestas del bot conservan su avatar y cuadrícula propios.

## Archivos modificados en esta tarea

- `frontend/src/styles/chat.css`: reglas de mensajes humanos, alineación, ajuste del contenido, campo de escritura y ancho mínimo del widget.
- `frontend/public/css/administrative-chat.css`: dimensiones de burbujas, apilado, pie, contenedores y textarea de Solicitudes.
- `backend/tests/chat-layout.browser.cjs`: verificación visual y geométrica con datos sintéticos; no importa la aplicación de producción, no carga `.env` ni utiliza PostgreSQL.
- Este informe y las capturas/mediciones generadas en `docs/calidad/evidencias/chat-layout/`.

**HTML modificado: ninguno.** El marcado existente ya separaba remitente, contenido y fecha; la corrección necesaria era CSS. Los demás cambios locales anteriores se conservaron.

## Verificación visual y responsive

Comando: `node --test tests/chat-layout.browser.cjs`.

Resultado: **10 pruebas aprobadas, 0 fallidas**: una suite y nueve variantes del widget VITALIX, página VITALIX y Solicitudes en 1440, 390 y 320 píxeles. Se usó Edge headless con las interfaces compiladas y una API simulada con mensajes sintéticos.

Casos: pregunta corta de Administración, respuesta del visitante, mensaje «Gracias», dos respuestas administrativas consecutivas, párrafos extensos, saltos de línea y una referencia larga sin espacios.

Las mediciones comprobaron ancho máximo, ausencia de columnas comprimidas, alineación por remitente, separación vertical, orden remitente/contenido/fecha, ausencia de desbordamiento horizontal y ocupación del campo de escritura. La medición descuenta la barra de desplazamiento tradicional del escritorio.

Ejemplos de ancho observado, en píxeles:

| Vista | Pantalla | Burbuja corta | Burbuja larga | Campo de escritura |
| --- | ---: | ---: | ---: | ---: |
| Widget VITALIX | 1440 | 192 | 349 | 380 |
| Widget VITALIX | 320 | 192 | 230 | 224 |
| Página VITALIX | 1440 | 192 | 649 | 732 |
| Página VITALIX | 320 | 192 | 216 | 208 |
| Solicitudes | 1440 | 192 | 592 | 613 |
| Solicitudes | 320 | 192 | 226 | 186 |

Se generaron **18 capturas**, al inicio y final del historial de cada variante, y se inspeccionaron capturas representativas de escritorio y móvil. Para las capturas de la página VITALIX en móvil se plegaron los accesos rápidos mediante su control existente; no se cambió su estado predeterminado en el producto. Los iconos/font externos se bloquearon en la prueba para independizarla de CDN.

Evidencias:

- [VITALIX escritorio](../evidencias/chat-layout/vitalix-widget-1440-short.png).
- [VITALIX móvil con mensaje largo](../evidencias/chat-layout/vitalix-widget-320-long.png).
- [Página VITALIX móvil](../evidencias/chat-layout/vitalix-page-390-long.png).
- [Solicitudes escritorio](../evidencias/chat-layout/solicitudes-1440-short.png).
- [Solicitudes móvil](../evidencias/chat-layout/solicitudes-320-long.png).
- [Mediciones completas](../evidencias/chat-layout/measurements.json).

## Compilación y regresión

- `npm run build` en `frontend`: aprobado.
- `npm run check`: 0 errores y 0 advertencias; permanece el aviso informativo previo de `map` sin usar en `public/js/dashboard.js`.
- Regresión administrativa separada con `FRONTEND_TEST_ADMIN_ONLY=1`: **9 aprobadas, 0 fallidas**.
- Suite general `node --test tests/frontend.test.cjs`: **52 aprobadas y 2 fallos contabilizados**, correspondientes a un caso y su suite. No se considera aprobada la regresión general.

El caso `new events refresh notifications and preserve an unsent reply` no muestra «Evento nuevo» dentro del plazo al ejecutarse en la suite completa. Pasó al ejecutar por separado las pruebas administrativas. La repetición sin pruebas simultáneas reprodujo el fallo. Se investigó una posible carrera de recarga y se ensayó aislamiento de documento en el guion; no resolvieron el fallo y se retiraron esos ajustes, conservando el guion previo. No se confirmó su causa ni se cambió la lógica de notificaciones para forzar un resultado aprobado. La revisión visual y sus nueve variantes sí aprobaron. Queda pendiente diagnosticar esa diferencia entre ejecución aislada y completa; no se afirma que sea un fallo preexistente ni una regresión causada por CSS sin una comparación concluyente.

## Conservación

No se modificaron mensajes, datos, PostgreSQL, Socket.IO, autenticación, notificaciones ni permisos. No hubo consultas o escrituras contra la base principal, migraciones o pruebas de integración que creen conversaciones persistentes. Todas las operaciones de las pruebas frontend usan fixtures locales. No se hicieron commit ni push.
