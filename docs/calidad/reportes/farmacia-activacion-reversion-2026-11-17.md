# FARMACIA: plan de activación y reversión

Preparado, **no ejecutado**. Requiere autorización explícita para cada cambio en
Neon. Las comprobaciones de lectura sí se ejecutaron; evidencia en
`farmacia-preflight-real-2026-11-17.json`.

## Estado real comprobado

Farmacia 4 está activa. EPS VidaPlena tiene identificador `1` en el destino y los
50 afiliados activos de la fuente original pertenecen a `eps_id=1`. Documentos e
identificadores son únicos. Farmacia 4 no tiene vínculo activo; falta el índice
de EPS única. Faltan las tablas de operación, notificaciones y stock propio. Las
tres banderas están deshabilitadas. No se cambiaron esos datos.

La comprobación puede repetirse desde la raíz:

```powershell
node backend/scripts/farmacia-preflight-readonly.cjs --farmacia-id=4
```

El script abre `BEGIN ... READ ONLY`, verifica el modo, limita el tiempo de las
consultas y termina con ROLLBACK. Solo imprime conteos, EPS y estado del esquema;
no imprime URL, credenciales, nombres ni documentos de pacientes. No contiene
DDL, migraciones, concesiones o vinculaciones.

## Preparación antes de aprobar

1. Congelar escrituras de Farmacia durante la ventana. Guardar versión de la
   aplicación, configuración, inventario del esquema y respaldo/snapshot del
   destino. Ensayar restauración en un destino aislado y registrar su identidad.
2. Recuperar y revisar la historia real de EPS y su correspondencia con
   `_prisma_migrations`. No reconstruir ni marcar migraciones aplicadas para
   ocultar diferencias. Revisar tipos y FK de `usuarios`, `medicamentos`,
   `solicitudes`, `detalle_solicitud`, `pagos`, `eps_entidades` y `eps_farmacias`.
3. Revisar SQL y sus hashes. Orden lógico sujeto a esa reconciliación:
   `20261114120000_farmacia_notificaciones`,
   `20261115120000_farmacia_eps_unica`,
   `20261116180000_farmacia_operacion_autorizada`,
   `20261117180000_farmacia_inventario_propio`.
   No ejecutar un `migrate deploy` indiscriminado sobre la cadena incompleta.
4. Comprobar que no hay múltiples vínculos activos y que la cuenta de consulta
   EPS tiene USAGE/SELECT de la fuente original; conservar las 50 filas sin
   importarlas, copiarlas ni actualizar sus documentos.
5. La nueva migración solo crea `farmacia_existencias` y
   `farmacia_stock_eventos`, con FK, CHECK e índices. No reparte el saldo global
   ni siembra pacientes, permisos, vínculos o cantidades.

## Cambios que deben autorizarse por separado

1. Aplicación del esquema reconciliado y revisión de restricciones/índices,
   utilizando el procedimiento aprobado y su registro de migraciones.
2. Vínculo Farmacia 4 → EPS VidaPlena 1 por el endpoint existente
   `PUT /api/admin/farmacias/4/eps`, con la versión consultada previamente. No
   basta con que coincidan nombres de EPS.
3. Verificación de identidades afiliado–cuenta con documento original, por
   `PUT /api/admin/farmacias/4/identidades/:usuarioId`. No crear cuentas para
   hacer coincidir una lista ni copiar pacientes. Revisar los pares concretos.
4. Asignaciones de solicitudes y, si procede, política de enrutamiento EPS.
   Compartir EPS no asigna pedidos automáticamente sin política aprobada.
5. Permisos de catálogo mediante
   `PUT /api/admin/farmacias/4/catalogo-autorizaciones`. El cuerpo expresa el
   conjunto completo autorizado; omitir un medicamento revoca su edición y
   conserva su historial. Sin autorización no se habilita edición global.
6. Existencias iniciales verificadas físicamente y su referencia documental. El
   ingreso administrativo usa
   `POST /api/admin/farmacias/4/existencias/ingresos`, con una clave UUID v4,
   referencia y cantidades verificadas. FARMACIA no tiene endpoint de edición ni
   de ingreso. Cada ingreso exige rol 1 vigente, queda auditado y es idempotente.
7. Activación coordinada de `FARMACIA_OPERACION_ENABLED`,
   `FARMACIA_NOTIFICACIONES_ENABLED` y `FARMACIA_INVENTARIO_PROPIO_ENABLED`.
   Ninguna bandera sustituye asignaciones ni permisos. Antes de activar stock
   propio no debe haber pedidos PREPARANDO/LISTA sin reservas acreditadas: el
   preflight los cuenta; reconciliarlos con un plan aprobado, nunca inventarlas.

## Semántica operativa que debe comprobarse

- `cantidad` es saldo físico de la farmacia; `reservado` pertenece a solicitudes
  en preparación. Unidades libres = cantidad − reservado.
- APROBADA → PREPARANDO reserva todos los medicamentos, agrupando líneas del
  mismo medicamento. Si falta un saldo o unidades, toda la transacción revierte.
- PREPARANDO → LISTA conserva la reserva. LISTA → ENTREGADA exige recepción y una
  reserva coincidente; descuenta físico y libera reserva una sola vez.
- Estado, versión, movimiento, evento y notificación se confirman juntos. Una
  falla revierte todo. Se conserva `medicamentos.stock`: representa el saldo
  global usado por el flujo previo de compra, no se descuenta otra vez al entregar.
- El catálogo global y el stock físico propio requieren reconciliación operativa
  al activar: no se supone que el saldo global pertenece a Farmacia 4.
- No hay cancelación desde el panel de Farmacia. Una futura cancelación o
  devolución requiere un flujo auditado de liberación/reposición; no efectuar
  cambios SQL manuales sobre estados, reservas o eventos.
- Fórmulas requeridas o requisito desconocido siguen bloqueando dispensación
  mientras falte el flujo autorizado de validación farmacéutica. Vincular un
  archivo, consentir su descarga o simular un pago no aprueba una prescripción.

## Aceptación real después de autorizar

Consultar los mismos pacientes desde EPS, Administración y Farmacia; comparar
identificadores, documento y estado sin duplicación. Probar dos farmacias, un
paciente ajeno, otro rol y un vínculo revocado. Comprobar detalle con varios
medicamentos y fórmula autenticada; no exponer rutas privadas ni permitir una
descarga no consentida. Ejecutar un pedido permitido con pago real, recepción,
reintento y solicitudes simultáneas mediante conexiones PostgreSQL independientes.

Conciliar stock físico, reservas y eventos antes y después; comprobar que una
segunda entrega no descuenta. Contrastar las métricas con SQL de solo lectura:
pacientes distintos entregados, unidades de eventos, referencias propias con
saldo libre y solicitudes pendientes del periodo. Verificar notificaciones,
contador, lectura persistente, revocación y reconexión Socket.IO. Reabrir el XLSX
y comprobar ambas hojas, cifras, filtros y ámbito. Verificar imágenes HTTPS desde
el origen real en Farmacia y catálogo de pacientes, y seguridad del Perfil.

## Reversión sin pérdida de historial

1. Ante un fallo, deshabilitar **juntas** las tres banderas y reiniciar los
   procesos. Retirar tráfico/escrituras de operación de Farmacia. No deshabilitar
   solo stock dejando el motor anterior activo sobre solicitudes con reservas.
2. Conservar los registros y el snapshot; registrar qué solicitud/clave se
   confirmó antes del fallo. No repetir ingresos con una clave nueva ni editar
   estados o cantidades para forzar una reconciliación.
3. Revertir el binario/frontend a la versión registrada y mantener cerradas las
   operaciones dependientes del nuevo esquema. Repetir el preflight en lectura.
4. Si ya hay filas, conservar tablas y auditoría. Corregir hacia delante o
   restaurar el snapshot en un destino aislado para comparar movimientos. Una
   restauración del destino activo necesita aprobación y conciliación de todas
   las escrituras posteriores, incluidos los otros roles. No restaurar una copia
   antigua sobre actividad reciente sin ese análisis.
5. Si nunca hubo escrituras, una retirada de tablas/índices solo se evalúa tras
   confirmar vacíos, dependencias y registro de migraciones. No se entrega ni se
   ejecuta un DROP automático que pueda borrar información de otras sesiones.

No se considera completada la activación ni el 100 % operativo hasta obtener esa
aceptación real. No se realizaron cambios de Neon en esta sesión.
