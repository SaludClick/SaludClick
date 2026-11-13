# VITALIX: TLS corregido, respaldo recuperable y migración principal aplicada

Fecha: 2026-11-13. Autorización: corregir exclusivamente la confianza TLS de pg_dump y aplicar `20261113120000_administrative_visitors` después de verificar destino, respaldo y restauración. Sin commit ni push.

## Resultado

**La migración autorizada quedó aplicada en la base principal de SaludClick.** El chat público aprobó el recorrido completo contra esa base con dos navegadores Edge reales y el código actual del proyecto. No se crearon usuarios ni se habilitó el registro público.

La validación usó un servidor HTTP local temporal conectado a PostgreSQL principal, Socket.IO real y las interfaces compiladas. Ese servidor se cerró al terminar. No se hizo despliegue remoto ni se verificó un sitio publicado externo; no se afirma que un servidor remoto esté ejecutando este código.

## Diagnóstico TLS

El error inicial de pg_dump era `SSL error: certificate verify failed`. La inspección del contenedor confirmó:

- Cliente: `pg_dump 18.6`, imagen local `postgres:18`, OpenSSL 3.5.7. Servidor principal: PostgreSQL 18.7. Cliente y servidor pertenecen a la misma versión mayor.
- No existían `/etc/ssl/certs/ca-certificates.crt` ni el directorio adicional de certificados CA en esa imagen.
- `openssl s_client -starttls postgres` identificó `verify error:num=20: unable to get local issuer certificate`.
- Cadena presentada: certificado del servidor `*.c-7.us-east-2.aws.neon.tech` → Let's Encrypt YR2 → Root YR, firmado por ISRG Root X1. El certificado del servidor es válido del 25 de octubre de 2026 al 23 de enero de 2027.
- El nombre del endpoint principal coincide con el certificado wildcard. El fallo era la ausencia de una raíz de confianza en el contenedor, no un nombre de servidor distinto.

Se obtuvo **ISRG Root X1** desde `https://letsencrypt.org/certs/isrgrootx1.pem`, por HTTPS validado. Se verificaron su condición de CA, autofirma, coincidencia con la raíz incorporada en Node y huella SHA-256:

```text
96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6
```

La procedencia y cadena se contrastaron con la [documentación oficial de Let's Encrypt](https://letsencrypt.org/certificates/). Se configuró la raíz mediante un montaje de solo lectura para el contenedor y `PGSSLROOTCERT=/run/isrg-root-x1.pem`, manteniendo `PGSSLMODE=verify-full`, que valida cadena y nombre conforme a la [documentación de PostgreSQL](https://www.postgresql.org/docs/18/libpq-ssl.html).

La comprobación desde el mismo contenedor terminó con **Verification: OK**, nombre verificado, TLS 1.3 y `TLS_AES_256_GCM_SHA384`. No se deshabilitó TLS, no se usaron modos de verificación inferiores, no se aceptaron CA desconocidas y no se modificó el almacén global de Windows. Las credenciales se suministraron por stdin, sin incluirlas en órdenes, URL de navegador o registros.

## Identidad y alcance autorizados

- Base principal: `neondb.public`, endpoint `ep-billowing-bonus-b5hsio7e-pooler.c-7.us-east-2.aws.neon.tech`.
- Fuente EPS independiente: `ep-delicate-mountain-bei8g1c9-pooler.c-9.us-east-2.aws.neon.tech`.
- Antes de migrar: cinco cuentas, administrador ID 1 activo, 50 afiliados EPS y cero conversaciones, mensajes o notificaciones administrativas existentes.
- La migración se leyó desde el archivo ya revisado y se fijó su SHA-256. No se alteró su SQL.
- Solo agrega las dos columnas de sesión visitante, la restricción de identidad y el índice único de conversación anónima, y permite propietario, remitente y actor nulos para ese flujo. No incluye modificaciones de cuentas, contraseñas, afiliados ni eliminación de datos.

## Respaldo y restauración

Respaldo completo de la base principal generado con `pg_dump --format=custom` y una instantánea consistente exportada desde una transacción de solo lectura. El archivo conserva metadatos de propietarios y privilegios.

Ubicación privada:

```text
backend/database/backups/vitalix-visitors-20261113/saludclick-primary-tls-verified.backup
```

- Tamaño: **74.213 bytes**. Cabecera custom `PGDMP` válida, archivo legible y catálogo de restauración comprobado.
- SHA-256: `b37166a8aa506ef3c8f97842e8365f70e3bf57e54171299e0696fd466b400a79`.
- Directorio con permisos restringidos a las dos identidades concretas ya autorizadas: cuenta Windows del respaldo y sandbox. Sin Everyone ni cambios de permisos globales.
- Respaldo, CA y evidencias privadas excluidos de Git por la regla existente `**/database/backups/`.
- El archivo vacío del intento anterior permanece separado con su nombre original y **no** se considera respaldo utilizable.

Se restauró con `pg_restore --exit-on-error` en el contenedor nuevo `saludclick-vitalix-restore-97528d98`, base `saludclick_recovery_verify`, puerto aleatorio publicado exclusivamente en `127.0.0.1`. Nunca se restauró sobre la principal. La contraseña temporal fue aleatoria; no se mostró ni se guardó en el informe.

Para ese ensayo aislado se utilizaron `--no-owner --no-privileges`, evitando recrear roles del proveedor Neon. El archivo original conserva dichos metadatos. La verificación de permisos de la principal se realizó separadamente antes y después de la migración.

Verificación recuperable aprobada:

- **20 tablas**, contenido completo y cinco cuentas con todos sus campos conservados, incluidos hashes de contraseña.
- **147 restricciones**, incluidos vínculos entre tablas, **52 índices** y **17 secuencias**, con valores y definiciones comprobados.
- Todas las huellas de datos restaurados coinciden con la principal. Se usó ordenación C y zona horaria UTC para calcularlas de forma estable.
- La fuente EPS conservó sus 50 afiliados y las huellas completas de sus tablas.
- El contenedor de restauración se detuvo al finalizar, conservando la copia local y el respaldo privado.

### Diferencia de representación resuelta durante la verificación

La primera comparación de metadatos encontró diferencias textuales en dos CHECK de `administrative_cases`, para `estado` y `tipo`. No había diferencias de datos, índices o secuencias. El origen expresa la conversión a texto sobre el array y la restauración la distribuye entre sus elementos.

Se admitieron únicamente esas dos representaciones exactas de las restricciones conocidas. También se ejecutaron consultas de solo lectura con valores válidos, inválidos, vacíos, nulos, minúsculas y espacios: el resultado fue idéntico en origen y restauración. Siete comprobaciones del comparador confirmaron que cambios de valores, operador, validación, índice o secuencia siguen siendo rechazados. No se modificaron las restricciones de ninguna base para aprobar el ensayo.

El manifiesto `verified-backup.json` se generó solo después de aprobar estas comprobaciones y verificar que las fuentes no habían cambiado. La migración no se ejecutó mientras esta verificación estaba sin resolver.

## Migración aplicada

- Nombre: **`20261113120000_administrative_visitors`**.
- Confirmación: **2026-11-13 16:23:28 UTC** — 11:23:28 de Bogotá.
- SHA-256 del SQL: `fd419707be3667660b75e55e400aa685b36ea2d84d4ff0c4d1b3d155a8ef2194`.
- Otras migraciones ejecutadas: **0**. No se ejecutó `migrate deploy`.

El ejecutor comprobó otra vez host, base, esquema, checksum y prueba de respaldo recuperable. Dentro de una transacción tomó bloqueos, comparó los datos con el respaldo, ejecutó exclusivamente el SQL fijado y registró solo esa migración en `_prisma_migrations`.

Antes de COMMIT comprobó columnas, índice único y restricción validados, datos anteriores intactos, permisos y propietarios de objetos sin cambios, roles PostgreSQL sin cambios y fuente EPS sin cambios. La comparación de conversaciones existentes excluyó únicamente las dos columnas nuevas, cuyos valores iniciales son nulos. Después de COMMIT repitió la comprobación del registro y de los datos conservados. Todo aprobó.

Evidencia privada: `migration-applied.json`. La aplicación del esquema no creó conversaciones ni cuentas.

## Prueba final contra la base principal

`node scripts/verify-vitalix-primary.cjs` abrió dos procesos Edge headless con perfiles separados:

1. Visitante en Inicio, widget VITALIX, sin cuenta ni JWT de usuario.
2. Administrador con sesión JWT temporal en memoria para la cuenta activa existente, validada por los guards reales. No se solicitó ni cambió su contraseña; el formulario de login y captcha no forman parte de esta comprobación.

Recorrido final aprobado:

- Saludo resuelto por el bot sin abrir una conversación administrativa.
- Solicitud de atención humana desde el widget: persistencia confirmada, campana y contador automáticos.
- Enlace desde Notificaciones a Solicitudes; identidad «Visitante» y mensaje visible.
- Mensajes alternados y respuestas administrativas dentro del mismo VITALIX; estado «En tiempo real» con Socket.IO real.
- Recarga del visitante y recuperación del historial.
- Corte de red del visitante, respuesta del administrador desde Solicitudes y recepción al reconectar.
- Reenvío HTTP con el mismo contenido y la clave original: respuesta repetida, sin mensaje ni notificación adicionales.
- Otra sesión anónima no puede consultar el historial ni entrar en la sala. Las rutas administrativas rechazan ausencia de JWT y credenciales visitantes con 401; un rol falsificado para la identidad administrativa devuelve 403.
- Cierre, reapertura y cierre final desde Solicitudes.
- Usuarios muestra **55 registros: cinco cuentas locales y 50 afiliados EPS**. Menú con Dashboard, Usuarios, Solicitudes, Notificaciones, Informes y Configuración.
- Cero excepciones JavaScript propias en ambos navegadores del recorrido final.

Resultado final de ese recorrido: **conversación sintética ID 7, seis mensajes, tres notificaciones de mensaje para el administrador, sin nuevas cuentas, estado CERRADA**.

### Incidencias del guion de comprobación

El primer intento de abrir la interfaz con el servidor temporal fue bloqueado por CORS: su puerto aleatorio no figuraba en la configuración de origen del proceso. Las rutas HTTP reales respondían correctamente. Se configuró únicamente el origen exacto del proceso temporal antes de cargar la aplicación, sin modificar `.env`, el guard CORS del proyecto o su lista persistente de orígenes.

Un recorrido posterior llegó a cinco mensajes y sus notificaciones, pero terminó por tiempo de espera sin confirmar el indicador de conexión. No hubo excepciones JavaScript ni operaciones rechazadas en su auditoría. Se amplió el diagnóstico y el margen de espera del guion; el recorrido final con el mismo código de aplicación aprobó. No se atribuye una causa definitiva a ese tiempo de espera.

Ese intento dejó la conversación sintética ID 6 con cinco mensajes. Se verificaron su propietario anónimo, identificador y todos sus mensajes marcados como prueba antes de cerrarla mediante la lógica administrativa existente. No se eliminaron mensajes ni auditorías. Quedan **dos conversaciones de validación cerradas, once mensajes sintéticos y seis notificaciones de mensaje** en total; pertenecen a sesiones de prueba diferentes, no son duplicados de reintento. Los mensajes llevan la marca `[VERIFICACION VITALIX ...]`.

Para los reintentos posteriores del guion se conservó la credencial anónima únicamente en un archivo privado, evitando crear una nueva conversación si se retoma esa misma sesión. No se publica esa credencial.

## Conservación final y archivos

Después de cerrar las dos conversaciones se volvieron a comparar todas las tablas ajenas al chat y la fuente EPS contra el respaldo previo a la migración. Coinciden íntegramente. Permanecen las cinco cuentas, contraseñas, roles, permisos y 50 afiliados originales. No se alteraron Farmacia, EPS, funciones independientes del Paciente, los seis módulos ni el estado deshabilitado del registro público.

Archivos de esta intervención:

- `backend/scripts/enable-vitalix-visitors.cjs`: CA fijada y montaje de solo lectura, respaldo y restauración, comparación estricta con las dos equivalencias de CHECK verificadas, manifiesto recuperable y ejecución transaccional de la única migración autorizada.
- `backend/scripts/verify-vitalix-primary.cjs`: prueba posterior con dos navegadores y protección de datos ajenos al chat.
- Este informe y referencias desde los informes anteriores.
- Archivos operativos privados bajo el directorio excluido de Git: respaldo, catálogo, CA, manifiesto, resultado de migración, sesión de prueba y verificaciones finales. No deben publicarse.

No se modificó el SQL de la migración, el código funcional del chat o las configuraciones persistentes de TLS/CORS de la aplicación. No hubo commit ni push. No queda pendiente una prueba requerida de este flujo contra la base principal; cualquier despliegue remoto debe evaluarse separadamente.
