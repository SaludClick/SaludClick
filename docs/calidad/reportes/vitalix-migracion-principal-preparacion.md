# Habilitación de visitantes en la base principal: operación detenida

Actualización posterior autorizada: [respaldo recuperable, migración principal y prueba final aprobados](vitalix-tls-respaldo-migracion-principal.md). El estado detenido de este documento corresponde al intento anterior.

Fecha: 2026-11-13. Autorización: exclusivamente `20261113120000_administrative_visitors`, condicionada a verificar identidad, alcance, respaldo recuperable y conservación de datos.

## Resultado

**No se aplicó la migración.** El respaldo falló con `EPERM` antes de crear el archivo y no pudo verificarse una restauración. Se detuvo la operación conforme a la instrucción de no continuar si alguna comprobación fallaba. No se hicieron escrituras ni cambios de esquema en la base principal.

## Comprobaciones aprobadas

- Se leyó explícitamente `backend/.env`, sin imprimir credenciales, para verificar el destino de `DATABASE_URL`.
- PostgreSQL confirmó `neondb.public`, versión 18.7, en `ep-billowing-bonus-b5hsio7e-pooler.c-7.us-east-2.aws.neon.tech`, consistente con el destino documentado del proyecto.
- La fuente EPS es otra conexión: `ep-delicate-mountain-bei8g1c9-pooler.c-9.us-east-2.aws.neon.tech`.
- Cinco cuentas locales; ID 1 es el administrador activo. Cincuenta afiliados EPS. Cero conversaciones, mensajes y notificaciones administrativas existentes.
- Las columnas de visitante aún no existen y la migración autorizada no está registrada. No se aplicaron otras migraciones.
- El SQL autorizado agrega dos columnas de sesión, una restricción de identidad y un índice único a conversaciones existentes; permite valores nulos para propietario, remitente y actor de auditoría. No incluye eliminación de tablas, altas de usuarios ni actualizaciones de cuentas, contraseñas, afiliados o conversaciones.
- SHA-256 del SQL revisado: `fd419707be3667660b75e55e400aa685b36ea2d84d4ff0c4d1b3d155a8ef2194`.
- Hay una imagen PostgreSQL 18 local disponible para preparar y restaurar el archivo sin usar PostgreSQL 17 contra un servidor 18.

## Comprobación fallida y causa observada

Se preparó `backend/database/backups/vitalix-visitors-20261113`, excluido de Git. Al restringir sus permisos, el directorio quedó accesible únicamente para la identidad de ejecución del sandbox. El proceso autorizado que debía crear el respaldo fuera del sandbox terminó con `EPERM`. La inspección local posterior no encontró archivos en el directorio: no existe un respaldo recuperable ni un manifiesto de restauración verificada.

No se reintentó el respaldo, no se relajaron permisos ni se inició la migración después del fallo. Las conexiones principales de este intento se usaron únicamente para consultas y transacciones de solo lectura.

## Archivos preparados

- `backend/scripts/enable-vitalix-visitors.cjs`: inspección de solo lectura y preparación de respaldo, limitado al destino y SHA-256 revisados. El respaldo está diseñado para exportar una instantánea consistente, restaurarla en un contenedor PostgreSQL 18 separado y comparar huellas de todas las tablas públicas. No se alcanzó esa verificación y el script no implementa ejecución de la migración.
- Este informe.
- Directorio local de respaldo vacío, privado y excluido de Git.

Los cambios de aplicación previos se conservaron. No hubo commit ni push.

## Pendiente

Corregir los permisos del directorio para la identidad que ejecutará el respaldo, manteniéndolo privado; reintentar la copia y su restauración aislada. Solo después de aprobar todas las comprobaciones se podrá aplicar exclusivamente la migración autorizada y validar el flujo posterior. El chat anónimo no se considera habilitado en la base principal; las pruebas exitosas anteriores corresponden al entorno aislado.
