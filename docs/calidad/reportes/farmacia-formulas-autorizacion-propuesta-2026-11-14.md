# Fórmulas médicas de FARMACIA: inspección, bloqueo y propuesta de autorización

Fecha: 2026-11-14. Alcance: exclusivamente preparación del módulo del rol 3.

**Resultado: no se habilitan consultas clínicas de Farmacia. El esquema y las
rutas actuales no permiten identificar qué fórmulas le han sido autorizadas.**
Se aplica la condición expresa del usuario: detener esa funcionalidad y presentar
primero la propuesta. No se sustituye la ausencia de autorización por acceso
global, una lista vacía simulada, un archivo de IDs permitidos o filtros del navegador.

## 1. Evidencia del código existente

| Aspecto | Evidencia | Resultado |
|---|---|---|
| Modelo | `backend/prisma/schema.prisma`, FormulaMedica | Solo FK usuario_id a Usuario. No farmacia, asignación, concesión de lectura ni relación con solicitudes/medicamentos. |
| Campos | FormulaMedica | ID, propietario, metadatos del adjunto, descripción, estado textual y fecha_subida. |
| Emisión/vencimiento | FormulaMedica | No existen. fecha_subida no demuestra fecha de emisión ni vigencia clínica. |
| Prescripción estructurada | FormulaMedica / Solicitud / DetalleSolicitud | No existe. Los medicamentos de una compra no acreditan que estén prescritos. |
| Revisión | FormulaMedica | No hay responsable, fecha, evidencia, versión ni auditoría de validación. |
| Rutas personales | `backend/src/routes/formula.routes.js` | GET/POST /api/formulas y GET /api/formulas/:id exigen Paciente (2). Farmacia no hereda ese permiso. |
| Compatibilidad administrativa | formula.routes.js | Los antiguos GET/PATCH administrativos están denegados. No se reutilizan helpers de listado global. |
| Propiedad del documento | `backend/src/repositories/formula.repository.js`, buscarPropia | Consulta por ID y usuario del JWT mediante parámetros; no usa un paciente enviado por query. |
| Menú Farmacia | `frontend/src/pages/pages/farmacia.astro` | Fórmulas sigue deshabilitado. No se modificó la interfaz. |
| Bloqueos de dispensación | farmacia.service.js / farmacia.repository.js | Se conservan pago real aprobado, control de concurrencia y bloqueo de requiere_formula true/NULL. |

La existencia de una solicitud, conversación, afiliación EPS, medicamento
compartido o un estado textual VALIDADA no otorga por sí sola permiso para
leer la fórmula ni demuestra una validación farmacéutica autorizada.

El modelo actual tiene un estado String de 20 caracteres con valor inicial
PENDIENTE; no es una máquina de estados auditada. No se interpreta ni modifica
el estado de registros existentes para habilitar el nuevo módulo.

## 2. Documentos: almacenamiento actual y límites

El controlador existente guarda el contenido en un directorio privado del
backend, fuera de public/dist. PostgreSQL almacena metadatos y una referencia;
no almacena el contenido binario del adjunto en ese modelo. El directorio
existe, pero no se enumeraron ni abrieron documentos médicos reales.

El alta actual acepta PDF, JPEG, PNG y WEBP, hasta 5 MB, con comprobación de
cabecera del archivo y nombre interno UUID generado por el servidor. La ruta
personal de lectura comprueba primero la propiedad del paciente.

Observaciones para el futuro desarrollo, sin cambiar el flujo del rol 2:

- La comprobación de cabecera no demuestra que un documento esté libre de
  contenido malicioso ni que sea una fórmula auténtica.
- El guardado de archivo precede al INSERT de metadatos: no hay una transacción
  común entre disco y PostgreSQL; un fallo puede dejar un archivo huérfano.
- Un respaldo SQL no incluye estos documentos. Hará falta recuperación coherente
  de archivos/metadatos y política de retención con acceso restringido.
- No se encontró una comprobación explícita de confinamiento mediante realpath
  en la lectura existente. El nombre normal se genera internamente; la nueva
  lectura deberá validar también referencias corruptas y enlaces simbólicos.
- No se certificaron cifrado en reposo, análisis de archivos, recuperación de
  adjuntos o comportamiento de un despliegue con varias instancias.

No se exponen en esta entrega nombres reales de documentos, pacientes, rutas
físicas de archivos o contenido clínico. Cualquier corrección del alta/visor
personal compartido requeriría autorización adicional por afectar Paciente.

## 3. Funcionalidades detenidas y endpoints

| Funcionalidad | Estado actual |
|---|---|
| Listado, búsqueda, filtros y paginación de fórmulas de Farmacia | Detenidos: no hay ámbito de autorización por registro. |
| Detalle y visor médico de Farmacia | Detenidos por la misma razón. No se abrió ningún documento. |
| Fechas de emisión/vencimiento y medicamentos prescritos | No registrados en el esquema; no se derivan de fechas de subida, compras, OCR o suposiciones. |
| Aprobación, rechazo y dispensación | No habilitados. |
| Menú y responsive de Fórmulas | No se habilitan componentes desconectados de una autorización real. |
| GET /api/farmacia/formulas | Propuesto, NO registrado; actualmente 404. |
| GET /api/farmacia/formulas/:id | Propuesto, NO registrado; actualmente 404. |
| GET /api/farmacia/formulas/:id/documento | Propuesta adicional para el visor autenticado; NO registrado. |

El 404 actual de las rutas propuestas es ausencia de funcionalidad, NO una
implementación de su futura autenticación. Las rutas personales existentes
responden 401 a JWT ausente/inválido/expirado y 403 al rol Farmacia.

## 4. Propuesta de autorización que debe aprobarse PRIMERO

La alternativa mínima recomendada para una primera fase es una concesión
explícita a una cuenta concreta ACTIVO de rol 3 por cada fórmula. Esto no
convierte esa cuenta en una farmacia/sucursal legal ni crea permisos para todo
el personal. Si se requiere acceso por establecimiento, primero debe definirse
una entidad de farmacia y su membresía; no existe esa relación en el modelo.

Decisiones obligatorias del usuario antes de implementar:

1. ¿El destinatario del permiso será una cuenta individual de Farmacia o un
   establecimiento con personal adscrito?
2. ¿Qué actor y flujo pueden conceder, revocar y renovar el acceso, con qué
   fundamento y evidencia? No se presume que Administrador pueda conceder
   permisos clínicos ni que Farmacia pueda autoasignarse fórmulas.
3. ¿Qué duración/condiciones tiene el permiso y quién puede abrir adjuntos?
   El permiso de lectura de metadatos puede distinguirse del de documentos.
4. ¿Qué flujo de negocio origina la concesión? Si requiere modificar Paciente,
   una ruta compartida o permisos de otro rol, debe autorizarse por separado.

Entidad conceptual `AutorizacionConsultaFormula`, NO añadida a Prisma:

- ID, formula_id y destinatario_usuario_farmacia_id (o farmacia_id si se aprueba
  el modelo por establecimiento).
- Actor/fuente que concede, fundamento o referencia al evento aprobado.
- Permisos de metadatos/documento, creado_at, expira_at, revocado_at y motivo.
- FK e índices de consulta por destinatario/fórmula; política de unicidad de
  concesiones activas y conservación de su historial.

Regla mínima futura, evaluada en el backend para listado, detalle y documento:

`JWT vigente AND cuenta ACTIVO AND rol actual=3 AND concesión vigente del registro`

No basta un rol del token antiguo, un ID del paciente suministrado por el cliente
o un filtro posterior a descargar todas las fórmulas. Las consultas Prisma
deberán incluir el ámbito en su WHERE antes de paginar, contar o leer el adjunto.
Un ID inexistente y un ID no autorizado devolverán el mismo 404. Si falta la
estructura de autorización, se rechazará la operación; no se consultará todo
como fallback ni se presentará la indisponibilidad como cero registros reales.

## 5. Diseño de consulta y documentos DESPUÉS de autorizar el ámbito

Arquitectura nueva exclusiva de Farmacia: rutas, guard vigente, validador,
controlador, servicio y repositorio Prisma separados del controlador personal.
No reutilizar listarAdmin ni actualizarEstado como si fueran permisos del rol 3.

Contrato propuesto:

- GET /api/farmacia/formulas: buscar por identificador, filtrar por estado y
  fecha de subida dentro del ámbito; orden fecha/ID, 25 por página, máximo 50.
  El total también será del ámbito, sin conteos globales de pacientes ajenos.
- GET /api/farmacia/formulas/:id: proyección mínima de metadatos autorizados;
  datos farmacéuticos/fechas solo si están registrados, distinguiendo desconocido
  de ausente. Nunca ruta_archivo, nombre interno o claves de almacenamiento.
- GET /api/farmacia/formulas/:id/documento: autorización vigente antes de resolver
  y abrir el recurso, sin URLs públicas o tokens en query. JWT por cabecera.

Para el documento: resolver solo una referencia interna conocida, comprobar
confinamiento real y tipo/tamaño, sanitizar nombre de respuesta y errores,
usar HTTPS, no-store y nosniff. Evaluar visor aislado para PDF/imágenes y excluir
formatos activos como HTML/SVG. Un fallo de archivo es un error controlado,
no permiso para cambiar de paciente o buscar documentos alternativos.

No guardar contenido o tokens en localStorage ni incluir adjuntos/base64/rutas
en logs. Si se usan blobs, liberar sus URLs al cerrar/cambiar sesión. Revocar
un permiso impide nuevas lecturas; no se puede garantizar borrar copias que
ya se descargaron o capturas realizadas por un usuario autorizado.

La auditoría de consultas/aperturas requerirá escrituras y por tanto autorización
posterior. No se introduce ahora una escritura de auditoría escondida tras GET.

## 6. Propuesta de revisión y vinculación fórmula–pedido

Entidades/cambios conceptuales, SIN modificación de modelos ni migraciones:

| Elemento | Finalidad |
|---|---|
| Datos clínicos/versionado de fórmula | Emisión, vencimiento verificado, identidad del documento y versión/hash; no derivarlos de fecha_subida. |
| RevisionFormula | Fórmula/versión, estado de revisión, responsable autorizado, fechas, fundamento y observaciones mínimas protegidas. |
| PrescripcionItem | Medicamento, presentación/concentración, cantidad y unidad prescrita; posología/duración cuando consten y estén verificadas. |
| SolicitudFormula | Solicitud, fórmula y revisión/versiones utilizadas; asegurar mismo paciente. |
| Reserva/consumo de prescripción | Vínculo entre detalle de solicitud e ítem prescrito, cantidad reservada/dispensada/liberada y evento idempotente. |
| AuditoriaFormula | Actor, acción, resultado, fecha, referencias a revisión/concesión/solicitud y correlación, sin copiar documento o datos clínicos al log. |

No se presupone que estos nombres sean un esquema definitivo. Las FK,
cardinalidades, índices, política de retención y migración se revisarán después
de aprobar el dominio y recuperar el historial Prisma pendiente del proyecto.

Estados propuestos para la revisión, independientes del texto histórico:
PENDIENTE_DOCUMENTACION, PENDIENTE_REVISION, EN_REVISION, VALIDADA, RECHAZADA y
REVOCADA. Vencida es una condición de vigencia que debe calcularse con la fecha
verificada y la zona/política aprobadas; no se fija una duración clínica arbitraria.
Una revisión no debe validar a ciegas estados históricos ni OCR sin confirmar.

Condiciones de una futura validación:

1. Concesión vigente y competencia/permisos de revisión del responsable;
   pertenecer al rol 3 genérico no acredita por sí solo esa capacidad.
2. Paciente de la fórmula igual al de la solicitud; verificar los datos
   necesarios sin divulgar información adicional a otros destinatarios.
3. Documento íntegro, legible, versión identificada y autenticidad/prescriptor
   comprobados conforme a reglas aprobadas.
4. Emisión y vencimiento registrados/verificados. Si la vigencia requerida
   no puede determinarse, no autorizar dispensación.
5. Ítems prescritos registrados y concordantes con medicamentos, concentración,
   presentación, cantidades y unidades del pedido. No asumir equivalencias o
   sustituciones de medicamentos sin una regla autorizada.
6. Responsable y auditoría de la decisión; lectura no equivale a aprobación.

Prevención de reutilización indebida:

- Definir si se admiten varias solicitudes y entregas parciales. Hasta aprobar
  esa regla, no permitir reutilización automática ni usar el mismo documento
  como autorización ilimitada de compras del paciente.
- Bloquear/actualizar la revisión y sus saldos en una transacción al reservar
  cantidades. Comprobar acumulados de reservas y dispensaciones, no solo ese
  pedido. Una FK o un simple contador en el navegador no impiden carreras.
- Clave idempotente por evento para que reintentos no consuman dos veces;
  liberaciones y anulaciones trazables, sin borrar consumos anteriores.
- Cambiar el documento, revocar autorización/revisión o vencer la vigencia
  deberá impedir nuevas reservas/dispensaciones según la política aprobada.

Reglas de dispensación futuras: revalidar en servidor la autorización vigente,
revisión/versiones, vigencia, concordancia y saldo, además del estado persistido
de solicitud y pago real APROBADO con simulacion=false. Conservar el control de
concurrencia y la regla de descuento/reserva existente para no descontar stock
dos veces. Requiere aprobar cambios compartidos antes de intervenirlos.

**Actualmente nada de lo anterior desbloquea medicamentos.** Los que requieren
fórmula o tienen requisito desconocido permanecen bloqueados, incluso si alguien
modifica el navegador o envía un estado textual VALIDADA.

## 7. Pruebas ejecutadas y cobertura pendiente

Archivo creado: `backend/tests/farmacia-formulas-boundary.test.cjs`.
Sus seis pruebas caracterizan el límite cerrado actual:

- Farmacia no lista ni abre fórmulas personales, aun cambiando IDs/query.
- JWT ausente/inválido/expirado es rechazado en rutas existentes.
- Endpoints propuestos no registrados no exponen datos ni conteos.
- No se habilitan creación, aprobación, rechazo o dispensación.
- El documento personal mantiene el propietario del JWT en el WHERE parametrizado.
- La raíz pública no sirve el directorio de documentos privados.

Se usó app/Express/JWT reales con BD y operaciones de archivos sustituidas por
dobles que rechazan escrituras/aperturas. No se abrió ni enumeró un adjunto real.

Ejecuciones finales:

- Nueva suite más límites de Paciente, Administración, roles y navegación:
  **67 aprobadas, 0 fallidas, 0 omitidas**.
- Regresión de API/Solicitudes de Farmacia, incluyendo pagos simulados,
  fórmulas requeridas/NULL y concurrencia: **19 aprobadas, 0 fallidas, 0 omitidas**.
- Total de ambas selecciones: **86 comprobaciones aprobadas**.
  El primer intento del navegador en sandbox no respondió a DevTools; la
  ejecución final fuera del sandbox aprobó con servidores/datos aislados.

No se certifican filtros, paginación, visor, responsive o revisión de un módulo
de Fórmulas de Farmacia que aún no se ha habilitado. Después de autorizar el
ámbito deberán probarse con datos aislados: acceso positivo por concesión,
IDs ajenos/inexistentes indistinguibles, revocación/caducidad, conteos sin fuga,
archivos faltantes/tipos manipulados/traversal/symlinks, no-store, errores sin
rutas, fechas desconocidas, pacientes distintos, consumo concurrente y reintentos.

## 8. Archivos, restricciones y autorización pendiente

Archivos creados: este informe y `backend/tests/farmacia-formulas-boundary.test.cjs`.
Archivos de aplicación modificados: ninguno. No se agregaron rutas, componentes,
modelos, migraciones, permisos ni datos. Administrador, Paciente y EPS intactos.

Notificaciones: flag local ausente y evaluaciones local/de proceso false;
no se cambió configuración ni se activó el módulo. No hubo conexión con Neon,
consultas clínicas de producción, escrituras reales, migraciones, commit o push.

Para continuar debe aprobarse PRIMERO el ámbito (cuenta o establecimiento),
quién concede/revoca el acceso y el evento que lo origina. Después se presentarán
el esquema/migración y los cambios compartidos que resulten necesarios, sin
ejecutarlos en Neon sin autorización expresa. La consulta no se habilitará
globalmente para sortear la ausencia de esa definición.
