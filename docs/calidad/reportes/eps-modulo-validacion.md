> Estado actualizado el 2026-11-14: respaldo certificado con PostgreSQL 18.7, migración de integración aplicada, cuenta 5 asociada a EPS VidaPlena e importación de 50 afiliados verificada sin duplicados. Informe vigente: [integración de cuatro roles](eps-integracion-cuatro-roles-2026-11-14.md). El contenido siguiente conserva el diagnóstico histórico y no describe el estado actual.
# EPS: implementacion y verificacion

Actualizacion vigente: [integracion condicionada y respaldo pendiente](eps-integracion-respaldo-pendiente.md). La migracion aparecio aplicada durante la comprobacion; el bloqueo actual es la vinculacion EPS y la certificacion de recuperacion. La autorizacion condicionada ya fue recibida.

Fecha: 2026-11-13. Estado: implementado y validado en entorno aislado;
activacion de tablas, vinculaciones e importaciones en Neon pendiente de aprobacion.

## Seguimiento actual: causa del error y correcciones

Estado: NO FINALIZADO en Neon; autorizaciones de esquema y asociacion/importacion
solicitadas y aun no recibidas. No se ejecutaron escrituras reales.

Se verifico el backend que ya escucha en localhost:3000: health responde 200,
la API EPS sin JWT responde 401 y la pagina Astro en localhost:4321 responde 200.
Se emitio un JWT local de diagnostico de 60 segundos para la cuenta EPS activa 5,
sin imprimirlo ni alterar la cuenta; la ruta protegida confirmo HTTP 503 con
EPS_SCHEMA_PENDING. El cliente Prisma generado incluye los ocho modelos EPS.

La causa concreta es la ausencia de afiliados y de las ocho tablas EPS en la base
principal. La conexion Neon, el rol 4 y la cuenta 5 estan disponibles. El historial
Prisma no contiene 20261114090000_eps_workspace. Se revisaron los campos y permisos
previos necesarios para esa migracion; estan presentes y el SQL no cambio.

Correcciones adicionales realizadas:

- eps-errors.js clasifica esquema pendiente, cliente Prisma antiguo, falta de
  permisos, indisponibilidad y fallos inesperados. Los mensajes no incluyen SQL,
  credenciales ni datos medicos. Los logs solo incluyen fase y codigos saneados.
- El guard EPS y el controlador usan ese diagnostico. La cuenta, entidad,
  vinculacion, rol vigente y revocacion siguen siendo obligatorios.
- Afiliados, filtros y autorizaciones reconocen Activo/ACTIVO sin reescribir
  datos de origen. Los formularios preservan valores originales como Subsidiado.
- Perfil admite contacto aun no registrado y muestra NIT sin registrar de forma
  explicita. No se inventan datos de contacto. Los campos de identidad de la EPS
  y las cuentas siguen sujetos a los controles existentes.
- Las listas vacias de Pacientes e Inventario explican sus condiciones reales.
  No se muestran pacientes globales ni existencias globales como stock de farmacia.
- eps-apply-schema.cjs prepara un plan de solo lectura. Su modo de aplicacion
  exige checksum y destino aprobados, verifica prerrequisitos, rechaza estados
  parciales y aplica exclusivamente la migracion EPS junto con su registro en
  _prisma_migrations en una misma transaccion. No ejecuta migrate deploy.
- eps-activate.cjs y eps-activation.service.js preparan la asociacion e importacion
  mediante un plan firmado con SHA256. La aplicacion vuelve a verificar el plan,
  el destino, la cuenta y la fuente; rechaza conflictos y cambios de identidad.
  Conserva los 13 campos originales, no sobrescribe afiliados editados localmente
  ni crea cuentas de pacientes. Solo vincula cuentas por coincidencia exacta con
  autorizacion vigente. Los metadatos reales aportados pueden completar campos
  vacios mediante un nuevo plan aprobado; no reemplazan valores ya registrados.

Hallazgos de datos reales, consultados exclusivamente en lectura:

- Base principal: neondb/public en
  ep-billowing-bonus-b5hsio7e-pooler.c-7.us-east-2.aws.neon.tech.
- Cuenta EPS disponible: id 5, EPS SaludClick, activa.
- Fuente original independiente: entidad 1, EPS VidaPlena, Medellin, activa;
  50 afiliados con estado Activo y regimen Subsidiado.
- Plan propuesto: asociar cuenta 5 a entidad 1 e incorporar esos 50 afiliados.
  Hay 0 vinculaciones verificadas con cuentas de pacientes existentes; no se
  inferiran ni se crearan cuentas para llenar Pacientes o Solicitudes.
- La fuente no aporta NIT, correo, telefono o direccion de la entidad; esos
  campos permanecerian sin registrar hasta recibir datos reales autorizados.
- Ninguna de las dos bases tiene inventario por farmacia. Hace falta un archivo
  o servicio de existencias reales y la confirmacion de los convenios; no se
  atribuyo el catalogo global a ninguna farmacia.

Planes finales de solo lectura:

- SQL SHA256: 2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835
- Destino: 7640c9f603b5eb8ae23dd8e47ef8c1057d2a570285547b07acd322e9163baa5d
- Plan previo al esquema: f479cee08f4cfff67be6f20d56a91578f3b92825b06a521b0d09fdec0484d64b
- Fuente: 904303d0e7b6661173807d1982615ffc280d86acb9077e7d19e11dc29e171bda

El plan de activacion se debe regenerar despues de aplicar el esquema, porque
incluye la disponibilidad de las tablas y el estado de los registros. Un cambio
de fuente, entidad, cuenta, metadatos o estado invalida la aprobacion del plan.

Resultados de esta correccion:

| Comprobacion | Resultado |
| --- | --- |
| Regresion unitaria y API, sin navegador | 418 aprobadas, 0 fallidas |
| Regresion general en Edge, incluidos otros roles | 54 aprobadas, 0 fallidas |
| Flujos HTTP EPS y Edge con PostgreSQL aislado | 9 aprobadas, 0 fallidas |
| Migracion, plan, activacion/importacion y rollback aislados | 6 aprobadas, 0 fallidas |
| Prisma validate | Esquema valido; 8 modelos EPS generados |
| Astro build y Astro check | Correctos; 0 errores, 0 advertencias; 1 hint previo |
| API real para cuenta EPS 5 | 503 EPS_SCHEMA_PENDING, causa verificada |
| Aplicaciones/importaciones reales | 0, pendientes de aprobacion |

Las 15 pruebas de integracion usan PostgreSQL WASM/PGlite en memoria. Edge
verifica todos los apartados, formularios, preservacion de valores de la fuente,
historial, diseno movil y logout. Las pruebas de activacion cubren checksum o
destino incorrectos, rollback completo, registro idempotente de la migracion,
aprobaciones invalidadas, conservacion de campos, vinculacion verificada,
conflictos de pertenencia y completado controlado de metadatos.

Los fallos detectados durante la construccion del nuevo arnes fueron corregidos
y las ejecuciones finales terminaron aprobadas. No se modificaron .env,
credenciales, versiones de dependencias, CSS ni estructura HTML en esta correccion.
No hubo commits, pushes ni despliegues.

## Verificacion de la entrega anterior

## Funcionalidades entregadas

Dashboard con contadores por entidad; registro, busqueda, filtros y actualizacion
de afiliados; pacientes explicitamente vinculados y sus solicitudes/autorizaciones;
farmacias y gestion de convenios; stock por farmacia, agotados y umbrales;
autorizaciones con decisiones, motivos, responsables e historial paginado;
seguimientos EPS separados de los estados operativos de farmacia; campana y lectura
por colaborador; perfil de la entidad; JWT, cuenta y vinculacion vigentes; logout
local y revocacion de sesiones EPS en el servidor. No se usan fixtures en produccion.

## Resultados obtenidos

| Comprobacion | Resultado |
| --- | --- |
| Suite completa backend npm test, incluida regresion en Edge | 470 aprobadas; 0 fallidas; 0 omitidas |
| EPS HTTP + PrismaPg + PostgreSQL WASM/PGlite en memoria + Edge | 9 aprobadas; 0 fallidas; 0 omitidas |
| Validaciones y limites EPS, incluidas en la suite general | 5 aprobadas |
| prisma validate | Esquema valido |
| Generacion de cliente Prisma 7.10.1 | Correcta, local |
| Astro build | Correcto; /pages/eps.html generado |
| Astro check | 0 errores, 0 advertencias; 1 hint previo en dashboard.js |
| Comparacion general de navegador contra HEAD en copia temporal | 54/54 tanto en HEAD como en la version actual |
| Arranque del backend con Neon, consulta de solo lectura | Conexion pg y Prisma correctas; GET health 200 |
| Pagina EPS desde el backend real en puerto local temporal | HTTP 200 |
| API EPS real sin JWT | HTTP 401 |
| git diff --check | Sin errores de whitespace |

La suite completa se ejecuto despues de terminar el build. Las ampliaciones
finales de historial paginado y rollback de inventario se volvieron a verificar
con la suite EPS, el esquema y el build finales. Hubo fallos transitorios de
navegacion en una ejecucion anterior; no se reprodujeron en la comparacion
HEAD/actual ni en la ejecucion completa final.

La prueba EPS reprodujo tambien la ausencia de afiliados en la base de partida.
Aplico el SQL exclusivamente a PostgreSQL en memoria, creo entidades/cuentas de
prueba, comprobo aislamiento EPS-A/EPS-B, rechazo de roles y cuentas inactivas,
ediciones obsoletas, motivos obligatorios, decisiones terminales, historial,
stock por vinculo, importacion READ ONLY y rollback de un snapshot invalido,
lectura independiente por colaborador, perfil, formularios reales en Edge,
320/390 px y revocacion de tokens al cerrar sesion. No prueba carga concurrente
entre varias instancias de Neon. Se observo un aviso de deprecacion del driver
pg al ejecutar consultas relacionadas; no produjo fallos ni se actualizaron
versiones de dependencias.

## Consulta real de solo lectura

La comprobacion uso BEGIN READ ONLY y ROLLBACK, sin imprimir credenciales ni datos
de pacientes. En la base principal existen usuarios, medicamentos y solicitudes;
no existen afiliados ni eps_entidades, eps_accesos, eps_farmacias,
eps_existencias, eps_autorizaciones, eps_seguimientos, eps_eventos y eps_lecturas.
El servidor utilizado para verificar el arranque se limito a 127.0.0.1, uso un
puerto temporal y se cerro al terminar. No se dejaron servidores adicionales.

No se afirma que los flujos operativos ya funcionen con registros reales en Neon:
requieren el esquema y las vinculaciones que aun no estan desplegados.

## Archivos y contratos

La lista de archivos, endpoints, modelos, estados y comandos esta en
[Arquitectura y activacion EPS](../../architecture/eps.md).

La migracion revisable es:
backend/prisma/migrations/20261114090000_eps_workspace/migration.sql

SHA256 del archivo preparado:
2F98AA07AEC71B403CD38E1D721A570F3996B6BE54BBFB400B7BC88F73C4E835

No elimina tablas ni registros. Crea afiliados si falta, agrega una version e
indices y crea las ocho tablas EPS. Sus triggers registran cambios de solicitudes
y existencias; no cambian pagos, preparacion, entrega o stock global. Incluye
BEGIN/COMMIT para evitar un despliegue parcial. No se ejecuto contra Neon.

## Pendientes que requieren autorizacion o datos del responsable

1. Aprobar y aplicar esa migracion concreta a la base principal, revisando antes
   su historial de migraciones y evitando desplegar migraciones ajenas en bloque.
2. Confirmar datos reales de cada entidad y las cuentas de rol 4 que pertenecen a
   ella; crear las vinculaciones correspondientes sin inferencias automaticas.
3. Revisar la fuente EPS original y autorizar, si corresponde, una importacion
   verificada a afiliados de la base principal y su asociacion con cuentas de
   pacientes. No se copio ni altero EPS_DATABASE_URL.
4. Confirmar convenios de farmacia y suministrar existencias reales por farmacia.
   La herramienta eps-sync-inventory.cjs genera un plan sin escrituras por
   defecto y exige --apply --confirm=ID para una carga aprobada. No se ejecuto
   con datos reales ni se dedujo stock de farmacia a partir del stock global.
5. Tras esas aprobaciones, recorrer un acceso EPS real y comprobar lecturas de
   la entidad en Neon. Las escrituras de prueba reales requieren permiso aparte.

Se conservaron los .env, credenciales, versiones y pantallas de otros roles.
Los cambios de pruebas existentes son exclusivamente fixtures/expectativas EPS.
backend/package-lock.json ya tenia cambios antes de iniciar la implementacion y
no se revirtio ni se modifico como parte de ella. No se hicieron commits ni pushes.
