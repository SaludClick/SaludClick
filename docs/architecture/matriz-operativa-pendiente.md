# Permisos operativos propuestos para revisión

| Actor | Permiso propuesto | Contrato actual y cambio requerido |
| --- | --- | --- |
| Profesional clínico IPS | Autorizar medicamentos, cantidades, vigencia y etapas. Registrar identidad, fecha y decisión. | El rol 4 y la membresía IPS identifican la institución. El flujo de etapas exige además una habilitación clínica individual, vigente y auditada. |
| Responsable IPS | Habilitar empleados y retirar sus accesos dentro de su propia IPS. | `ips_accesos` vincula usuarios al prestador. Aún no hay un perfil responsable ni una operación delegada para altas o bajas de membresía. |
| Administración | Habilitar instituciones y responsables. Gestionar cuentas y revisar o asignar trámites según su permiso operativo. | El rol 1 gestiona cuentas y algunas asignaciones operativas. La política existente bloquea su acceso a operaciones clínicas. La matriz conserva ese límite. |
| Responsable de Farmacia | Habilitar empleados operativos y asignar domiciliarios a las entregas de su farmacia. | El rol 3 y las asignaciones actuales usan la cuenta de farmacia como responsable. Se requieren membresías individuales, separación del responsable y verificaciones de ámbito por pedido. |
| Domiciliario | Consultar entregas propias y registrar visita y resultado. | El flujo de etapas consulta visitas asignadas y restringe sus datos. Una entrega exitosa exige constancias versionadas que confirma el paciente o receptor autorizado. |

La autorización debe registrar al profesional, el prestador y la habilitación vigentes al decidir. La asignación debe registrar farmacia, responsable y domiciliario distintos del actor que autoriza. Las entregas parciales requieren cantidades registradas por etapa, saldo y reintentos idempotentes. Solo una entrega confirmada afecta el saldo.

El responsable IPS concede y revoca la habilitación clínica tras revisar las credenciales, con registro de auditoría. Puede autorizar como profesional únicamente si también tiene habilitación clínica explícita. Cada domiciliario puede tener una sola farmacia activa.

El alcance de esta matriz fue aprobado para implementación y pruebas en una base aislada. El alta y la verificación de correo se pueden probar sin conceder permisos operativos.

El contrato de API y los pasos de prueba están en [Dispensación por etapas](dispensacion-etapas.md).

La constancia de entrega y la autorización de tratamiento son documentos separados. Los textos, el método de identificación y firma, la conservación, los plazos y los canales de copia requieren revisión. [Borradores para entrega domiciliaria](borradores-entrega-domiciliaria.md)
