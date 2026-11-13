# VITALIX: permisos corregidos; respaldo detenido por TLS

Actualización posterior autorizada: [TLS corregido, respaldo restaurado y migración principal aplicada](vitalix-tls-respaldo-migracion-principal.md). Este documento conserva el diagnóstico del intento anterior.

Fecha: 2026-11-13. Operación condicionada a respaldo completo y restauración verificada antes de aplicar exclusivamente `20261113120000_administrative_visitors`.

## Resultado

**No se aplicó ninguna migración ni se modificaron datos principales.** Se corrigió el error EPERM del directorio privado. El intento posterior de respaldo falló al verificar el certificado TLS de PostgreSQL desde el contenedor de herramientas. Conforme a la instrucción «Si alguna comprobación falla, detenerse», no se reintentó con otra configuración ni se continuó hacia la restauración o migración.

## Causa exacta del EPERM y corrección

La identidad dentro del sandbox es `DESKTOP-E3PRD20\CodexSandboxOffline`; el proceso de respaldo fuera del sandbox se ejecuta como `DESKTOP-E3PRD20\SAMIR ACOSTA`. El directorio tenía herencia deshabilitada y una sola entrada de acceso para la primera identidad. La cuenta del respaldo no podía leer sus permisos ni crear el archivo.

Se comprobó la ruta absoluta y se agregó únicamente una entrada de control total para la cuenta que ejecuta el respaldo, con herencia limitada a los archivos y subdirectorios de:

`backend/database/backups/vitalix-visitors-20261113`

Resultado: dos identidades concretas con acceso, sin entradas heredadas y sin Everyone. No se modificaron permisos globales de Windows ni directorios externos. La comprobación desde la identidad del respaldo confirmó acceso y permitió crear el archivo.

## Respaldo

Se preparó el ejecutor para generar un archivo custom completo mediante PostgreSQL 18 `pg_dump`, con instantánea consistente exportada desde una transacción de solo lectura. La copia conserva metadatos de propietario y privilegios; la restauración de ensayo está diseñada para omitir su aplicación a roles del servidor temporal.

También se preparó la comparación de contenido de todas las tablas públicas, relaciones, índices y secuencias contra la restauración. La ordenación para calcular huellas usa la colación C para evitar diferencias de orden entre servidores.

La conexión principal se verificó contra el host y SHA-256 fijados en la revisión previa. Se consultaron las tablas dentro de una transacción de solo lectura y se confirmó que seguían existiendo cinco cuentas locales y 50 afiliados en la fuente EPS separada. Las columnas anónimas aún no estaban presentes.

El contenedor de herramientas terminó con:

```text
pg_dump: error: connection to server ... failed: SSL error: certificate verify failed
```

Se usaron `PGSSLMODE=verify-full` y `PGSSLROOTCERT=system`. No se deshabilitó la validación TLS. Este error identifica el punto de fallo; todavía no se determinó si la cadena presentada o el almacén de confianza del contenedor requiere corrección.

Archivos privados presentes:

- `saludclick-primary.backup`: **0 bytes, incompleto, no utilizable**.
- `backup-command-error.private.txt`: diagnóstico local del intento.
- No existe `verified-backup.json` ni una restauración certificada.

Todo queda bajo el directorio privado excluido por la regla existente `**/database/backups/`. No se imprimieron credenciales ni contenidos de cuentas o contraseñas.

## Restauración, migración y pruebas finales

| Etapa | Resultado |
| --- | --- |
| Causa del EPERM | Confirmada: identidades de ejecución distintas y ACL limitada al sandbox |
| Permisos privados | Corregidos y comprobados desde la cuenta del respaldo |
| Identidad de base y SQL autorizado | Sin cambios respecto al destino y checksum revisados |
| Respaldo completo y legible | Fallido: conexión TLS rechazada; archivo vacío |
| Restauración temporal | No ejecutada; no se alcanzó esa etapa |
| Migración de visitantes | No ejecutada |
| Prueba posterior del chat en principal | No ejecutada; la migración sigue pendiente |
| Cuentas, contraseñas, EPS y conversaciones | Sin escrituras de esta operación |
| Otras migraciones, commit y push | No ejecutados |

Las pruebas de chat aprobadas previamente corresponden al entorno aislado y no se presentan como validación de la base principal.

## Archivos modificados en esta intervención

- ACL del directorio privado de respaldo indicado arriba.
- `backend/scripts/enable-vitalix-visitors.cjs`: respaldo completo, diagnóstico privado, ordenación estable de huellas y verificación prevista de relaciones, índices y secuencias.
- Este informe.

Se conservaron todos los cambios previos de aplicación y la migración autorizada. No se cambiaron funcionalidades de Farmacia, EPS o Paciente ni los seis módulos administrativos.

## Pendiente

Revisar la cadena de confianza TLS que utiliza el contenedor de herramientas y, con autorización para continuar después del fallo, corregirla sin desactivar la validación de certificados. Después deberá generarse una copia nueva, verificar su restauración aislada y volver a comprobar identidad y SQL antes de aplicar exclusivamente la migración autorizada.
