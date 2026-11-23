// Genera la matriz revisable sin consultar bases de datos ni cambiar estados reales.
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/calidad/reportes');
const rows=[];
const modules={};
function add(modulo,requirements,{blocked=false,completed=[],partial=[],localPartial=[],evidence,tests,blocker='Activación revisada de esquema, vínculos y permisos en Neon; validación con registros reales autorizados.'}){
    modules[modulo]=[];
    requirements.forEach((requisito,i)=>{
        const n=i+1,estado=partial.includes(n)?'PARCIAL':blocked&&!completed.includes(n)?'BLOQUEADO':'COMPLETO';
        const row={id:`${modulo.toUpperCase().replace(/[^A-Z]/g,'').slice(0,5)}-${String(n).padStart(2,'0')}`,modulo,requisito,estado,codigoLocal:localPartial.includes(n)?'PARCIAL':'COMPLETO',evidencia:evidence,prueba:tests,bloqueo:estado==='BLOQUEADO'?blocker:estado==='PARCIAL'?'No existe inventario persistente propio de farmacia.':'Ninguno para este criterio.',accionPendiente:estado==='COMPLETO'?'Conservar en regresión.':estado==='PARCIAL'?'Mantener alcance global explícito; no certificar stock propio.':'Revisión y autorización del esquema/configuración; activar y validar sin copiar pacientes.'};
        rows.push(row);modules[modulo].push(row);
    });
}
add('Menu',[
 'Exactamente siete módulos: Dashboard, Solicitudes, Usuarios, Inventario, Medicamentos, Notificaciones, Perfil',
 'Sin Chat, Entregas ni Fórmulas como paneles independientes de Farmacia',
 'URL antiguas rechazadas para Farmacia, sin componentes operativos',
 'Chat y VITALIX excluyen las sesiones Farmacia y EPS; conservan los usos legítimos restantes'
],{evidence:'FarmaciaLayout.astro; roles.js; Chat.jsx; VitalixWidget.jsx; chat.service.js; chat.socket.js',tests:'farmacia-pages.test.cjs; farmacia-security-phase1.test.cjs; frontend.test.cjs; chat-policy.test.mjs'});
add('Usuarios',[
 'Listado de pacientes autorizados','Nombres originales','Apellidos originales','EPS vinculada','Estado del afiliado','Identificador permitido, sin documento ni contactos',
 'Búsqueda por nombre y apellidos','Filtro por inicial del apellido','Paginación estable','Total activo y total filtrado','Actualización desde PostgreSQL original','Reflejar cambios desde EPS sin copiar afiliados','Estados vacíos y errores','Interfaz responsive de solo lectura','Prevenir registros duplicados'
],{blocked:true,completed:[13,14,15],evidence:'farmacia-eps.repository.js; afiliados-origen.repository.js; farmacia-usuarios.js; farmacia-usuarios.astro',tests:'farmacia-eps.test.cjs; farmacia-origen-postgres.test.cjs; farmacia-integral-http.test.cjs',blocker:'Vínculo real Farmacia 4 → EPS 1 pendiente; verificar configuración de la fuente original y esquema EPS sin inventar migraciones.'});
add('Solicitudes',[
 'Número de solicitud','Nombre completo del paciente autorizado','EPS del paciente','Fecha de solicitud','Medicamentos solicitados','Cantidades de cada medicamento','Presentación del medicamento','Fórmula vinculada por su paciente','Estado y observaciones autorizadas',
 'Listado limitado a asignaciones persistentes','Búsqueda por paciente','Búsqueda por número','Filtro por estado','Filtros por fecha','Paginación','Vista detallada','Visualización protegida de fórmula','Descarga solo con consentimiento permitido','Transiciones reales y autorizadas','Responsable y fecha de servidor','Historial persistente','Confirmación antes del cambio','Errores sin datos anteriores','Prevención de duplicados con idempotencia y restricciones','Integración transaccional con Notificaciones','Integración con Dashboard','Creación del paciente → política explícita → asignación → notificación'
],{blocked:true,completed:[22,23,24],evidence:'farmacia-operacion.repository.js; farmacia-operacion.service.js; farmacia-solicitudes.js; order.repository.js; formulas.js',tests:'farmacia-operacion-postgres.test.cjs; farmacia-integral-http.test.cjs; farmacia-solicitudes.test.cjs',blocker:'Aplicar esquema nuevo solo con autorización, verificar identidad afiliado–cuenta, vínculo EPS y asignaciones/política; validar flujo con pedidos reales. Las fórmulas requeridas o desconocidas siguen bloqueando dispensación.'});
add('Inventario',[
 'Tabla con código','Tabla con nombre','Tabla con descripción','Tabla con presentación','Cantidad disponible','Estado de existencias',
 'Búsqueda','Filtro disponibles','Filtro agotados','Filtro stock bajo','Paginación','Consulta sin controles de modificación de cantidades',
 'Botón DESCARGAR REPORTE EXCEL','Archivo XLSX real','Hoja Inventario con los siete campos requeridos','Hoja Resumen con los seis indicadores requeridos','Nombre SaludClick y encabezados destacados','Anchos adecuados y formato numérico','Filtros Excel','Primera fila inmovilizada','Nombre de archivo con fecha','Exportación autenticada','Respeta filtros aplicados','Incluye todos los resultados coincidentes, no solo la página','Celdas de texto sin ejecución de fórmulas','Reporte vacío válido','Validación de descarga y reapertura del XLSX','Totales correctos para los resultados exportados','No divulgar existencias identificables de otras farmacias','Identificar catálogo global sin afirmar titularidad propia','Sin escritura ni movimientos desde Inventario'
],{partial:[29],localPartial:[29],evidence:'farmacia-excel.service.js; farmacia-existencias.repository.js; FarmaciaExistencias.astro; farmacia-descargas.js',tests:'farmacia-excel.test.cjs; farmacia-existencias.test.cjs; farmacia-integral-http.test.cjs'});
add('Medicamentos',[
 'Alta autorizada','Consulta','Edición autorizada','Actualizar nombre','Actualizar descripción','Actualizar presentación','Actualizar información permitida','Asociar imagen HTTPS','Cambiar imagen','Vista previa','Búsqueda','Filtros','Paginación','Validación de formularios','Confirmaciones','Auditoría persistente',
 'Código y categoría existentes','Nombre obligatorio y acotado','Descripción válida y acotada','Presentación válida y acotada','URL HTTPS válida y acotada','Rechazar credenciales, hosts locales y protocolos peligrosos','Servidor no descarga imágenes: sin SSRF por inspección remota','Imagen alternativa en fallos','Prevenir duplicados por nombre y presentación','Tarjetas con imagen, nombre, descripción, presentación y disponibilidad','Imagen compartida con catálogo público y del paciente','Permiso persistente por farmacia y medicamento; sin escritura global por defecto','No modificar stock desde Medicamentos'
],{blocked:true,completed:[2,11,12,13,14,15,18,19,20,21,22,23,24,26,28,29],evidence:'farmacia-catalogo.repository.js; farmacia-operacion.validator.js; farmacia-catalogo.js; farmacia-existencias.js; medication.repository.js; medicamentos.js',tests:'farmacia-operacion-postgres.test.cjs; farmacia-excel.test.cjs; farmacia-integral-http.test.cjs; farmacia-existencias.test.cjs',blocker:'Esquema y autorización de catálogo real pendientes; no se concede escritura global ni se modifica Neon.'});
add('Notificaciones',[
 'Campana en todos los módulos cuando está habilitada','Contador de no leídas','Listado paginado','Aviso de nueva solicitud asignada','Fecha y hora','Acceso al detalle autorizado','Marcar una como leída','Marcar todas como leídas','Persistencia','Actualización por Socket.IO','Idempotencia y restricción de duplicados','Reconexion y resincronización','Estados vacíos','Errores comprensibles'
],{blocked:true,completed:[11,13,14],evidence:'farmacia-notificaciones.repository.js; farmacia-operacion.repository.js; farmacia-notificaciones.socket.js; farmacia-notificaciones.js',tests:'farmacia-notificaciones.test.cjs; farmacia-notificaciones-socket.test.cjs; farmacia-integral-http.test.cjs; farmacia-operacion-postgres.test.cjs',blocker:'Migración previa de notificaciones y nueva asignación pendientes de activar en Neon; FARMACIA_NOTIFICACIONES_ENABLED no se cambió en configuración real.'});
add('Dashboard',[
 'Pacientes atendidos: pacientes únicos con entrega confirmada','Solicitudes pendientes del ámbito asignado','Solicitudes completadas por evento verificable','Medicamentos entregados: suma de cantidades confirmadas','Gráfico de solicitudes por mes','Gráfico por estado','Evolución de pacientes atendidos','Medicamentos más solicitados por cantidad','Actividad reciente con solicitud, paciente, fecha, estado y detalle','Filtro por periodo','Tendencia respecto a periodo anterior comparable','Carga','Vacíos','Errores sin estadísticas ficticias','Responsive','Acceso directo a Solicitudes','Sin tabla duplicada de inventario ni stock presentado como propio','Evitar 503 de indicadores cuando la activación está pendiente, conservando el cierre de Solicitudes'
],{blocked:true,completed:[12,13,14,15,16,17,18],evidence:'farmacia-operacion.repository.js:estadisticas; farmacia-dashboard.js; farmacia.astro',tests:'farmacia-operacion-postgres.test.cjs; farmacia-integral-http.test.cjs; farmacia-pages.test.cjs',blocker:'Las cifras reales necesitan asignaciones, vínculos y eventos de entrega reales autorizados. Hoy se muestra ausencia explícita de datos, no ceros ficticios.'});
add('Perfil',[
 'Nombre de la farmacia/cuenta','Correo de solo lectura','Contactos permitidos','Estado de cuenta verificado','Edición de datos propios autorizados','Cambio seguro de contraseña con revocación de sesiones','Validación de formularios','Mensajes de éxito y error','Control de sesión','Revalidación de cuenta activa sin editar otros usuarios'
],{blocked:true,completed:[1,2,3,4,5,7,8,9,10],evidence:'farmacia-perfil.astro; perfil.js; farmacia-perfil.js; farmacia-password.service.js; farmacia-notificaciones.middleware.js',tests:'farmacia-security-phase1.test.cjs; farmacia-operacion-postgres.test.cjs; frontend.test.cjs',blocker:'Cambio directo de contraseña requiere la nueva persistencia de revocación; el restablecimiento por correo existente se conserva.'});
add('Integracion',[
 'Usuarios utiliza los mismos registros originales que EPS y Administrador','Solicitud relaciona paciente, medicamentos y cantidades','Consentimiento del paciente vincula fórmula sin aprobarla','Medicamentos comparte metadatos e imágenes con catálogo permitido','Inventario solo consulta y exporta','Nueva solicitud asignada crea notificación en la misma transacción','Dashboard resume eventos y cantidades, sin contar pedidos como unidades','Perfil modifica únicamente al autenticado','No duplicar lógica de transiciones ni habilitar consultas globales'
],{blocked:true,completed:[5,8,9],evidence:'afiliados-origen.repository.js; farmacia-operacion.rules.js; order.repository.js; farmacia-operacion.repository.js; medication.repository.js',tests:'farmacia-integral-http.test.cjs; farmacia-operacion-postgres.test.cjs; farmacia-origen-postgres.test.cjs; frontend.test.cjs'});
add('UI',[
 'Menú lateral consistente','Tarjetas estadísticas','Gráficos con etiquetas legibles','Formularios organizados','Tablas con búsqueda y filtros','Botones coherentes','Iconos coherentes','Colores SaludClick','Escritorio y móvil','Carga','Vacíos','Errores comprensibles','Confirmación de acciones sensibles','Accesibilidad: etiquetas, foco, estado y diálogos'
],{evidence:'FarmaciaLayout.astro; farmacia.css; FarmaciaCatalogoEditor.astro; farmacia.astro; páginas independientes',tests:'farmacia-pages.test.cjs; farmacia-integral-http.test.cjs; frontend.test.cjs; capturas locales de Dashboard y catálogo'});
add('Seguridad',[
 'JWT verificado','Cuenta activa','Rol vigente','Vínculo EPS–Farmacia validado sin aceptar EPS del cliente','Titularidad persistente de solicitudes','Fórmulas protegidas y sin enlaces públicos','Permisos de catálogo persistentes','Inventario autorizado y de solo lectura','Exportación autenticada y sin fórmulas ejecutables','Notificaciones limitadas al destinatario asignado','Socket.IO autorizado y revalidado','Acceso por URL rechazado para roles ajenos','Endpoints protegidos también fuera de la interfaz','Auditoría y operaciones atómicas sin eliminar protecciones'
],{evidence:'middlewares; rutas; validadores; repositorios; migración aditiva sin datos',tests:'farmacia-security-phase1.test.cjs; farmacia-eps.test.cjs; farmacia-integral-http.test.cjs; farmacia-operacion-postgres.test.cjs; chat-socket.test.cjs'});
add('Regresion',[
 'Administrador conserva sus funciones legítimas','Paciente conserva sus funciones legítimas','Farmacia conserva siete módulos','EPS conserva sus funciones legítimas','Chat humano restringido a Administrador y Paciente','Suite backend y navegador completa','Pruebas frontend','Astro check y build','Prisma validate'
],{evidence:'Logs farmacia-integral-* en la raíz; esquema Prisma; código anterior conservado',tests:'Suite completa con preload isolate-database; tests/*.test.mjs; Astro check/build; Prisma validate'});

const completos=rows.filter(r=>r.estado==='COMPLETO').length,locales=rows.filter(r=>r.codigoLocal==='COMPLETO').length;
const summary={total:rows.length,completos,parciales:rows.filter(r=>r.estado==='PARCIAL').length,bloqueados:rows.filter(r=>r.estado==='BLOQUEADO').length,pendientes:rows.filter(r=>r.estado==='PENDIENTE').length,porcentajeVerificable:Number((100*completos/rows.length).toFixed(2)),codigoLocalCompleto:locales,porcentajeCodigoLocal:Number((100*locales/rows.length).toFixed(2)),criteriosPara90:Math.max(0,Math.ceil(rows.length*.9)-completos)};
function tap(file){const p=path.join(root,file);if(!fs.existsSync(p))return 'Pendiente de ejecución final.';const s=fs.readFileSync(p,'utf8');const n=k=>s.match(new RegExp('^# '+k+' (\\d+)','m'))?.[1];return n('tests')?`${n('tests')} pruebas; ${n('pass')} aprobadas, ${n('fail')} fallidas, ${n('skipped')} omitidas. Evidencia: ${file}.`:'En ejecución: '+file;}
const resultados=`- Suite backend y navegador: ${tap('farmacia-integral-validacion-definitiva.tap')}
- Frontend: ${tap('farmacia-integral-frontend.tap')}
- Aceptación PostgreSQL/HTTP/navegador dirigida: ${tap('farmacia-integral-aceptacion-final.tap')}
- Astro check: 0 errores, 0 advertencias y un hint preexistente por map sin uso en dashboard.js. Evidencia: farmacia-integral-check.txt.
- Astro build: correcto, 18 páginas Astro. Evidencia: farmacia-integral-build.txt.
- Prisma validate: esquema válido. Cliente Prisma 7.10.1 generado localmente, sin migraciones. Evidencias: farmacia-integral-prisma.txt y farmacia-integral-prisma-generate.txt.
- Auditoría de dependencias de producción: 0 vulnerabilidades reportadas tras el override acotado. Evidencia: farmacia-integral-audit.json.
- git diff --check: correcto.

Las ejecuciones previas se conservan en los demás logs farmacia-integral-*.tap;
incluyen ajustes de contratos antiguos (ya no se notifica globalmente), problemas
de configuración del origen efímero de pruebas y fallos intermitentes de navegador.
No se borraron ni desactivaron pruebas para obtener resultados positivos. Los
contratos se actualizaron para probar los requisitos nuevos y se añadieron
casos de PostgreSQL real embebido, aislamiento y consentimiento.`;
const table=Object.entries(modules).map(([name,list])=>{const c=list.filter(r=>r.estado==='COMPLETO').length,l=list.filter(r=>r.codigoLocal==='COMPLETO').length;return `| ${name} | ${list.length} | ${c} | ${(100*c/list.length).toFixed(2)} % | ${(100*l/list.length).toFixed(2)} % |`;}).join('\n');
const json={fecha:'2026-11-16',definicion:'COMPLETO general no requiere una activación Neon pendiente. La prueba local de un módulo persistente NO se cuenta como activación real.',resumen:summary,criterios:rows};
fs.writeFileSync(path.join(dir,'farmacia-criterios-integrales-2026-11-16.json'),JSON.stringify(json,null,2)+'\n');
const branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const tracked=execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>/^(backend\/(src|tests|scripts|prisma)|frontend\/(src|public|tests))\//.test(p)||/^docs\/calidad\/reportes\/farmacia-(avance-integral|criterios-integrales|integral-)/.test(p));
const files=[...new Set([...tracked,...untracked])].sort();
const matrix=rows.map(r=>`| ${r.id} | ${r.modulo} | ${r.requisito} | ${r.estado} | ${r.codigoLocal} | ${r.evidencia} | ${r.prueba} | ${r.bloqueo} | ${r.accionPendiente} |`).join('\n');
const report=`# Farmacia: avance integral — 16/11/2026

## Resultado y medición honesta

Se implementaron funciones reales y se probaron con PostgreSQL embebido, HTTP,
Socket.IO y navegador. No se activaron migraciones ni permisos en Neon.

- Criterios: **${summary.total}**.
- Completos generales: **${summary.completos}** (**${summary.porcentajeVerificable} %**).
- Parciales: **${summary.parciales}**. Bloqueados: **${summary.bloqueados}**. Pendientes: **${summary.pendientes}**.
- Código y pruebas locales: **${summary.codigoLocalCompleto}/${summary.total} (${summary.porcentajeCodigoLocal} %)**.
- Faltan **${summary.criteriosPara90}** criterios completos para el 90 % general.

El porcentaje local NO es porcentaje operativo en Neon. Los criterios de
Usuarios, Solicitudes, catálogo de escritura, Notificaciones y estadísticas que
dependen de activación siguen BLOQUEADOS aunque su código pase pruebas aisladas.
No se declara un módulo persistente terminado únicamente por usar datos de prueba.
No se incluyen porcentajes basados en líneas de código ni se reduce el alcance.
Los pasos del flujo se mapean a los criterios de sus funciones, sin contarlos dos veces.

| Módulo | Criterios | Completos generales | General verificable | Código local |
|---|---:|---:|---:|---:|
${table}

## Estado inicial, rama y conservación

Rama: \`${branch}\`. HEAD: \`${head}\`.
Se conserva el nombre de informe solicitado del 16/11; la verificación final
continuó el 17/11/2026 (America/Bogota).
Se partió del retiro de Chat/Entregas con 566 pruebas backend/navegador y 6 de
frontend reportadas. Había cambios sin confirmar, archivos de auditoría y
worktrees existentes. Se conservaron. Los cambios previos de index.astro y
login.astro NO corresponden a esta intervención. No hubo commits, push ni merge.

## Implementación

- Solicitudes: asignación persistente; EPS única y vigente; afiliado original y
  vínculo local de identidad verificado; filtros por paciente/número/estado/fecha;
  datos mínimos; control de versión; idempotencia; pago real suficiente; bloqueo
  de fórmula requerida/desconocida; responsable y fecha de servidor; historial;
  recepción obligatoria y cantidades confirmadas. No descuenta stock global al entregar.
- Enrutamiento: una política administrativa explícita puede asignar nuevas
  solicitudes dentro de su transacción de creación. Sin política, permanecen sin
  asignar. No se deduce titularidad de compartir EPS. Los pagos simulados siguen
  bloqueando preparación/entrega, y el reintento de creación no descuenta dos veces.
  Con la operación activada, quitar un pedido del historial del paciente lo
  oculta únicamente para ese paciente: no borra pagos, detalles, asignación ni
  auditoría, y Farmacia conserva el pedido. Sin activación se mantiene el contrato previo.
- Fórmulas: el paciente puede vincular su propio archivo a su propia solicitud y
  consentir descarga opcional. Se conservan estado y prescripción. Farmacia
  obtiene el archivo por petición autenticada y ámbito; sin rutas públicas,
  path traversal, MIME activo o descarga no consentida.
- Medicamentos: alta/edición condicionadas a permisos persistentes, versión,
  duplicados y auditoría atómica. URL HTTPS, vista previa, alternativa y tarjetas.
  El mismo medicamento e imagen se reflejan en el catálogo compartido; se conserva
  stock y requisito de fórmula. Los nuevos registros comienzan con stock cero y
  requisito de fórmula desconocido, sin inventar una validación clínica.
- Inventario: consulta global explícita; código, descripción, presentación,
  cantidad y disponibilidad. XLSX real, dos hojas, filtros, congelación, estilos,
  cantidades numéricas y metadatos de filtros. Exporta todos los coincidentes;
  si excede 50.000, exige reducir filtros y no trunca silenciosamente. Solo
  lectura. El XLSX se reabre con ExcelJS; no se certifica apertura manual en una
  instalación de Microsoft Excel que no se utilizó en esta sesión.
- Usuarios: reutiliza la conexión original EPS del Administrador; consulta
  limitada por EPS desde SQL READ ONLY. Sin copia local de pacientes. Se añade
  identificador de afiliación e inicial de apellido, búsqueda/paginación/totales.
- Notificaciones: se elimina la distribución global a farmacias activas;
  únicamente recibe la asignada. Creación de asignación/transición y aviso son
  atómicos. Contador global del panel, lectura, enlaces y reconexiones conservadas.
- Dashboard: cuatro métricas, cuatro gráficos accesibles, periodo, comparación
  de solicitudes recibidas y actividad reciente. Finalizaciones y cantidades
  proceden de eventos únicos de entrega con recepción. Sin activación responde
  disponible=false y campos nulos; no consulta pedidos globales ni inventa cifras.
- Perfil: se conserva edición propia y correo protegido; cambio de contraseña
  con verificación de la actual, hash bcrypt, límite de intentos, auditoría sin
  secretos y revocación persistente de sesiones de Farmacia. Recuperación por
  correo existente conservada mientras la activación directa está pendiente.
- Chat: FARMACIA/EPS rechazados por HTTP, Socket.IO, página y widget; conversaciones
  conservadas. ADMINISTRADOR/PACIENTE y ayuda pública de acceso se preservan.

## Persistencia y activación

Migración nueva preparada y aplicada SOLO en PostgreSQL embebido:
\`20261116180000_farmacia_operacion_autorizada\`.
Contiene asignaciones, eventos, consentimiento de fórmulas, permisos/ámbitos y
auditoría de catálogo, revocación de sesiones, política EPS y auditoría de permisos.
No inserta pacientes, asignaciones, políticas, permisos ni vínculos reales.
Los modelos Prisma y las FK RESTRICT/NoAction reflejan la migración.

FARMACIA_OPERACION_ENABLED y FARMACIA_NOTIFICACIONES_ENABLED NO se cambiaron en
configuración real. Una bandera por sí sola no concede ámbito: cada operación
revalida cuenta, asignación, vínculo, fuente original y permisos correspondientes.
Si falta esquema/dependencia, falla cerrada y sin datos globales.

La infraestructura EPS previa carece de una cadena original completa de
migraciones revisable para todas sus tablas. NO se inventó ni reconstruyó.
Las tablas EPS mínimas de los tests son fixtures sintéticas, no migraciones de
producción. La identidad original afiliado–cuenta debe verificarse antes de
habilitar Solicitudes; el código no crea esas asociaciones ni las presupone.

## Endpoints

| Método | Ruta | Protección/uso |
|---|---|---|
| GET | /api/farmacia/pedidos | Asignación+EPS+fuente original; nuevo motor solo tras activación |
| GET | /api/farmacia/pedidos/:id | Detalle limitado al mismo ámbito |
| PATCH | /api/farmacia/pedidos/:id/estado | Versión+idempotencia+pago real+auditoría+aviso |
| POST | /api/admin/farmacias/solicitudes/:id/asignacion | Administrador vigente; metadatos de asignación, sin consulta clínica |
| PUT | /api/admin/farmacias/:farmaciaId/catalogo-autorizaciones | Permisos explícitos por farmacia/medicamento |
| PUT | /api/admin/farmacias/rutas-eps/:epsId | Política explícita, sin crear vínculos EPS |
| GET | /api/farmacia/medicamentos/permisos | Cuenta vigente, permisos reales y categorías |
| POST | /api/farmacia/medicamentos | Alta autorizada, stock cero |
| PATCH | /api/farmacia/medicamentos/:id | Ámbito, versión y auditoría; sin stock |
| GET | /api/farmacia/inventario/reporte.xlsx | JWT y cuenta activa; filtros validados; catálogo global |
| GET | /api/farmacia/dashboard/estadisticas | Estadísticas asignadas; ausencia de activación explícita |
| GET | /api/farmacia/pedidos/:id/formulas/:formulaId | Archivo protegido; ?descarga=1 exige consentimiento |
| POST | /api/formulas/:id/solicitud/:solicitudId | Solo paciente propietario de ambos registros |
| POST | /api/farmacia/perfil/password | Contraseña actual, hash y revocación |

Se conservan endpoints de EPS, perfil y notificaciones; Usuarios cambia a la
fuente original. No se abrió acceso global a Solicitudes. El Administrador
mantiene bloqueadas las operaciones clínicas y no revisa prescripciones.

## Pruebas y evidencias

${resultados}

Docker no estaba iniciado. PGlite ejecuta PostgreSQL embebido real sin conexiones
a Neon. La regresión usa el preload que rechaza conexiones reales inesperadas.
Los casos nuevos prueban SQL, restricciones, rollback de notificación, rutas
HTTP, archivo clínico protegido, doble solicitud, catálogo compartido y navegador.
Algunas lecturas Prisma de la aceptación HTTP utilizan un adaptador de prueba;
no se presentan como integración completa del driver Prisma con Neon.

Capturas: farmacia-integral-dashboard-2026-11-16.png y
farmacia-integral-editor-2026-11-16.png. Se corrigió la paginación que heredaba
posición de la navegación global y se revisaron tablas/tarjetas en móvil.
Dependencias añadidas: ExcelJS 4.4.0; PGlite 0.3.14 solo dev. Override de uuid
11.1.1 limitado a ExcelJS tras la auditoría; versiones directas existentes conservadas.
Referencia de bibliotecas: [ExcelJS](https://github.com/exceljs/exceljs),
[PGlite](https://pglite.dev/docs/).

## Bloqueos reales y autorización pendiente

1. Revisar/aprobar la migración nueva y la previa de Notificaciones para el destino
   real, y reconciliar la cadena histórica sin inventarla.
2. Verificar permisos SELECT y la fuente EPS original. Autorizar, mediante su
   flujo vigente, Farmacia 4 → EPS VidaPlena 1. No se ejecutó esa vinculación.
3. Verificar la asociación original afiliado–cuenta de los pacientes; no copiar
   los 50 afiliados ni crear otra tabla de pacientes.
4. Autorizar asignaciones/política de enrutamiento y permisos de catálogo reales.
   No se presupone que todo medicamento ni toda solicitud pertenece a Farmacia 4.
5. Activar banderas solo tras las verificaciones anteriores y comprobar un flujo
   autorizado real, de extremo a extremo, con métricas y notificaciones.
6. Mantener bloqueada la dispensación de fórmulas requeridas o desconocidas
   mientras no exista validación farmacéutica autorizada; un pago simulado no basta.
7. Inventario continúa global. Para certificar stock propio se requiere un modelo
   de titularidad de existencias separado y autorizado; no se implementaron movimientos.

Para llegar al 90 % general hay que completar al menos ${summary.criteriosPara90}
criterios bloqueados de la matriz mediante activación y evidencia reales; no basta
con cambiar sus etiquetas ni habilitar una bandera. Para el 100 %, además hay
que cerrar todos los bloqueos y el criterio parcial de inventario, validar datos,
aislamiento, concurrencia con múltiples conexiones y recuperación en el destino
real, y revisar el flujo clínico sin aprobar automáticamente prescripciones.

## Plan concreto para el 17/11/2026

1. Revisar migraciones y esquema real en modo de solo lectura; aprobar el plan
   de aplicación y recuperación, sin ejecutar nada sin autorización expresa.
2. Aplicar solo cambios aprobados; verificar FK, índices y exclusividad del
   vínculo. Autorizar el vínculo 4→1 y comprobar 50 afiliados originales sin cambios.
3. Verificar identidad afiliado–cuenta y autorizar un ámbito pequeño de prueba
   real, permisos de catálogo y política de nuevas solicitudes.
4. Activar de forma controlada Solicitudes/Notificaciones y comprobar creación,
   aislamiento, fórmula con consentimiento, transiciones, auditoría y dashboard.
5. Validar XLSX con el catálogo real autorizado y un cliente de hoja de cálculo;
   comprobar imágenes y actualizaciones desde las vistas públicas/paciente.
6. Repetir suite, navegador y revisión de seguridad tras la activación. Revisar
   diferencias seleccionadas antes de pedir autorización para cualquier publicación.

## Archivos modificados y nuevos

La lista incluye cambios acumulados sin confirmar del retiro previo; index.astro
y login.astro se preservaron tal como estaban al iniciar.

${files.map(p=>'- '+p).join('\n')}

## Matriz completa de aceptación

La versión estructurada se encuentra en farmacia-criterios-integrales-2026-11-16.json.
Cada fila mantiene estado general, evidencia, prueba, bloqueo y siguiente acción.

| ID | Módulo | Requisito | Estado general | Código local | Evidencia | Prueba | Bloqueo | Acción pendiente |
|---|---|---|---|---|---|---|---|---|
${matrix}
`;
fs.writeFileSync(path.join(dir,'farmacia-avance-integral-2026-11-16.md'),report);
console.log(JSON.stringify(summary));
