# Farmacia — Fase 2: Usuarios y pantallas independientes

Fecha: 2026-11-15. Rama: `integracion/farmacia-pendientes`.
HEAD conservado: `fafb09852f7ce7c8f097dd4e5f5f6ee6e7aa2a4a`.
Las fases 1 y 2 permanecen como cambios locales, sin staging, commits ni push.

## Resultado y límite de Usuarios

La organización del panel y la retirada de Fórmulas están implementadas y verificadas. La restauración funcional de Usuarios queda **BLOQUEADA**: se recuperó su opción y una pantalla que informa que la consulta no está habilitada, pero no se añadió listado, detalle, filtros, acciones ni acceso a cuentas sin una autorización verificable.

Se inspeccionaron el historial y las referencias locales con `git log --all`, búsquedas de cambios por `Usuarios`/`usuarios`, los archivos históricos de Farmacia y las rutas administrativas. No se aplicó ni eliminó ningún stash.

| Evidencia histórica | Resultado |
|---|---|
| `f94fca6` y `f162143`, `backend/src/routes/farmacia.routes.js` | Solo comprobación de acceso de Farmacia; no hay endpoint de usuarios |
| `04b197d`, página, JavaScript y rutas de Farmacia | Dashboard y consulta de medicamentos; no aparece Usuarios |
| `697f7d7` y evolución posterior | Solicitudes e inventario; no aparece un directorio autorizado de usuarios de Farmacia |
| `f94fca6`, `backend/src/routes/admin.routes.js` | `GET /cuentas` y `DELETE /cuentas/:id` exigen `requireAdmin`; no son permisos recuperables para Farmacia |
| Implementación vigente y referencias disponibles | No se encontró una ruta de Usuarios propia de Farmacia con ámbito autorizado |

Esto no demuestra que el módulo nunca existiera fuera del historial disponible. No permite acreditar qué permisos de Farmacia tenía. Falta identificar su commit/rama/ruta original, los endpoints y middleware correspondientes, los campos consultables y la relación que delimita los usuarios autorizados. Se solicitó esa referencia durante el trabajo.

No se reutilizó el directorio de Administrador ni se crearon permisos nuevos. Usuarios no hace peticiones a cuentas, afiliados, fórmulas ni listados de usuarios; únicamente pasa por la comprobación común de acceso vigente.

## Menú y rutas

Las nueve pantallas usan `FarmaciaLayout.astro`, con menú lateral común, encabezado, enlace activo, campana y cierre de sesión. Antes de iniciar el módulo se verifica `/api/farmacia/verificar-acceso`; un rechazo mantiene oculto el contenido y no consulta su API de datos.

| Módulo | Ruta | Comportamiento |
|---|---|---|
| Dashboard | `/pages/farmacia.html` | Solo indicadores y resúmenes; enlaces a las pantallas operativas |
| Usuarios | `/pages/farmacia-usuarios.html` | Consulta no habilitada, sin registros ni acciones |
| Solicitudes | `/pages/farmacia-solicitudes.html` | Listado, filtros, ID, paginación, detalle, confirmación y transiciones existentes |
| Inventario | `/pages/farmacia-inventario.html` | Consulta existente, búsqueda, filtros, detalle y paginación |
| Medicamentos | `/pages/farmacia-medicamentos.html` | Catálogo existente en su propia pantalla |
| Entregas | `/pages/farmacia-entregas.html` | Reutiliza Solicitudes, limitada en la interfaz a LISTA/ENTREGADA, con los mismos bloqueos del backend |
| Notificaciones | `/pages/farmacia-notificaciones.html` | Pantalla preparada; servicio real desactivado |
| Chat | `/pages/farmacia-chat.html` | Reutiliza el componente React dentro del marco común, sin otra barra de navegación ni otro elemento main |
| Perfil | `/pages/farmacia-perfil.html` | Formulario compartido existente, con seguridad y validaciones de la Fase 1 |

Los fragmentos antiguos conocidos del dashboard redirigen a las pantallas equivalentes. El enlace al chat conserva el retorno autorizado y los filtros; los destinos externos, administrativos o clínicos no se aceptan como retorno. Los filtros de ID, disponibilidad y requisito de fórmula se conservan al recargar.

La ruta histórica `/pages/chat-farmacia.html` mantiene el acceso del paciente; Farmacia se redirige al nuevo marco común. El componente no inicia consultas de chat antes de que termine la comprobación de acceso de la pantalla nueva.

## Fórmulas y seguridad

- Se retiró la entrada visual de Fórmulas del menú de Farmacia. No existe una ruta ni panel de gestión de Fórmulas en las pantallas nuevas.
- Se conservan los datos informativos de requisito de fórmula en medicamentos, inventario y solicitudes. Son necesarios para explicar los bloqueos de dispensación.
- No se modificaron modelos, documentos, migraciones, endpoints de fórmulas ni controles del backend.
- No se modificó código de ejecución del backend durante esta fase. Se mantienen las correcciones locales de la Fase 1 y sus pruebas de revocación, cuentas inactivas, perfil, participantes y sesiones Socket.IO.
- Entregas no inventa responsable, receptor, evidencia ni fecha efectiva: la pantalla informa que ese registro sigue pendiente. Confirmar una entrega sigue pasando por la transición ya autorizada del backend.
- El flag de Notificaciones conserva su comportamiento desactivado por defecto. Las pruebas de preparación utilizan datos y habilitación aislados, sin activar el módulo real.

## Reutilización y archivos

Nuevos archivos de interfaz:

- `frontend/src/layouts/FarmaciaLayout.astro`
- `frontend/src/pages/pages/farmacia-usuarios.astro`
- `frontend/src/pages/pages/farmacia-solicitudes.astro`
- `frontend/src/pages/pages/farmacia-inventario.astro`
- `frontend/src/pages/pages/farmacia-medicamentos.astro`
- `frontend/src/pages/pages/farmacia-entregas.astro`
- `frontend/src/pages/pages/farmacia-notificaciones.astro`
- `frontend/src/pages/pages/farmacia-chat.astro`
- `frontend/src/pages/pages/farmacia-perfil.astro`
- `frontend/public/js/farmacia-dashboard.js`
- `frontend/src/components/PerfilFormulario.astro`

Archivos de interfaz ajustados:

- `frontend/src/pages/pages/farmacia.astro`
- `frontend/src/components/FarmaciaOperaciones.astro`
- `frontend/src/components/FarmaciaChat.jsx`
- `frontend/public/css/farmacia.css`
- `frontend/public/js/farmacia.js`
- `frontend/public/js/farmacia-context.js`
- `frontend/public/js/farmacia-solicitudes.js`
- `frontend/public/js/farmacia-existencias.js`
- `frontend/public/js/farmacia-notificaciones.js`
- `frontend/public/js/perfil.js`
- `frontend/public/js/roles.js`

El archivo compartido `frontend/public/pages/perfil.html` se trasladó a `frontend/src/pages/pages/perfil.astro`. Conserva la URL `/pages/perfil.html`, sus enlaces, scripts, permisos y comportamiento; el formulario se extrajo a `PerfilFormulario.astro` y se reutiliza en Farmacia. Se comprobó que el formulario coincide con el original, normalizando únicamente finales de línea. No hay dos copias del formulario.

Pruebas adaptadas a la separación, sin retirar los casos de seguridad o interacción:

- `backend/tests/frontend.test.cjs`
- `backend/tests/frontend-roles.test.cjs`
- `backend/tests/farmacia-solicitudes.test.cjs`
- `backend/tests/farmacia-existencias.test.cjs`
- `backend/tests/farmacia-notificaciones.test.cjs`
- `backend/tests/support/farmacia-panel-browser.cjs`
- `backend/tests/farmacia-pages.test.cjs` (nuevo)

Solicitudes y Entregas reutilizan un componente. Inventario y Medicamentos reutilizan otro. Cada pantalla inicia solamente su módulo. El Dashboard solicita los resúmenes de solicitudes y existencias con tamaño mínimo de página; no monta sus listados completos. Las otras pantallas no consultan notificaciones para un contador que sigue sin estar habilitado.

## Verificación final

| Verificación | Resultado |
|---|---|
| Suite completa secuencial, aislamiento de base y Edge headless | **532 aprobadas; 0 fallidas; 0 omitidas**, 165,74 s |
| Pruebas frontend `.test.mjs` | **6 aprobadas; 0 fallidas** |
| Pruebas dirigidas de Fase 1 y matriz de roles | 15 aprobadas, incluidas en la suite completa |
| `npm run build` | Aprobado; 18 páginas Astro compiladas |
| `npm run check` | 0 errores; 0 advertencias; una sugerencia previa de variable sin uso en `public/js/dashboard.js` |
| Prisma `validate` | Aprobado; sin migraciones |
| Formulario compartido frente al original | Coincide |
| `git diff --check` | Sin errores de espacios |

Comando de regresión, desde backend:

```text
node --require ./tests/support/isolate-database.cjs --test --test-concurrency=1 tests/*.test.cjs
```

Las pruebas nuevas recorren las nueve pantallas a 1440/820/390 px, verifican el menú y enlace activo, un único main/h1, la ausencia de gestión de Fórmulas, las llamadas únicas necesarias a la API, el bloqueo de acceso revocado antes de cargar datos y el retorno seguro de rutas antiguas. También verifican que Usuarios no pide datos de usuarios ni de Administrador.

La regresión conserva búsqueda, filtros, detalle, confirmación/cancelación, prevención de doble transición, recuperación de errores, foco del operador, recarga, navegación, chat, perfil y ausencia de excepciones JavaScript propias. Pasaron las pruebas de Administrador, Paciente y EPS, incluidas las del perfil compartido y chat del paciente.

La primera pasada detectó expectativas de pruebas sobre el panel combinado y rutas sin redirección. Se actualizaron esas expectativas y se hizo explícito el aviso de indicadores sin actualizar en Solicitudes. La ejecución final anterior corresponde al código corregido.

Evidencia temporal: `C:\Users\SAMIRA~1\AppData\Local\Temp\saludclick-fase2-final-OCXMI7\tests.tap` y capturas de dashboard, solicitudes, inventario y chat en el mismo directorio. Se inspeccionaron capturas del dashboard en escritorio y del chat móvil. Solo contienen datos ficticios.

No hubo conexión a Neon ni escrituras de registros reales. La persistencia con PostgreSQL aislado sigue pendiente de un entorno de pruebas configurado; estos resultados no certifican escrituras reales sobre Neon ni completan inventario, entregas o autorizaciones clínicas.

## Estado conservado y siguiente paso

Se conservan los cambios de la Fase 1, los archivos no rastreados previos de Administrador, sus respaldos y el stash `farmacia-pendientes-respaldo-20261114`. No se hicieron commits, push ni fusiones.

Para completar Usuarios se necesita la referencia original y comprobar su ámbito y permisos antes de conectar una lista o habilitar acciones. Mientras no exista esa evidencia, la fase queda parcialmente completada por ese punto, aunque las pantallas y pruebas implementadas estén aprobadas.
