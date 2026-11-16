# Solicitudes de FARMACIA: entrega funcional

Fecha: 2026-11-14. Alcance exclusivo: FARMACIA (rol 3).

## Implementado

- Listado mediante Prisma/PostgreSQL, sin fixtures ni fallback a datos inventados.
- Búsqueda exacta por ID y filtros de estados operativos combinables.
- Paginación: 25 por defecto, máximo 50, página máxima 100000; orden fecha/ID.
- Listado, total filtrado e indicadores consultados en una misma instantánea
  RepeatableRead. Los indicadores son globales a la cola, no al filtro.
- Detalle con medicamentos, cantidades, descripciones y requisito de fórmula.
- Nombres del destinatario solo en detalle; dirección solo para DOMICILIO.
  No se seleccionan documentos, contactos, contraseñas, observaciones libres,
  importes, referencias de pago o datos de tarjetas.
- Estados de carga, error y vacío independientes del catálogo/inventario.
- Modal de confirmación/cancelación antes del PATCH; sin cambio optimista.
- Recarga tras avance o conflicto 409, incluyendo detalle abierto, y ajuste de
  página si desaparece el último resultado. Se ignoran respuestas antiguas.
- Actualizar datos del panel recarga catálogo, inventario y solicitudes.
- Diseño adaptable y detalle con tabla desplazable, contenido mediante textContent.

La cola conserva su alcance previo: APROBADA, PREPARANDO, LISTA y ENTREGADA.
La opción Activas excluye entregadas; Todas las operativas incluye las cuatro.
No se habilitan operaciones ni acceso adicional sobre PENDIENTE/CANCELADA.
El indicador «Pendientes de preparar» cuenta APROBADA, explicado en pantalla;
no representa solicitudes pendientes de aprobación o de pago.

## Endpoints exclusivos de Farmacia

| Método | Ruta | Comportamiento |
|---|---|---|
| GET | `/api/farmacia/pedidos` | `id`, `estado`, `pagina`, `tamano`; lista, paginación y resumen. |
| GET | `/api/farmacia/pedidos/:id` | Nuevo detalle de una solicitud de la cola; 404 si no existe o está fuera de ella. |
| PATCH | `/api/farmacia/pedidos/:id/estado` | Estado solicitado y estado esperado; validación autoritativa en backend. |

Todas estas rutas exigen JWT válido con expiración, cuenta ACTIVO y rol actual
3 en BD. Respuestas no-store. Roles 1/2/4 rechazados sin concederles permisos.
Se conserva el resto de endpoints existentes de Farmacia.

## Transiciones y seguridad

Flujo permitido: `APROBADA -> PREPARANDO -> LISTA -> ENTREGADA`.

El navegador envía `{estadoActual, estado}`. La pareja se valida primero;
después el servicio consulta el estado persistido y deriva desde él el siguiente
estado. `estadoActual` es una precondición de concurrencia, no una fuente fiable.
La actualización atómica vuelve a exigir estado anterior, pago APROBADO con
simulacion=false, detalles no vacíos y medicamentos con requiere_formula=false.
Se excluye NULL explícitamente en el predicado de escritura.

Los saltos, retrocesos, campos adicionales e IDs fuera de rango se rechazan con
400; cambios de estado/condiciones o bloqueos operativos con 409. Fallos de
proveedor se presentan como 500 genérico. No se exponen diagnósticos de conexión.

**Fórmulas:** no existe una relación autorizada entre fórmula validada y pedido.
Por tanto, requiere_formula=true bloquea todos los avances, y NULL también.
No se interpreta una fórmula cualquiera del paciente como autorización de ese
pedido. La UI informa el bloqueo y el backend lo aplica aunque se manipule la UI.
Para desbloquear esos medicamentos hace falta autorizar y diseñar el flujo de
validación/vinculación y, si procede, sus cambios de esquema/rutas compartidas.
No se implementó ni habilitó ese flujo fuera del alcance aprobado.

## Notificaciones y otros roles

No se modificó el interruptor ni ningún .env. Su evaluación durante la lectura
real de comprobación fue false. No se aplicó su migración ni se activó el módulo.
Sus pruebas pueden habilitarlo exclusivamente en procesos aislados con dobles
en memoria; eso no cambia la configuración del proyecto o de producción.

No se cambiaron esquema Prisma, migraciones, rutas compartidas de pedidos/chat,
interfaces, servicios ni permisos de Administrador, Paciente o EPS. Los cambios
del test frontend común corresponden exclusivamente a fixtures/aserciones de
Farmacia. Se conservaron los archivos y cambios previos del usuario.

## Archivos creados

- `backend/src/config/farmacia-solicitudes.js`: estados y transiciones.
- `backend/src/validators/farmacia-solicitudes.validator.js`: filtros, ID y body.
- `frontend/public/js/farmacia-solicitudes.js`: interacción de solicitudes.
- `backend/tests/farmacia-solicitudes.test.cjs`: API, seguridad y navegador aislados.
- Este informe.

## Archivos modificados en esta fase

- `backend/src/routes/farmacia.routes.js`.
- `backend/src/controllers/farmacia.controller.js`.
- `backend/src/services/farmacia.service.js`.
- `backend/src/repositories/farmacia.repository.js`.
- `frontend/src/components/FarmaciaOperaciones.astro`.
- `frontend/public/js/farmacia.js`.
- `frontend/public/css/farmacia.css`.
- `backend/tests/farmacia-api.test.cjs`.
- `backend/tests/farmacia-notificaciones.test.cjs`: adaptación de su doble de
  solicitudes y espera de botones disponibles en su prueba de navegador.
- `backend/tests/frontend.test.cjs`: contrato, confirmación, etiquetas y menú de
  Farmacia; ninguna aserción de otros roles fue eliminada o relajada.

## Comprobaciones

- Compilación Astro: aprobada.
- Sintaxis del nuevo módulo frontend y git diff --check: aprobados.
- Selección de 19 suites: **150 pruebas aprobadas, 0 fallidas, 0 omitidas**.
  Incluye las nuevas pruebas de filtros, detalle, paginación, datos mínimos,
  autorización, estados reales, pagos simulados, fórmulas/NULL, fallos, condiciones
  concurrentes y regresión de roles, pedidos, catálogo, chat y notificaciones.
- Regresión completa `node --test --test-reporter=spec tests/frontend.test.cjs`:
  **54 pruebas aprobadas, 0 fallidas, 0 omitidas**, incluidos Administrador,
  Paciente y EPS. Sin excepciones JavaScript propias. Ambos grupos suman
  204 comprobaciones aprobadas en las ejecuciones finales.
- Edge con servidor HTTP real local y Prisma en memoria: búsqueda, detalle,
  cancelación sin PATCH, confirmación, recarga, rechazo de HTML inyectado,
  bloqueo de fórmula y estados vacío/error; sin excepciones JS.
- Geometría del panel: 1440, 820 y 390 píxeles, aprobada.
- Comprobación REAL con las nuevas capas de listado y detalle en Neon: aprobada,
  sin escrituras. Listado/resumen en transacción READ ONLY; detalle es SELECT.
  Resultado agregado: una solicitud operativa ENTREGADA; cero pendientes de
  preparar, cero en preparación y cero listas. No se mostraron datos personales.

Los ensayos de avances usan únicamente datos en memoria. No se actualizaron
estados reales para probar botones. Las pruebas no certifican una escritura
concurrente real ni una transición real en Neon. Eso requiere un entorno
PostgreSQL aislado autorizado.

## Problemas encontrados y resueltos

- El listado no revalidaba la cuenta/rol vigente: ahora usa el mismo control
  estricto del avance y del nuevo detalle.
- El estado del navegador intervenía en la decisión: ahora se consulta BD y
  se conserva la comparación atómica al escribir.
- No existía barrera de fórmulas en el avance: ahora se bloquea y revalida en
  escritura, incluso requisitos desconocidos o modificados concurrentemente.
- Exposición de nombres/direcciones en todo el listado: limitada al detalle.
- Actualización general incompleta: también recarga solicitudes e inventario.
- No existían búsqueda, detalle, resumen ni confirmación del cambio.
- Pruebas antiguas conservaban el contrato/etiquetas anteriores y un menú de
  ocho opciones que no contaba Notificaciones. Se actualizaron solo las de Farmacia.
- La prueba de lectura masiva de Notificaciones podía pulsar durante carga;
  ahora espera un botón habilitado, sin cambiar la funcionalidad de ese módulo.

## Pendiente y límites

- Flujo autorizado de revisión farmacéutica y vínculo fórmula-pedido. Hasta
  entonces, los medicamentos que requieren fórmula o no tienen ese requisito
  determinado permanecen bloqueados; no se modificaron datos para desbloquearlos.
- Ensayo de concurrencia/transacciones contra PostgreSQL aislado.
- Aprobación y despliegue posteriores: no se publicó ni reinició producción.
- Conciliación histórica y activación de Notificaciones siguen fuera de esta fase.

No hubo migraciones, escrituras de datos reales, commit ni push.
