# SaludClick — versión profesional de demostración

SaludClick es una plataforma web de demostración para gestión de medicamentos, pedidos, fórmulas médicas y operación administrativa.

## Funcionalidades

### Usuario
- Registro e inicio de sesión con JWT.
- Recuperación de contraseña por correo.
- Catálogo de medicamentos conectado a MySQL.
- Búsqueda y filtros por categoría.
- Carrito y checkout.
- Pasarela de pago **simulada**: no realiza cobros reales ni guarda número completo/CVV.
- Tarjetas de prueba:
  - Aprobada: `4242 4242 4242 4242`
  - Aprobada: `5555 5555 5555 4444`
  - Cualquier otra tarjeta de 16 dígitos: rechazo simulado.
- Historial de pedidos.
- Perfil conectado al backend.
- Carga de fórmulas médicas en PDF/JPG/PNG/WEBP, hasta 5 MB.
- Consulta privada de las fórmulas cargadas.
- Dashboard con indicadores reales del usuario.

### Administración
- Acceso por rol.
- Estadísticas globales de usuarios, pedidos, ventas simuladas, inventario y fórmulas.
- Distribución de pedidos por estado.
- Revisión y cambio de estado de fórmulas médicas.
- Usuario demo:
  - Correo: `admin@saludclick.local`
  - Contraseña: `SaludClick123!`

> Cambia la contraseña del administrador antes de cualquier despliegue real.

## Instalación

1. Tener Node.js y MySQL instalados.
2. Crear la base de datos ejecutando:
   - instalación nueva: `database/saludclick_demo_completo.sql`
   - instalación existente: `database/migration_profesional.sql`
3. Copiar `.env.example` como `.env`.
4. Completar las credenciales de MySQL.
5. Si quieres recuperación por correo, configurar SMTP con una contraseña de aplicación de Gmail.
6. Instalar dependencias:
```bash
npm install
```
7. Ejecutar:
```bash
npm run dev
```
8. Abrir `http://localhost:3000`.

## Seguridad de demostración

- El archivo `.env` no se incluye en el proyecto entregable.
- `private_uploads/` no se publica como carpeta estática.
- Las fórmulas se sirven mediante rutas autenticadas.
- El backend valida rol para administración.
- El pago de prueba no almacena número completo de tarjeta ni CVV.
- Las contraseñas se almacenan con bcrypt.
- El token de recuperación se guarda en forma hash.

## Importante para producción

Esta versión está preparada como **demo funcional**. Antes de publicar en Internet se deben añadir, como mínimo: HTTPS, usuario MySQL dedicado, rotación de secretos, almacenamiento de archivos privado tipo S3/Cloud Storage, antivirus/escaneo de archivos, límites/rate limiting, auditoría administrativa, políticas de privacidad y términos reales, backups, monitoreo, proveedor de pagos real y revisión de cumplimiento sanitario/legal aplicable.

Los medicamentos y precios incluidos son datos de demostración y no constituyen recomendación médica.
