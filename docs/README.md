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
  - Correo: `ADMIN_EMAIL=admin@example.com`
  - Contraseña: `ADMIN_PASSWORD=<CONFIGURAR_LOCALMENTE>`

> Cambia la contraseña del administrador antes de cualquier despliegue real.

## Instalación

1. Instala Node.js y MySQL.
2. Para una base vacía, crea manualmente la base `saludclick` y ejecuta `backend/database/install_schema_public.sql`. Este script crea el esquema de la API sin usuarios.
3. Opcionalmente, en instalaciones locales de demostración, ejecuta `backend/database/seed_demo_public.sql` para agregar roles y un catálogo ficticio. No contiene cuentas ni datos de pacientes.
4. Para una base existente, realiza y verifica un respaldo, inspecciona el esquema y confirma que `usuarios.cedula` existe y `usuarios.numero_documento` no existe. Solo si se cumple esa precondición, revisa y ejecuta una vez `backend/database/upgrade_schema_public.sql`. Detente si el esquema difiere, la columna ya fue renombrada o falta alguna tabla base; adapta la actualización mediante un procedimiento revisado para esa instancia. No ejecutes el script a ciegas ni sobre producción sin autorización y respaldo validado.
5. Ningún script SQL se ejecuta automáticamente al iniciar el servidor. Ejecuta SQL únicamente de forma manual en una instancia aislada y revisada; esta auditoría no ejecutó scripts contra MySQL.
6. Crea `backend/.env` localmente con `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `JWT_SECRET`. Configura Google y SMTP solo si usarás esas funciones. No compartas ni versionas el archivo.
7. Instala e inicia el backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
8. Para crear la primera cuenta administrativa, confirma primero que los roles 1 y 3 existen. Desde `backend/`, ejecuta `node scripts/provision-admin.js` en una terminal interactiva local. El script solicita la contraseña dos veces sin mostrarla, exige al menos 16 caracteres, la procesa con el bcrypt ya instalado (coste 10) y no ofrece contraseña predeterminada. La cuenta se inserta como activa; elige únicamente un rol administrativo autorizado para tu entorno y protege el acceso local a la terminal y a MySQL.
9. Abre `http://localhost:3000`. El backend sirve `frontend/` conservando las URLs públicas. Para usar el servidor estático separado, inicia primero el backend y ejecuta desde `frontend/`:
   ```bash
   node ../backend/scripts/frontend-server.js
   ```

Los scripts SQL originales de desarrollo/demostración no forman parte de la distribución pública. Las versiones públicas tienen nombres distintos y contienen solo DDL saneado o datos ficticios.
## Seguridad de demostración

- El archivo `.env` no se incluye en el proyecto entregable.
- `backend/private_uploads/` no se publica como carpeta estática.
- Las fórmulas se sirven mediante rutas autenticadas.
- El backend valida rol para administración.
- El pago de prueba no almacena número completo de tarjeta ni CVV.
- Las contraseñas se almacenan con bcrypt.
- El token de recuperación se guarda en forma hash.

## Importante para producción

Esta versión está preparada como **demo funcional**. Antes de publicar en Internet se deben añadir, como mínimo: HTTPS, usuario MySQL dedicado, rotación de secretos, almacenamiento de archivos privado tipo S3/Cloud Storage, antivirus/escaneo de archivos, límites/rate limiting, auditoría administrativa, políticas de privacidad y términos reales, backups, monitoreo, proveedor de pagos real y revisión de cumplimiento sanitario/legal aplicable.

Los medicamentos y precios incluidos son datos de demostración y no constituyen recomendación médica.
