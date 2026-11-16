# FARMACIA: Inventario y Medicamentos

Fecha: 2026-11-14. Entrega de consultas funcionales y propuesta de operaciones.
Alcance exclusivo: rol 3. Sin migraciones, escrituras en Neon, commit, push,
activación de Notificaciones o cambios de funcionalidades/permisos de otros roles.

## Inspección del esquema y flujo de stock

`Medicamento` se almacena en `medicamentos`, con `stock Int @default(0)` y
`estado` nullable DISPONIBLE/AGOTADO/INACTIVO. Tiene categoría obligatoria,
nombre, descripción, presentación, nombre genérico, principio activo,
concentración, forma farmacéutica, vía, registro sanitario/estado INVIMA,
CUM/IUM, titular, modalidad, indicador de catálogo verificado y fechas.
`requiere_formula` es Boolean nullable: NULL significa desconocido.

Relaciones disponibles: Categoria, ImagenMedicamento, ObservacionPrecio,
DetalleSolicitud y Recordatorio. No se consultan pacientes, solicitudes ni
recordatorios desde estas nuevas pantallas.

No hay modelos de lotes, vencimientos, stock mínimo o movimientos en Prisma.
La inspección de metadatos de `medicamentos` en Neon tampoco encontró columnas
de lote/vencimiento/mínimo. No se asumen estructuras ni permisos de EPS para
rellenar esa carencia.

El flujo compartido de compra, en `order.repository.js`, bloquea medicamentos
con SELECT FOR UPDATE, comprueba saldo y precio, descuenta `stock-cantidad`
y registra pedido/detalle/pago dentro de una transacción. Las cantidades se
validan antes en el servicio de pedidos. El saldo ya se descuenta al crear el
pedido; el avance de Farmacia no vuelve a descontarlo. No se cambió ese flujo.

Problemas previos identificados fuera del alcance de corrección:

- El descuento no sincroniza estado AGOTADO ni updated_at.
- La eliminación de pedidos borra registros sin reposición de stock.
- El flujo actual puede descontar stock para compras con pago simulado.
  Farmacia conserva su bloqueo de avances/dispensación basados en esos pagos.
- No hay CHECK de saldo no negativo en el modelo. La garantía global de BD
  necesita una migración revisada, no una corrección durante GET.

El stock consultado es el saldo registrado por la aplicación. No acredita
un conteo físico, trazabilidad por lote o disponibilidad para una entrega
concreta ya reservada.

## Funcionalidades implementadas

- Inventario y catálogo paginados desde Prisma/PostgreSQL, sin datos ficticios.
- Búsqueda por nombre, nombre genérico, principio activo, presentación,
  registro sanitario y CUM, sin interpolar entradas en SQL.
- Filtros combinables de disponibilidad y requisito de fórmula.
- Páginas de 25 por defecto, máximo 50; página máxima 100000; orden nombre/ID.
- Indicadores globales de total, disponibles y agotados. Listado, total filtrado
  e indicadores se consultan en la misma instantánea RepeatableRead.
- Detalle de inventario y medicamento con datos farmacéuticos existentes.
- Requisito de fórmula explícito: REQUIERE, NO_REQUIERE, DESCONOCIDO.
- Recarga por sección y desde Actualizar datos del panel, con descarte de
  respuestas antiguas y ajuste de página si desaparecen resultados.
- Carga, error y vacío diferenciados. Contadores no disponibles muestran —,
  no ceros ficticios. Los NULL farmacéuticos se muestran como Sin registrar.
- Tablas desplazables y diálogos adaptables; contenido insertado con textContent.
- No hay creación, edición, eliminación, ajuste de stock o botón de dispensación.

## Disponibilidad y tratamiento de inconsistencias

| Clasificación | Regla |
|---|---|
| Disponible | estado DISPONIBLE y stock > 0 |
| Agotado | stock = 0 y estado DISPONIBLE o AGOTADO |
| Inactivo | estado INACTIVO y stock >= 0 |
| Inconsistente | stock < 0, o estado AGOTADO con stock > 0 |
| Desconocido | estado NULL y stock >= 0 |

Un estado DISPONIBLE con cero stock ya no aparece como disponible. Un saldo
negativo se conserva como evidencia del registro y se rotula inválido/no
utilizable; NO se reemplaza por cero ni se corrige en la consulta.

Estas funciones no pueden generar stock negativo porque solo leen. No se
afirma que exista una garantía global de BD contra escritores externos: el
CHECK correspondiente forma parte de la propuesta pendiente.

La disponibilidad de existencias es independiente de la autorización de
dispensación. Los medicamentos que requieren fórmula o cuyo requisito se
desconoce siguen bloqueados por las reglas existentes de Solicitudes. No se
equipara catálogo verificado o registro sanitario con validación de fórmula.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/farmacia/inventario` | Existencias, filtros, paginación y resumen |
| GET | `/api/farmacia/inventario/:id` | Nuevo detalle de inventario |
| GET | `/api/farmacia/medicamentos` | Nuevo catálogo paginado y filtrado |
| GET | `/api/farmacia/medicamentos/:id` | Nuevo detalle farmacéutico |

Query permitida: `buscar` (máximo 150 caracteres sin controles), `pagina`,
`tamano`, `disponibilidad=todas|disponibles|agotados|inactivos|inconsistentes|desconocidos`,
`formula=todas|requiere|no-requiere|desconocido`.

Se rechazan parámetros adicionales, arrays en valores escalares e IDs fuera
del rango de integer de PostgreSQL. Detalles no admiten filtros; inexistentes
responden 404. Errores de entrada 400, autenticación 401, permisos 403 y errores
internos 500 con mensaje público sin diagnósticos del proveedor.

Las cuatro rutas exigen JWT con expiración, cuenta ACTIVO y rol actual 3 en BD,
con no-store. Se refuerza también `/api/farmacia/dashboard` con ese guard, sin
eliminar su contrato anterior. La interfaz nueva usa el catálogo paginado y
ya no descarga el catálogo completo mediante el dashboard legado.
La ruta compartida `/api/medicamentos` de otros roles no fue modificada.

## Archivos creados

- `backend/src/controllers/farmacia-existencias.controller.js`
- `backend/src/services/farmacia-existencias.service.js`
- `backend/src/repositories/farmacia-existencias.repository.js`
- `backend/src/validators/farmacia-existencias.validator.js`
- `backend/tests/farmacia-existencias.test.cjs`
- `frontend/src/components/FarmaciaExistencias.astro`
- `frontend/public/js/farmacia-existencias.js`
- Este informe y propuesta.

## Archivos modificados en esta fase

- `backend/src/routes/farmacia.routes.js`: consultas y guards exclusivos.
- `frontend/src/pages/pages/farmacia.astro`: componente de catálogo paginado.
- `frontend/src/components/FarmaciaOperaciones.astro`: componente de inventario.
- `frontend/public/js/farmacia.js`: inicialización única de los tres módulos,
  identidad/logout y recargas; conserva la guardia de pantalla.
- `frontend/public/css/farmacia.css`: estilos acotados a las nuevas consultas.
- `frontend/public/js/farmacia-solicitudes.js`: corrección de una carrera al
  cerrar/reabrir diálogos; un evento close antiguo ya no borra la nueva selección.
  No se cambiaron transiciones, bloqueos o permisos.
- `backend/tests/farmacia-api.test.cjs`: contrato ampliado de búsqueda/selección.
- `backend/tests/frontend.test.cjs`: fixtures exclusivos de Farmacia para el
  nuevo catálogo, resumen y requisitos; conserva comprobaciones de otros roles.

## Verificación ejecutada

- Compilación Astro y sintaxis del nuevo JS: aprobadas.
- Selección final de 21 suites con ejecución secuencial y navegador Edge:
  **213 comprobaciones aprobadas, 0 fallidas, 0 omitidas**.
- Incluye filtros combinados, búsqueda, paginación, detalle, JWT, cuenta
  desactivada/rol cambiado, aislamiento de roles, errores, stock inconsistente,
  fórmula desconocida y comprobación de que las consultas no llaman a escrituras.
- Los endpoints de consulta no ofrecen POST/PATCH/DELETE. Pruebas en memoria
  confirman que el estado original de los medicamentos no cambia.
- Navegador: búsqueda, filtro, paginación, detalle, recarga, vacío, error,
  protección frente a HTML y responsive a 1440, 820 y 390 píxeles; sin
  excepciones JavaScript. Regresión completa de las interfaces anteriores aprobada.
- Persisten las pruebas de bloqueo de pagos simulados, fórmulas requeridas/NULL
  y control de concurrencia de Solicitudes.
- Lectura REAL de Neon con las nuevas capas Prisma: inventario, catálogo,
  filtro y detalle aprobados. Transacciones de listados/metadatos READ ONLY;
  detalle mediante SELECT. Solo se mostraron conteos y metadatos.
- Resultado real: 7 medicamentos; 7 disponibles; 0 agotados, inactivos,
  inconsistentes o de estado desconocido. Notificaciones evaluó false.

El primer intento de Edge en sandbox falló al abrir DevTools; se repitió fuera
del sandbox con los mismos servidores y datos aislados. La regresión detectó
la carrera de diálogo descrita arriba, corregida y revalidada en la ejecución
final. Ninguna prueba de escritura utilizó Neon; sus fixtures viven en memoria.

## Propuesta técnica pendiente de aprobación — NO implementada

Antes de crear tablas o habilitar escrituras deben confirmarse estas reglas:

1. **Significado del saldo:** decidir stock físico, reservado y disponible.
   Resolver cuándo se descuenta y cuándo se libera una reserva. No añadir una
   segunda salida al entregar: hoy el pedido ya descontó stock al crearse.
2. **Pagos simulados:** separar el entorno/reserva de prueba de cualquier
   movimiento real. Resolverlo exige revisar el flujo compartido de pedidos;
   no se modificó en esta entrega.
3. **Entradas:** cantidad positiva, origen documental, responsable autorizado,
   fecha y, cuando exista, lote y vencimiento. Registrar movimiento y saldo
   en una transacción. Rechazar reintentos duplicados por clave idempotente.
4. **Salidas:** cantidad positiva, motivo y referencia autorizada a solicitud;
   validar saldo utilizable y autorización farmacéutica. Ninguna salida real
   con pago simulado o fórmula requerida/desconocida sin validación autorizada.
5. **Ajustes:** definir quién solicita y quién aprueba, motivos obligatorios,
   evidencia, delta y saldo previo/posterior. Nunca permitir saldo final negativo.
   Corregir errores mediante contramovimientos trazables, no borrar el historial.
6. **Cancelación/devolución:** definir estados permitidos y compensación de
   reserva/saldo/pago; idempotencia y vínculo al movimiento original. Requiere
   revisar las rutas compartidas que hoy eliminan pedidos sin reposición.
7. **Lotes/vencimientos:** número de lote, medicamento, fecha de recepción,
   fecha de vencimiento y cantidad utilizable; unicidad del lote según política.
   Definir cuarentena, devoluciones y selección FEFO. No asumir esas reglas.
8. **Stock mínimo:** umbral no negativo por medicamento y ubicación si procede,
   responsables de configuración y regla de cruce/rearme de alertas. No generar
   alertas ahora ni activar Notificaciones para aparentar esa funcionalidad.

Entidades candidatas, solo conceptuales:

| Entidad/cambio | Datos y restricciones propuestos |
|---|---|
| MovimientoInventario | medicamento, tipo, delta, saldo anterior/final, actor, motivo, fecha, referencia de origen, clave idempotente única |
| LoteMedicamento | medicamento, número de lote, recepción, vencimiento; política de unicidad aprobada |
| ExistenciaLote | lote y eventual ubicación, físico/reservado/disponible según definición; saldos no negativos |
| PoliticaInventario | mínimo, unidad y ubicación si aplica; autor y fecha de cambio |
| Integridad | CHECK(stock>=0), cantidades y saldos válidos, FK y UNIQUE; revisión previa de datos existentes |

Definir primero si se requiere separación por farmacia/sucursal: no existe
actualmente una asignación equivalente en el catálogo global. No introducir
permisos de otros roles para resolverlo por suposición.

El catálogo agregado y los lotes deberán conciliarse bajo una fuente de verdad
definida. Las operaciones usarán bloqueos/actualizaciones condicionadas dentro
de una transacción y un orden estable de bloqueo, coordinados con pedidos.
No bastaría agregar una tabla de movimientos sin integrar el descuento actual.

Cambios que requieren autorización adicional: esquema/constraints de Neon,
reglas de movimientos, permisos de escritura de Farmacia y coordinación con
`order.service.js` / `order.repository.js` y sus rutas compartidas. No se
preparó ni ejecutó SQL de esas operaciones, ni se alteró Prisma para incluirlas.

## Condición de cierre

Las consultas están implementadas. Escrituras, movimientos, lotes, vencimientos,
mínimos y su autorización permanecen pendientes de aprobar esta propuesta.
No se modificaron esquema ni migraciones históricas, configuración de
Notificaciones, código funcional/permisos de Administrador, Paciente o EPS.
No hubo commit, push, despliegue ni escrituras de datos reales.
