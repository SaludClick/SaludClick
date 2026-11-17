> Estado actualizado el 2026-11-14: respaldo certificado con PostgreSQL 18.7, migración de integración aplicada, cuenta 5 asociada a EPS VidaPlena e importación de 50 afiliados verificada sin duplicados. Informe vigente: [integración de cuatro roles](eps-integracion-cuatro-roles-2026-11-14.md). El contenido siguiente conserva el diagnóstico histórico y no describe el estado actual.
# Integracion EPS condicionada: respaldo pendiente de certificacion

Fecha: 2026-11-13, con comprobaciones posteriores al cambio de esquema observado
a las 2026-11-14 04:15:31 UTC. La autorizacion condicionada para migrar, asociar
la cuenta 5 e importar los 50 afiliados esta vigente. No se solicita de nuevo.

## Estado real comprobado al terminar esta intervencion

- La migracion 20261114090000_eps_workspace figura aplicada en DATABASE_URL.
  Checksum: 2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835.
- Al iniciar esta intervencion no figuraba aplicada; aparecio durante las
  comprobaciones. Ninguno de los comandos reales de esta intervencion ejecuto
  su modo de aplicacion. No se atribuye esa aplicacion a un ejecutor desconocido
  ni se revierte o repite un cambio cuyo checksum coincide con el revisado.
- Destino confirmado: neondb/public en
  ep-billowing-bonus-b5hsio7e-pooler.c-7.us-east-2.aws.neon.tech.
  Huella: 7640c9f603b5eb8ae23dd8e47ef8c1057d2a570285547b07acd322e9163baa5d.
- Las ocho tablas EPS y afiliados existen y estan vacias. Afiliados: 0;
  entidades: 0; accesos: 0; vinculos de farmacia: 0; existencias: 0;
  autorizaciones: 0; seguimientos: 0; eventos: 0; lecturas: 0.
- Documentos duplicados en afiliados: 0.
- API health: 200. Verificacion EPS para cuenta 5: 403 EPS_MEMBERSHIP_REQUIRED.
  El bloqueo actual ya no es falta de tablas: falta la asociacion de la cuenta.
- La fuente independiente conserva los 50 afiliados de EPS VidaPlena, entidad 1.
  Huella del snapshot: 904303d0e7b6661173807d1982615ffc280d86acb9077e7d19e11dc29e171bda.
- Plan actual de asociacion/importacion: schemaReady=true, 50 afiliados nuevos,
  0 coincidencias verificadas para vincular cuentas de pacientes existentes.
  Plan SHA256: 7b91d55a70942c1b553e6a643b811882553f44f94dbbcd66cd59d45aa3723977.
- Escrituras reales realizadas por esta intervencion en ambas bases: 0.
  Afiliados importados por esta intervencion: 0. No se modifico la fuente EPS.

## Condicion que impide continuar con las escrituras

No existia en este espacio de trabajo el respaldo privado mencionado en informes
anteriores. Se genero un archivo custom completo mediante pg_dump 18.3, con
TLS verify-full y snapshot consistente de solo lectura. El destino y SQL
coinciden con lo autorizado y no contienen borrado de tablas o registros.

Archivo privado:
backend/database/backups/eps-20261113-225750/primary-before-eps.backup

Tamano: 77753 bytes. Cabecera PGDMP valida.
SHA256: 9b11d84afcb6c05496e54d18eaf1bfe43da7d8821b84f686cb375b65701d5d5d.

El directorio y el archivo permiten acceso solamente al operador JUAN/juand y
SYSTEM y estan excluidos de Git. El archivo original se conserva intacto.

La restauracion se intento en una instancia PostgreSQL 18.3 aislada, protegida
por SCRAM y limitada a 127.0.0.1. La base de origen usa PostgreSQL 18.7.
pg_restore se detuvo con:

    ERROR: unrecognized parameter "pg_attver"

Son exactamente estas dos instrucciones del esquema exportado:

    ALTER TABLE ONLY public.administrative_cases ALTER COLUMN visitante_hash SET (pg_attver=55783408);
    ALTER TABLE ONLY public.administrative_cases ALTER COLUMN visitante_expira_at SET (pg_attver=55784296);

pg_attver es una opcion interna de versionado de atributos de PostgreSQL:
[documentacion oficial de pg_attribute](https://www.postgresql.org/docs/17/catalog-pg-attribute.html).
El problema observado es de compatibilidad entre el esquema exportado y las
herramientas locales. No se desactivo TLS ni se modificaron tablas de Neon.

Se corrigio ademas una espera de pg_ctl en Windows: el proceso del servidor
heredaba canales de salida y el ejecutor esperaba close despues de que pg_ctl
ya habia terminado. Se detuvo unicamente el ejecutor identificado, se conservo
el archivo y se reanudo la restauracion. El fallo pg_attver posterior es real y
no se oculta. La instancia local temporal se detuvo al terminar; no se altero
el servicio PostgreSQL habitual del equipo.

NO existe verified-backup.json porque la restauracion aun no aprobo. La cabecera
y checksum del archivo no sustituyen una prueba de recuperacion. Por esa razon
no se ejecuto la asociacion ni la importacion autorizadas de forma condicionada.

## Adaptacion local preparada, sin ejecutar

Se genero original-recovery.private.sql desde el archivo custom y una copia
compatible-recovery.private.sql que omite exclusivamente las dos instrucciones
anteriores. Se conserva todo el resto del SQL, incluidos datos, definiciones,
restricciones, indices y secuencias. No se modifico el archivo custom original.

- SQL original SHA256: 5de7a92a3364774813db18fc61008017906ef0a3bf2907f61cee78a8e9f382f8.
- Copia propuesta SHA256: c90965e36316b97ac8a0cad3dadf9946ed568c70acb44584f18fbfc384ed0bde.
- Evidencia privada: recovery-compatibility-plan.json, modo PLAN_ONLY_REQUIRES_APPROVAL.
- Restauracion con la copia propuesta: NO EJECUTADA.

Se solicito autorizacion especifica para usar esa copia solo en el ensayo local
y continuar con los cambios previamente autorizados unicamente si todos los
datos, indices, restricciones y secuencias coinciden. Esa respuesta esta pendiente.
Si hay un respaldo recuperable ya certificado por otra via, tambien puede
aportarse su evidencia en lugar de usar esta adaptacion.

El respaldo se tomo antes de que apareciera aplicada la migracion EPS. La
verificacion posterior debera considerar ese cambio conocido del esquema;
no se exigira una igualdad falsa entre estados anteriores y posteriores ni se
ignoraran diferencias de datos. Todo cambio no previsto detendra el proceso.

## Pruebas realizadas

- 6 pruebas aprobadas de migracion y activacion con PostgreSQL en memoria:
  checksum/destino, rollback, registro atomico/idempotente, datos de origen,
  pertenencia de cuentas, conflictos y rechazo cuando falla la recuperacion.
- 2 pruebas aprobadas del adaptador de SQL: solo acepta las dos instrucciones
  revisadas; conserva los otros contenidos y rechaza opciones adicionales,
  duplicadas o incompletas.
- Destino, SQL, planes de activacion, duplicados y estado real de API comprobados
  en lectura. La aplicacion no pierde su guard de seguridad.
- La restauracion nativa fallo; no se presenta como prueba aprobada.
- Los nueve modulos EPS no se presentan como funcionales en Neon mientras falta
  la vinculacion y no se cumple la condicion del respaldo. Las pruebas anteriores
  del panel en entorno aislado siguen documentadas por separado.

## Archivos de esta intervencion

- backend/scripts/eps-backup.cjs: respaldo consistente y ensayo nativo privado.
- backend/scripts/eps-apply-schema.cjs: exige evidencia recuperable en el CLI;
  valida checksum, archivo y destino y compara los datos bajo bloqueo antes de
  escribir. No ejecuta migraciones ajenas ni altera credenciales.
- backend/scripts/eps-restore-compat.cjs: produce solo un plan local revisable;
  no ejecuta SQL ni cambia el respaldo original.
- backend/tests/eps-activation.isolated.cjs: rechazo de respaldo no certificado.
- backend/tests/eps-restore-compat.test.cjs: limites del adaptador de metadatos.
- Este informe. Los archivos privados quedan bajo database/backups, fuera de Git.

No se cambio el panel, sus colores, estructura, credenciales, dependencias ni
los modulos de otros roles. No hubo commits, pushes o despliegues.
