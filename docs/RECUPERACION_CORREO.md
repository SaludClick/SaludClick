# Recuperación de contraseña por correo - SaludClick

Se agregó un flujo real de recuperación de contraseña mediante un enlace enviado por correo.

## 1. Instalar dependencia

Desde `backend/` ejecuta:

```bash
npm install
```

## 2. Crear la tabla en MySQL

Ejecuta la sección `TOKENS DE RECUPERACIÓN DE CONTRASEÑA` del archivo:

`backend/database/saludclick.sql`

Si ya ejecutaste todo el SQL anteriormente, ejecuta solo el `CREATE TABLE tokens_recuperacion` y los índices de esa sección.

## 3. Configurar el correo

En `.env` configura un SMTP real. Para Gmail:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_clave_de_aplicacion
MAIL_FROM=SaludClick <tu_correo@gmail.com>
FRONTEND_URL=http://localhost:3000
```

Para Gmail se recomienda usar una **contraseña de aplicación**, no la contraseña normal de la cuenta.

También puedes usar otro proveedor SMTP cambiando `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, usuario y contraseña.

## 4. Ejecutar

```bash
npm run dev
```

Luego entra al frontend servido por el backend en `http://localhost:3000/login.html` y selecciona **¿Olvidaste tu contraseña?**. Si ejecutas el frontend independiente, configura `FRONTEND_URL` con su origen antes de solicitar el correo.

## Flujo implementado

1. El usuario escribe su correo.
2. El backend busca la cuenta.
3. Genera un token aleatorio de un solo uso.
4. Guarda únicamente el hash del token en MySQL.
5. Envía un enlace por correo.
6. El enlace expira en 15 minutos.
7. El usuario crea una nueva contraseña.
8. La contraseña se almacena con bcrypt.
9. El token se elimina después de utilizarse.

La respuesta de recuperación es genérica para no revelar si un correo está registrado.
