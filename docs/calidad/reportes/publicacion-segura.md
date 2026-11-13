# Preparación segura de la publicación

## Configuración privada de mantenimiento

Los scripts de activación, invitación y comprobación de cuentas ya no contienen
correos personales incrustados. Utilizan estas variables del entorno privado:

| Variable | Uso |
| --- | --- |
| `AUTHORIZED_FARMACIA_EMAIL` | Cuenta autorizada de farmacia, rol 3 |
| `AUTHORIZED_EPS_EMAIL` | Cuenta autorizada de EPS, rol 4 |
| `AFILIADOS_EXPECTED_HOST` | Destino revisado del plan y respaldo de mantenimiento |
| `EPS_HISTORICAL_ARCHIVE` | Ruta local privada del archivo histórico usado por la auditoría EPS |

El archivo `backend/.env.example` incluye únicamente nombres y valores vacíos;
las direcciones reales se configuran fuera de Git. No se modificó ningún `.env`
local ni ninguna cuenta, contraseña, estado o rol de PostgreSQL.

La configuración de cuentas se valida al ejecutar las operaciones que la
necesitan: deben existir dos correos válidos distintos y se conservan los roles
permitidos 3 y 4. La ausencia de configuración bloquea esas operaciones antes
de modificar cuentas. No hay un valor alternativo que permita invitar a
cualquier destinatario. El login normal, Google y la recuperación de una
cuenta existente no dependen de esta nueva lista.

Para conservar el alcance operativo anterior, el responsable debe configurar
privadamente las mismas direcciones autorizadas. No ejecutar scripts de
activación, importación, restauración o migración como parte del despliegue o
de esta publicación: requieren autorización operativa independiente.

## Login Astro

`frontend/src/pages/login.astro` sustituye al antiguo
`frontend/public/login.html`. Con `output: static` y `build.format: file`,
`npm run build` genera `frontend/dist/login.html`. Express sirve ese directorio
cuando existe. La compilación del frontend es un paso necesario para el
despliegue; el fallback a `public` no contiene las páginas Astro.

## Archivos locales excluidos

Se preservan en disco y se ignoran mediante patrones específicos de
`.gitignore` los TXT de validación, el diagnóstico de pedidos, el recibo de
activación, las evidencias de terminal y los informes operativos de afiliados
y activación. Pueden contener correos, rutas privadas, detalles de la base,
huellas de archivos o información del entorno.

También se conserva fuera del commit el archivo accidental cuyo nombre
empieza por SaludClick y termina en U+F022. Se inspeccionó: contiene un listado
de 57 rutas, sin funcionalidad del proyecto.

No se publican archivos `.env`, respaldos de datos, archivos privados de
fórmulas ni artefactos `node_modules`/`dist`. Los scripts seguros se conservan;
sus resultados locales no se incluyen automáticamente.

## Hallazgo histórico

La inspección de los objetos de texto del historial local encontró hashes
bcrypt persistidos en versiones antiguas de:

- `database/catalogo_completo.sql`
- `database/migration_profesional.sql`
- `database/saludclick_demo_completo.sql`
- `database/seed.sql`

No se reproducen aquí los hashes ni se comprobó si las cuentas eran reales o
de demostración. Un hash de contraseña expuesto permite intentos de ataque
sin conexión; si corresponde a una contraseña real o reutilizada, el titular
debe evaluar su cambio y la revocación de sesiones. No se reescribió el
historial ni se cambiaron credenciales. La inspección no certifica ausencia
absoluta de secretos ni determina su vigencia.

## Verificación

Las pruebas utilizan fixtures y bases sustituidas en memoria. La publicación
no ejecuta migraciones ni comprobaciones que escriban en PostgreSQL real.
El ensayo de la migración administrativa y su habilitación siguen pendientes
de autorización, tal como indica `administrador-implementacion.md`.

Resultados antes del commit:

- Backend sin navegador: 324 comprobaciones aprobadas, sin fallos.
- Navegador Edge con perfil y API de pruebas aislados: 44 aprobadas, sin fallos.
- Motor VITALIX y resumen frontend: 6 aprobadas, sin fallos.
- Prisma: esquema válido, sin ejecutar migraciones.
- Astro check: sin errores; conserva una sugerencia preexistente sobre una
  variable sin uso en el dashboard del paciente.
- Astro build: compilación satisfactoria; `dist/login.html` generado.
- Revisión de candidatos: sin coincidencias de correos personales, conexiones
  literales, tokens JWT persistidos, hashes bcrypt, claves privadas, tokens de
  proveedor o rutas de usuario locales. Las credenciales ficticias de los
  tests son fixtures, no cuentas o secretos operativos.
