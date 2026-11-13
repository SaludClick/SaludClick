# Usuarios unificados y seis módulos administrativos

Fecha: 2026-11-12. Alcance: retirar la sección independiente Pacientes y consultar afiliados EPS junto a las cuentas locales. Se conserva el trabajo de las solicitudes anteriores. No se ejecutaron migraciones, importaciones, cambios de cuentas reales, commit ni push durante esta intervención.

## Comprobación previa y fuente de datos

Se ejecutó scripts/audit-unified-users.cjs en modo de solo lectura antes de implementar la consulta. La fuente se tomó de EPS_DATABASE_URL y EPS_DATABASE_SCHEMA ya configuradas, sin modificar el entorno ni buscar/copiar registros de archivos.

| Fuente | Identificación | Registros confirmados |
| --- | --- | ---: |
| SaludClick | Conexión DATABASE_URL, neondb.public.usuarios | 5 cuentas |
| EPS | Conexión EPS_DATABASE_URL, servidor ep-delicate-mountain-bei8g1c9-pooler.c-9.us-east-2.aws.neon.tech, neondb.public.afiliados | 50 afiliados |
| Coincidencias | Documento y tipo compatibles; también se revisó coincidencia de correo | 0 |
| Directorio unificado | Cuentas locales más afiliados, descontando coincidencias confirmadas | 55 registros únicos |

Hay tres cuentas de acceso locales activas y dos con estado sin definir. Los estados originales de afiliación no convierten a los afiliados en cuentas activas.

La fuente EPS contiene los 13 campos originales: id, nombres, apellidos, tipo_documento, documento, fecha_nacimiento, telefono, correo, direccion, ciudad, regimen, estado y eps_id. PostgreSQL confirmó la relación afiliados.eps_id → eps.id. La tabla de cuentas locales tiene rol_id → roles.id; no se encontró una relación física entre afiliados de la fuente externa y cuentas locales. Por ello no se equiparan IDs numéricos de bases diferentes.

Los campos de fecha de nacimiento, dirección y demás información innecesaria no se incorporan al directorio administrativo. Se usan nombres, documento/tipo, correo, estado e identificadores de origen. El registro de autorizaciones pacientes_autorizados y sus auditorías se conserva físicamente.

## Consulta sin escrituras

Se reutiliza afiliados-origen.repository.js, que ya consulta la fuente EPS dentro de una transacción READ ONLY. La nueva proyección local también usa una transacción READ ONLY. El servicio unifica ambos resultados únicamente en memoria durante la petición; no almacena copias entre bases ni utiliza tablas nuevas.

- Claves separadas SALUDCLICK:<id> y EPS:<id> evitan confundir un afiliado con una cuenta del mismo número.
- Documento exacto, conservando ceros iniciales y puntuación, más tipo de documento compatible confirma una coincidencia.
- Si falta el tipo de documento se exige corroboración por nombre completo o correo, además del documento.
- Un correo compartido por sí solo nunca fusiona registros. Tipos de documento incompatibles o candidatos ambiguos se conservan por separado con aviso de revisión.
- Las coincidencias muestran una sola fila con los dos orígenes y mantienen por separado la proyección original EPS.
- Un afiliado sin cuenta tiene id local y rol_id nulos y estado_cuenta SIN_CUENTA. No recibe contraseña, rol 2 o 4, ni acceso automático.
- Las cuentas locales conservan las acciones administrativas anteriores. Las filas exclusivamente EPS sólo permiten consultar su detalle; no ofrecen crear cuenta vinculada ni editar el origen.
- Búsqueda por nombres, correo y documento; filtros por origen, tipo de registro, rol de cuenta, estado de cuenta y estado original de afiliación; paginación posterior a la deduplicación.
- Una fuente EPS no disponible produce un error explícito. No se inventa un total cero ni se presenta un directorio parcial como completo.

## Menú, dashboard e informes

El menú contiene exactamente Dashboard, Usuarios, Solicitudes, Notificaciones, Informes y Configuración. Pacientes desaparece de navegación, accesos rápidos y vistas administrativas. Las URL antiguas admin-pacientes.html y admin-cuentas.html son accesos de compatibilidad que redirigen al único directorio unificado. El antiguo hash #pacientes también lleva a Usuarios.

Los endpoints administrativos independientes /api/admin/pacientes y /api/admin/pacientes/:id rechazan todos los métodos, sin ejecutar sus antiguos controladores. No se modifican los repositorios o servicios conservados de autorizaciones ni los módulos de los roles 2, 3 y 4. La gestión independiente de /api/admin/afiliados permanece bloqueada; la consulta autorizada se realiza a través de Usuarios e Informes.

El dashboard separa 55 registros únicos, 5 cuentas de acceso, 50 afiliados y 0 coincidencias. Los tres accesos activos proceden exclusivamente de las cuentas locales. Los indicadores de Solicitudes y Notificaciones se conservan.

Los informes Directorio unificado, Afiliados EPS y Resumen por origen comparten la consulta del directorio. Los informes por rol/estado de cuentas conservan su significado de cuentas de acceso. CSV/PDF incluyen origen y tipo, sin contraseñas ni documentos innecesarios. El informe EPS utiliza nombres y correos originales aunque una cuenta coincidente tenga datos diferentes.

La fuente EPS no tiene fecha de alta en sus 13 campos. No se inventa una fecha: los filtros por fechas usan la fecha de la cuenta local, excluyen filas sin fecha e informan cuántas quedaron fuera. La fecha de nacimiento nunca se reutiliza como fecha de registro.

## Archivos de esta intervención

- backend/src/repositories/administrative-directory.repository.js: proyección local de solo lectura.
- backend/src/services/administrative-directory.service.js: unión, deduplicación, filtros, detalle, resúmenes e informes.
- backend/src/controllers/administrative.controller.js: conecta Usuarios, detalle, dashboard e informes al directorio; mantiene lectura de cuentas locales para compatibilidad.
- backend/src/routes/administrative.routes.js: detalle autorizado de registros del directorio.
- backend/src/routes/admin.routes.js: retira la gestión independiente Pacientes, conservando las rutas de cuentas.
- backend/src/repositories/administrative.repository.js: elimina el contador de Pacientes del dashboard.
- backend/src/services/administrative-export.service.js: resúmenes de cuentas/afiliados/coincidencias y avisos en PDF.
- frontend/public/js/administrative.js y frontend/public/pages/admin.html: menú de seis módulos, tabla unificada, filtros, detalle de origen y nuevos indicadores/informes.
- frontend/public/js/admin-pacientes.js, frontend/src/pages/pages/admin-pacientes.astro: acceso antiguo redirigido a Usuarios, sin tabla ni formulario independiente.
- frontend/public/js/admin-cuentas.js, frontend/src/pages/pages/admin-cuentas.astro: unifican también el acceso antiguo de cuentas en la misma tabla.
- backend/tests/administrative-directory.test.cjs: datos de ambas fuentes, coincidencias seguras, no mutación, búsqueda, filtros, paginación, fechas y exportaciones.
- backend/tests/administrative-access-boundary.test.cjs: seis grupos administrativos y rechazo de endpoints retirados.
- backend/tests/pacientes-autorizados-contracts.test.cjs: conserva pruebas de los controladores históricos en un router exclusivo de pruebas; no vuelve a exponer endpoints de producción retirados.
- backend/tests/support/administrative-browser.cjs: fixtures de 50 afiliados y comprobaciones de origen, permisos de filas, paginación, búsqueda y redirecciones.
- backend/scripts/audit-unified-users.cjs y verify-unified-users.cjs: comprobaciones reales de sólo lectura, sin exponer datos personales, contraseñas o JWT.

## Validaciones ejecutadas

- 409 pruebas aisladas de backend aprobadas.
- 53 pruebas generales de navegador aprobadas: directorio, 50 afiliados paginados, búsqueda, filtros, detalles de solo lectura, seis módulos y funciones de otros roles.
- Ocho comprobaciones de la batería administrativa focalizada aprobadas después del ajuste final de los accesos antiguos.
- Compilación frontend aprobada. Astro check sin errores ni advertencias; conserva una sugerencia previa de variable map sin usar en dashboard.js.
- Verificación real del backend local temporal y PostgreSQL: 55 claves únicas, cinco cuentas, 50 afiliados distintos, cero coincidencias y cero revisiones de identidad.
- Comprobados GET de listados, tres páginas, filtros, búsqueda por documento/correo, detalle, dashboard, informes JSON y lectura de compatibilidad de cuentas.
- Rechazo comprobado de la sección Pacientes y de la gestión independiente de afiliados, sesiones ausentes y claims de otros roles en las rutas administrativas.
- Huellas de todos los campos de usuarios y de los 13 campos EPS idénticas antes y después. La auditoría final volvió a confirmar los mismos 50 afiliados, cinco cuentas, cero coincidencias por documento/correo y las mismas huellas.
- Registros reales modificados: 0. Tablas eliminadas: 0. Cuentas creadas/activadas: 0. Contraseñas cambiadas: 0. Migraciones ejecutadas: 0.

Las operaciones de creación, edición o cambio de contraseña de las pruebas de navegador usan exclusivamente fixtures simuladas. En la validación de PostgreSQL real sólo se efectuaron lecturas; no se descargaron informes por endpoints que registran exportaciones en auditoría.

Para repetir la comprobación real con la configuración privada existente, ejecutar node scripts/verify-unified-users.cjs desde backend. Se inicia y cierra un servidor HTTP local temporal usando el código real; no constituye un despliegue remoto.
