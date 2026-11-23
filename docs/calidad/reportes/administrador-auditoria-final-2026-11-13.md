# Auditoría final del Administrador — 13 de noviembre de 2026

**Conclusión: NO APROBADO para certificar funcionamiento al 100 %.** Hay defectos de Configuración y quedan sin ejecutar las verificaciones de persistencia, concurrencia y Socket.IO real contra PostgreSQL aislado. No se asigna porcentaje.

Código examinado: rama `main`, HEAD `9c0b0a91e3cc138b5de5727300dc5e0a0556a5f8`. El árbol de archivos versionados estaba limpio al comenzar. Se revisó el merge contra su primer padre y las rutas, servicios, repositorios, interfaz y pruebas actuales. No se aplicaron correcciones.

## Estado por módulo

| Módulo | Estado | Pruebas | Problemas | Acción necesaria |
|---|---|---|---|---|
| Dashboard | Verificado parcialmente | SQL de agregación, contratos, navegador y cuatro anchos | No se contrastaron cifras con bases reales; depende de que la fuente EPS esté disponible | Validar conteos en entorno autorizado y ejecutar integración aislada |
| Usuarios | Verificado parcialmente | Directorio, identidades, filtros, búsqueda, paginación, detalle y permisos; navegador con 5 cuentas y 50 afiliados sintéticos | Las cantidades actuales reales no están confirmadas | Contrastar conteos con lectura autorizada; verificar integración real aislada |
| Solicitudes | Verificado parcialmente | Reutilización de conversación, propiedad, cierre/reapertura, respuestas, reintentos y conservación de borrador; VITALIX en navegador | Persistencia PostgreSQL, concurrencia y reconexión con Socket.IO real pendientes | Ejecutar suite aislada, incluida modalidad `--browser` |
| Notificaciones | Verificado parcialmente | Destinatario, contador, eventos simulados, lectura individual y masiva, conservación de borrador | Persistencia/entrega real pendientes; socket abierto no revalida revocaciones | Completar integración y revocar conexiones existentes |
| Informes | Verificado parcialmente | Filtros, fechas inválidas, consultas vacías del directorio, errores sanitizados, CSV/PDF, resúmenes y descargas desde navegador | Integridad SQL sobre PostgreSQL y representación visual de todos los PDF no comprobadas | Ejecutar integración y cotejar exportaciones con fixtures SQL |
| Configuración | Con defectos confirmados | Formularios, validación, permisos y guardado simulado; recarga; cuatro anchos | FAQ sin integración con VITALIX; parámetros sin aplicación; vista compacta no restaurada al abrir Dashboard; recorte de botón en tableta | Corregir después de autorización y probar persistencia real |

## Hallazgos y ubicaciones

### Críticos

Ninguno confirmado en el alcance ejecutado. Esto no equivale a certificar ausencia de vulnerabilidades.

### Altos

**A1 — La suite PostgreSQL administrativa puede escribir en la base configurada en `.env`.** `backend/tests/administrative.postgres.cjs:3`, `:11`, `:22`. Carga dotenv, importa Prisma de aplicación y crea usuarios dentro de una transacción sin exigir `TEST_DATABASE_URL` ni comprobar el destino aislado. El rollback no evita la ejecución de escrituras contra ese destino. **No se ejecutó esa suite.** Es un riesgo de la herramienta de pruebas, no evidencia de una modificación real ni de una intrusión. Antes de utilizarla, exigir la misma barrera de aislamiento de `tests/support/postgres-test-safety.cjs` y sustituir también sus dependencias de directorio/EPS por fuentes aisladas.

### Medios

**M1 — Las FAQ administrables no llegan a VITALIX.** `frontend/public/js/administrative.js:88`, `:92`; `frontend/src/components/Chat.jsx:14`, `:26`; `backend/src/controllers/administrative.controller.js:64`. El panel guarda FAQ y existe un endpoint, pero Chat usa `RESPUESTAS` fijas y no consulta `/api/administrativo/faq`. Además, ese endpoint requiere cuenta mientras VITALIX permite visitantes. Definir y conectar una proyección pública segura de FAQ para los usuarios previstos, conservando las restricciones de roles.

**M2 — Nombre y mensaje configurados sin efecto visible en el panel.** `frontend/public/js/administrative.js:85`, `:88`, `:92`; `frontend/public/pages/admin.html:7`, `:12`, `:30`. Sus valores se leen para rellenar el formulario; no actualizan los elementos correspondientes del panel. En el servidor sintético, GET confirmó ambos valores guardados y una recarga del Dashboard no los mostró. Aplicarlos al lugar de presentación acordado; si son solo metadatos, explicitar ese alcance en la interfaz.

**M3 — Preferencia compacta no aplicada al recargar directamente Dashboard.** `frontend/public/js/administrative.js:87`, `:92`, `:116`. La clase se aplica al entrar en Configuración o guardar allí, pero no en el arranque general. Reproducción sintética: persistir `compacto:true`, recargar Dashboard; GET mantiene `true` y `body.classList.contains('compact')` devuelve `false`. Recuperar preferencias al iniciar el panel.

**M4 — Revocación de sesión no desconecta sockets ya abiertos.** `backend/src/sockets/administrative.socket.js:5`, `:14`, `:16`, `:25`, `:35`. Hallazgo por inspección: el guard verifica estado/rol/revocación durante el handshake y programa desconexión por `exp`, pero no vuelve a verificar al cambiar contraseña, estado o rol. El antiguo socket puede seguir recibiendo invalidaciones y los identificadores de conversación de su sala hasta expirar. Los cuerpos se recuperan por HTTP con guard vigente, lo que limita la exposición. Invalidar conexiones existentes ante esos cambios y añadir una prueba real. Tampoco se ajusta el temporizador de visitantes a la caducidad restante de su sesión: usa una hora fija.

### Bajos

**B1 — Botón recortado en tableta.** `frontend/public/css/administrative.css:1`; formulario generado en `frontend/public/js/administrative.js:88`. A 768 px, la distribución de dos columnas deja estrecho «Guardar parámetros»; la medición detectó contenido mayor que el ancho interior y la captura confirma el recorte. Ajustar el reparto del formulario o el punto de cambio de columnas. Evidencia: `.audit-admin-visual/configuracion-768.png`.

**B2 — Algunas entradas estructurales inválidas producen error interno en lugar de validación.** `backend/src/services/administrative.service.js:19`, `:20`, `:23`. `valor:null` para `general` o `[null]` para `faq` accede a propiedades sin comprobar el objeto; el controlador lo convierte en 500 genérico. Validar estructura antes de leer campos y responder 400. Hallazgo por lectura del código; no se atribuye a una prueba HTTP realizada.

## Seguridad

- Login: se revisó la comparación bcrypt y emisión de JWT; `backend/src/utils/jwt.js:13` fija ocho horas. Los contratos prueban autorización con cuentas y claves sintéticas. No se inició sesión con credenciales reales.
- Sesión administrativa: comprueba firma, cuenta ACTIVO, rol actual y revocación en base; fallos de esquema producen 503 sin detalles privados. Las pruebas verifican denegación de accesos ajenos y operaciones administrativas desde otros roles.
- Rutas clínicas/farmacéuticas: el límite administrativo las rechaza; no se crearon funciones clínicas.
- Conversaciones: propiedad en consultas SQL, aislamiento por hash de visitante y filtrado de campos internos; se probaron contratos y validadores, pero no se ejecutó la validación de aislamiento con PostgreSQL y sockets reales.
- Entradas/salidas: SQL con parámetros, listas de campos/roles, escape HTML, rate limit de escrituras y neutralización de fórmulas CSV revisados. La palabra `Unsafe` en Prisma no implica por sí sola interpolación de entradas: las consultas revisadas enlazan parámetros.
- Cookies: esta sesión usa Bearer y almacenamiento web, no cookies de autenticación. Por tanto, HttpOnly/SameSite/Secure no son propiedades verificadas de una cookie administrativa existente. `frontend/public/js/auth.js:54` permite localStorage/sessionStorage; el token es accesible a JavaScript y una eventual XSS podría sustraerlo. Se revisó escape de salidas, sin demostrar una explotación XSS.
- Secretos: no se imprimieron ni modificaron archivos `.env`, ni se usaron credenciales reales. No se certifica ausencia absoluta de secretos en todo el historial Git, dependencias, artefactos y configuración de producción. La revisión no incluyó un escáner completo de historial ni análisis de vulnerabilidades de dependencias.
- HTTPS, cookies ajenas a esta sesión, proxy y configuración productiva quedan fuera de la evidencia local.

## Resultados exactos

| Ejecución | Aprobadas | Fallidas | Omitidas | Canceladas | Resultado |
|---|---:|---:|---:|---:|---|
| Inicial: `node --test tests/*.test.cjs` | 412 | 1 | 0 | 0 | Edge no pudo abrir DevTools dentro del sandbox; no se clasifica como regresión funcional |
| Reejecución de backend excluyendo `frontend.test.cjs` | 411 | 0 | 0 | 0 | Incluye Administrador, chat, Socket.IO con dobles, límites de acceso y pruebas relacionadas de otros roles |
| `node --test tests/frontend.test.cjs`, fuera del sandbox | 54 | 0 | 0 | 0 | 52 subpruebas y dos pruebas de nivel superior; navegador local y respuestas sintéticas |
| Frontend: `node --test tests/*.test.mjs` | 6 | 0 | 0 | 0 | Motor VITALIX y resumen de afiliados |
| `npm.cmd run build` | — | — | — | — | Astro completó la compilación; 9 páginas generadas, además de recursos públicos |

Las ejecuciones finales suman **471 pruebas aprobadas**, sin sumar otra vez la ejecución inicial. El fallo inicial queda registrado y se resolvió al reejecutar el archivo de navegador fuera del sandbox.

Comprobación visual adicional: **24 vistas** (seis secciones × 1440, 768, 390 y 320 px), cero excepciones JavaScript capturadas y cero desbordamientos horizontales de documento en esos estados. Un recorte detectado en Configuración a 768 px. Las tablas usan desplazamiento interior. Las capturas son sintéticas; no cubren todas las combinaciones de datos, diálogos, errores ni tamaños posibles. La suite de navegador también verificó conversaciones con mensajes y navegación móvil; no se certifica cada estado visual del chat en tableta.

**No ejecutadas/completadas:**

1. Suite `administrative-chat.isolated.cjs`: el runner se intentó dentro y fuera del sandbox; ambos finalizaron antes de entrar a la suite con `ISOLATED_CONTAINER_UNAVAILABLE`. No produjo conteos TAP y no debe contarse como una prueba omitida ni como un fallo de producto.
2. Modalidad aislada `--browser`: no ejecutada por la misma dependencia ausente.
3. `administrative.postgres.cjs`: no ejecutada por A1 y ausencia de base aislada disponible.
4. `postgres.integration.cjs` y demás integraciones PostgreSQL de afiliados: no ejecutadas; no se preparó ni migró ninguna base.
5. Login real del Administrador, conteos actuales 5/50, migraciones aplicadas y permisos efectivos de las bases principales/EPS: no verificados por falta de autorización para credenciales reales. No se dan por vigentes las cantidades históricas.

Logs de esta ejecución en raíz: `.audit-admin-backend.log`, `.audit-admin-backend-no-browser.log`, `.audit-admin-browser.log`, `.audit-admin-frontend.log`, `.audit-admin-build.log`, `.audit-admin-isolated.log`, `.audit-admin-isolated-retry.log`, `.audit-admin-visual.log`. Capturas y resultados: `.audit-admin-visual/measurements.json` y 24 PNG. Algunos logs están ignorados por las reglas existentes de Git; no se cambiaron esas reglas.

## Integración y regresiones

Los seis módulos llaman a `/api/administrativo` y el router está conectado en `backend/src/routes/index.js`. Se verificó el recorrido frontend/contratos con sustitutos del almacenamiento; esto no demuestra despliegue del esquema en las bases reales.

El merge `9c0b0a9` incluye cambios de Paciente, Farmacia y EPS respecto de su primer padre. Por ello no es correcto afirmar que ese commit no los tocó. En esta auditoría no se modificó ninguno. Las pruebas relacionadas de permisos y los escenarios de navegador de esos roles pasaron; esto reduce el riesgo de regresión, sin cubrir todas sus operaciones con PostgreSQL real.

Los hallazgos describen el estado de HEAD. No se ejecutó la versión anterior en un segundo entorno, por lo que no se atribuye automáticamente cada defecto al merge.

## Acciones para autorizar la aprobación

1. Corregir A1 antes de ejecutar esa suite; disponer de PostgreSQL aislado con datos ficticios y fuentes EPS de prueba.
2. Corregir M1–M4 y B1–B2 con autorización previa; mantener alcance administrativo y colores actuales.
3. Ejecutar integración real de los seis módulos, VITALIX anónimo/autenticado, persistencia tras reinicio, concurrencia, reconexión y expiración/revocación de sockets; cotejar CSV/PDF con los fixtures SQL.
4. Revalidar escenarios visuales modificados, incluida tableta, errores y conversaciones largas.
5. Si se necesita confirmar cantidades actuales o configuración productiva, realizar una lectura expresamente autorizada y acotada; no inventar esos resultados.

## Archivos y protección de datos

No se modificó código de aplicación, pruebas existentes, diseño, credenciales ni `.env`. No se ejecutaron migraciones, commits, push o despliegues. No se abrió conexión a bases principales ni se modificaron usuarios reales o las 50 personas EPS. Las escrituras de navegador fueron a fixtures en memoria; los usuarios de esas pruebas son sintéticos. No se enviaron correos.

Se añadieron únicamente este informe, `.audit-admin-visual.cjs` (herramienta de auditoría) y `.audit-admin-visual/` (24 PNG y un JSON), más logs y artefactos generados por la compilación. `git diff` de archivos previamente versionados quedó vacío al terminar las verificaciones. El informe y las evidencias son archivos nuevos sin commit.
