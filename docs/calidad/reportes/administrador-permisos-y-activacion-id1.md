# Permisos administrativos y activación exclusiva de ID 1

Fecha: 2026-11-12. Autorización: corregir el acceso adicional de Afiliados y activar exclusivamente ID 1 después de aprobar las pruebas críticas. No se ejecutaron migraciones, commit ni push durante esta intervención.

## Archivos de esta intervención

| Archivo | Cambio |
| --- | --- |
| backend/src/middlewares/administrative-scope.middleware.js | Bloqueo del administrador en /admin/afiliados antes de llegar a sus controladores. Comparación de rutas clínicas y farmacéuticas sin distinguir mayúsculas para impedir evasiones. |
| backend/src/routes/afiliados.routes.js | La entrada administrativa antigua rechaza por defecto todo acceso autenticado y cualquier método. No carga el servicio de afiliados ni crea cuentas vinculadas. La fábrica y servicios internos se conservan, sin otorgar nuevos permisos a EPS. |
| frontend/public/js/roles.js | La pantalla administrativa antigua no tiene roles autorizados. |
| frontend/public/js/admin-afiliados.js | Sustituye el flujo de gestión por el guard compartido que redirige al inicio permitido de cada rol. No solicita datos de afiliados. |
| frontend/src/pages/pages/admin-afiliados.astro | Pantalla restringida sin tabla, formularios de gestión ni creación de cuentas. |
| backend/tests/administrative-access-boundary.test.cjs | Pruebas HTTP de la ruta retirada, métodos, variantes de mayúsculas, límites clínicos/farmacéuticos, JWT y conservación de otras rutas. |
| backend/tests/frontend-roles.test.cjs | Matriz actualizada de acceso a Pacientes y rechazo de Afiliados. |
| backend/tests/support/afiliados-browser.cjs | Comprueba rechazo de enlaces directos para los cuatro roles y sesiones ausentes, sin llamadas a la API retirada. |
| backend/scripts/activate-admin-access.cjs | Activación condicionada y transaccional de ID 1, comparación de todos sus campos, comprobación de otras cuentas, auditoría y verificación HTTP antes de confirmar. El modo --check es de solo lectura; --apply rechaza cuentas ya activas. |
| backend/tests/activate-admin-access.test.cjs | Condiciones de identidad, estado, hash existente, número exacto de registros, conservación de campos y rollback ante fallos críticos. |
| docs/calidad/reportes/administrador-permisos-y-activacion-id1.md | Este informe. |

El árbol de trabajo ya contenía cambios de las solicitudes anteriores. Esta lista distingue los archivos intervenidos para esta autorización; no se revirtieron otros cambios.

## Pruebas previas a activar

- 391 pruebas aisladas aprobadas, incluidas las cuatro nuevas de límites de acceso. No se emplearon cuentas reales para las operaciones de escritura de estas pruebas.
- Tres pruebas adicionales del activador aprobadas: actualización de un único campo y registro exacto, conservación de otros datos y rollback si falla el acceso o cambia cualquier otro dato.
- 53 pruebas de navegador aprobadas: siete módulos, bloqueo de Afiliados, navegación, chats de clientes/farmacias, panel EPS y separación de roles. Las altas, cambios de contraseña y respuestas de estas pruebas usan fixtures locales simuladas, no cuentas reales.
- Frontend compilado. Astro check sin errores ni advertencias; conserva una sugerencia previa por la variable map sin usar en dashboard.js, fuera del alcance de esta intervención.
- Comprobación PostgreSQL de solo lectura antes de activar: ID 1, rol 1/admin, estado NULL, única candidata y hash bcrypt existente válido. Nunca se imprimió el hash, la contraseña o un JWT.

## Operación real

Dentro de una transacción SERIALIZABLE, se seleccionó y bloqueó ID 1, se volvió a comprobar la identidad y se ejecutó una actualización parametrizada equivalente a:

```sql
UPDATE usuarios
SET estado = $1::"EstadoUsuario"
WHERE id = $2 AND rol_id = $3 AND estado IS NULL
RETURNING to_jsonb(usuarios);
```

Parámetros no sensibles: ACTIVO, 1, 1. Se actualizó exactamente un registro. La comparación completa del registro antes/después confirmó que únicamente cambió estado, incluido que updated_at y password permanecieron iguales. La huella de las otras cuentas también permaneció igual. Se insertó un registro interno de auditoría ACCESO_ADMIN_ACTIVADO con el campo estado; no se incluyeron datos personales ni secretos.

Se usó un servidor HTTP local temporal con el código real del backend y PostgreSQL configurado. Las consultas administrativas de verificación se dirigieron a la transacción aún abierta, manteniendo los guards reales de JWT, rol y estado. Cualquier fallo habría revertido tanto el cambio como el registro de auditoría. Tras COMMIT se repitió la verificación mediante la conexión Prisma normal.

## Resultado

- Cuenta: ID 1, Administrador/rol 1.
- Estado anterior: NULL. Estado final: ACTIVO.
- Registros de usuarios actualizados: 1.
- Contraseña, correo, nombre, documento, rol y demás campos: conservados.
- Otras cuentas y los 50 afiliados EPS: no modificados. El flujo de verificación no consulta ni escribe en la fuente EPS.
- Siete endpoints representativos de los siete módulos: HTTP 200 antes y después de COMMIT.
- Doce rutas ajenas: HTTP 403, incluyendo Afiliados, medicamentos, fórmulas, citas, inventario, pedidos, panel EPS y chat farmacéutico. POST/PUT/PATCH/DELETE de creación vinculada: bloqueados.
- JWT ausente, alterado y expirado: HTTP 401 en el dashboard administrativo.
- Menú: exactamente Dashboard, Usuarios, Pacientes, Solicitudes, Notificaciones, Informes y Configuración.
- Sin errores críticos pendientes. El inicio interactivo con la contraseña conservada no se ensayó: no se solicitó ni se conoció su texto. La prueba de acceso autenticado usó un JWT temporal interno que no se mostró ni se guardó.

La comprobación no fue un despliegue remoto ni dejó el servidor temporal ejecutándose. La aplicación debe ejecutarse con este código y el frontend compilado para utilizar las restricciones verificadas.
