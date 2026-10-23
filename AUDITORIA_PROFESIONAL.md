# Auditoría de SaludClick

## Lo que ya estaba bien

- Arquitectura Node.js + Express + MySQL clara.
- JWT para sesiones.
- Bcrypt para contraseñas.
- Recuperación de contraseña con token hash y expiración.
- Catálogo conectado a MySQL.
- Carrito persistente en navegador.
- Checkout con transacción de stock.
- Pago simulado que no guarda tarjeta completa ni CVV.
- Historial de pedidos.
- Perfil conectado al backend.
- Buen trabajo inicial de validación de destinos privados.
- Diseño visual con una identidad consistente en verde.

## Problemas detectados y corregidos

1. La portada tenía botones sin comportamiento real.
2. Los footer no eran uniformes entre ventanas.
3. No existía un módulo de fórmulas médicas persistente.
4. No existía un panel administrativo real protegido por rol.
5. Las estadísticas del dashboard dependían parcialmente de localStorage en vez de datos reales.
6. El proyecto entregaba un `.env` con credenciales reales de desarrollo.
7. Faltaba operación administrativa sobre estados de pedidos.
8. Faltaba un flujo claro para revisar fórmulas.
9. La visualización de archivos privados necesitaba autenticación explícita.
10. Faltaba documentación de instalación de la versión profesional.

## Cambios implementados

- `database/migration_profesional.sql`
- tabla `formulas_medicas`
- almacenamiento privado de fórmulas
- carga de PDF/JPG/PNG/WEBP hasta 5 MB
- consulta autenticada de fórmulas
- estados PENDIENTE / VALIDADA / RECHAZADA
- dashboard del usuario con estadísticas reales
- dashboard administrativo
- estadísticas globales
- lista administrativa de pedidos
- cambio de estado de pedidos
- revisión de fórmulas
- acceso administrativo por rol
- footer uniforme
- navegación adicional de fórmulas y administración
- acciones funcionales en los botones de la portada
- `.env.example` sin secretos
- exclusión de `node_modules` y archivos privados del paquete
- documentación actualizada

## Prueba recomendada

### Usuario
1. Registrar usuario.
2. Iniciar sesión.
3. Abrir Medicamentos.
4. Buscar y agregar un medicamento.
5. Ir a Pedidos.
6. Completar entrega.
7. Usar tarjeta `4242 4242 4242 4242`, vencimiento `12/30`, CVV `123`.
8. Confirmar que aparece el pedido.
9. Revisar Historial.
10. Cargar una fórmula.
11. Salir y volver a entrar.
12. Abrir Fórmulas y comprobar que el documento sigue disponible.

### Administrador
1. Entrar con `admin@saludclick.local`.
2. Contraseña: `SaludClick123!`.
3. Abrir Administración.
4. Ver estadísticas.
5. Ver pedidos.
6. Cambiar estado de un pedido.
7. Revisar fórmulas.
8. Validar o rechazar una fórmula.

## Pendientes antes de producción

- HTTPS.
- Usuario MySQL dedicado con permisos mínimos.
- Rotación de secretos.
- Almacenamiento privado externo y backup.
- Antivirus/antimalware para archivos.
- Rate limiting y protección anti-abuso.
- Auditoría de acciones administrativas.
- Política de privacidad y términos reales.
- Proveedor de pagos real y cumplimiento PCI cuando corresponda.
- Revisión de requisitos sanitarios y legales aplicables.
- Monitoreo y logs centralizados.
