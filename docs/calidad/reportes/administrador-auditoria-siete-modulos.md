# Auditoría previa de los siete módulos (2026-11-12)

Revisión realizada antes de la implementación de esta solicitud. Los cambios de reorganización del menú de la solicitud anterior ya estaban presentes.

| Módulo | Existente | Brechas verificadas |
| --- | --- | --- |
| Dashboard | Endpoint, consultas parametrizadas, actualizar y error | Total de pacientes y desglose por estado de solicitudes |
| Usuarios | Listar, buscar, filtrar, crear, editar, hashing bcrypt, validación de duplicados, roles 2/3/4, auditoría transaccional | Detalle individual y confirmación de cambios de rol/estado |
| Pacientes | Tabla específica pacientes_autorizados, API CRUD administrativo, paginación, búsqueda por identidad, auditoría transaccional | Edición/detalle dentro de las siete secciones; búsqueda por correo de cuenta vinculada por documento |
| Solicitudes | Bandeja, detalle, respuestas, historial, responsables, transiciones validadas, notificaciones persistentes | Refrescar bandeja al responder/cambiar estado; mostrar ambas fechas |
| Notificaciones | Listado, contador, filtros, lectura individual, vínculo a solicitud, socket y sondeo de contador | Lectura de todas y actualización automática de listado |
| Informes | JSON/CSV/PDF, fechas, búsqueda, exportación autenticada y auditada | Pacientes, activos/inactivos, atendidas, resúmenes y estado vacío |
| Configuración | Perfil, contraseña segura con revocación, preferencias, parámetros permitidos, FAQ VITALIX | Botones de contraseña/parámetros son type=button y no disparan submit |

## Permisos y datos

- Las rutas administrativas comprueban JWT y estado/rol actuales en PostgreSQL. Usuarios administradores están protegidos de cambios desde el directorio; se editan mediante perfil.
- Los clientes sólo acceden a sus atenciones y notificaciones. Farmacia y EPS no acceden al espacio administrativo.
- Pacientes usa pacientes_autorizados y auditorias_pacientes_autorizados; no es la tabla afiliados ni un alias de usuarios con rol 2. El modelo de paciente no contiene correo. Puede buscarse por correo de la cuenta con el mismo documento sin agregar una columna duplicada ni exponer ese correo.
- Las contraseñas no aparecen en listados, detalle, informes ni auditorías.
- Las tablas administrative_cases/messages/notifications/audit/settings/preferences están definidas en Prisma y en la migración 20261112120000_administrative_workspace.

## Comprobación PostgreSQL de solo lectura

El preflight ejecutado contra la conexión configurada encontró ausentes las seis tablas administrativas. Sólo figuran dos migraciones históricas registradas; no debe ejecutarse indiscriminadamente toda la cadena pendiente. No se encontraron correos duplicados ignorando mayúsculas. La cuenta de rol 1 y una de rol 2 tienen estado NULL; no se activan implícitamente ni se relajan los permisos.

Se ampliará el preflight para verificar todas las columnas utilizadas, incluidas pacientes y sus auditorías. La puesta en funcionamiento requiere aplicar únicamente las migraciones necesarias y verificar luego las consultas reales.

## Implementación y resultado final

- Dashboard: seis indicadores reales (usuarios, pacientes, ABIERTA, EN_ATENCION, RESUELTA y notificaciones sin leer), actualización manual y periódica, carga accesible y errores.
- Usuarios: se conserva alta/edición validada, hashing y permisos. Se añade detalle autenticado mediante GET /api/administrativo/usuarios/:id y confirmación antes de cambios de rol o estado.
- Pacientes: consulta y edición en el panel principal mediante la API existente, búsqueda por nombre/documento o correo de cuenta cliente con el mismo documento, filtro de autorización, fechas, paginación y actualización posterior a la edición. No se añade ninguna columna de correo ni se copian afiliados o usuarios.
- Solicitudes: se conservan bandeja y mensajes históricos en administrative_cases/messages. La bandeja se actualiza después de responder o guardar estado/responsable; muestra creación y actualización. Se corrigió el tipo explícito del parámetro SQL de estado: PostgreSQL rechazaba la combinación text/character varying con código 42P08.
- Notificaciones: PATCH /api/administrativo/notificaciones/leidas marca sólo las del destinatario autenticado; no elimina historial. Se actualizan contador y listado por eventos o sondeo, preservando filtros en edición y borradores.
- Informes: pacientes, usuarios por estado, solicitudes atendidas y resúmenes sobre todos los registros filtrados. Solicitudes y tiempos incluyen las conversaciones administrativas centralizadas. Los archivos vacíos conservan cabeceras CSV y explicación PDF. No se exportan contraseñas ni documentos de pacientes.
- Configuración: botones submit conectados, perfil actualiza la identidad de sesión conservando su tipo temporal/persistente; contraseña confirma el resultado y cierra sesión; se mantienen preferencias, parámetros y FAQ existentes. La consulta de parámetros sólo devuelve general y faq.
- La navegación ignora respuestas de carga atrasadas al cambiar de sección.

## PostgreSQL

Se ejecutó primero el plan de solo lectura de scripts/prepare-administrative-db.cjs. Luego, con autorización de ejecución, se aplicaron exclusivamente las migraciones existentes 20261110230500_create_pacientes_autorizados y 20261112120000_administrative_workspace, en una transacción y registrando sus checksums en _prisma_migrations. No se ejecutó prisma migrate deploy sobre el resto de migraciones pendientes.

El preflight final devuelve compatible=true y faltantes=[]. No se activaron cuentas, no se cambiaron contraseñas existentes y no se modificaron afiliados EPS. El administrador existente sigue con estado NULL, por lo que la política de acceso actual lo bloquea. Su activación es una decisión pendiente, separada de la validación funcional.

## Validación ejecutada

- 387 pruebas aisladas aprobadas (archivos *.test.cjs excepto frontend.test.cjs).
- 51 pruebas de la batería general de navegador aprobadas, incluidos chats de cliente/farmacia y restricciones de roles.
- 8 pruebas de la batería administrativa final aprobadas: detalle/edición de usuarios y pacientes, asignación/respuestas/estados, informes y descargas, parámetros, preferencias y FAQ, actualización por eventos sin borrar borradores, cambio de contraseña y cierre de sesión.
- tests/administrative.postgres.cjs aprobado contra PostgreSQL real: repositorios y rutas/controladores/servicios administrativos, filtros, duplicados, respuestas, historial, responsables, estados, notificaciones, JSON/CSV/PDF, configuración, permisos y revocación. Todos los datos de prueba se revirtieron al finalizar; no se dejaron cuentas ni solicitudes de prueba. Las secuencias pueden conservar saltos normales tras los rollbacks.
- npm run build aprobado. npm run check: cero errores, cero advertencias y una sugerencia previa por variable map sin usar en dashboard.js.

Para repetir la integración real: ejecutar npm run test:integration:administrative desde backend con la conexión PostgreSQL configurada. La prueba escribe exclusivamente fixtures en una transacción que revierte al terminar, también cuando una aserción falla.
