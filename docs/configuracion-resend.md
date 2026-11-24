# Correo de cuentas con Resend

Agrega estas variables al archivo local `backend/.env` o a la configuración del servidor.

```dotenv
RESEND_API_KEY=
RESEND_FROM="SaludClick <cuentas@example.com>"
```

Usa una clave de envío de Resend y un remitente en un dominio verificado. Configura `FRONTEND_URL` con el origen público que sirve la página de restablecimiento. El enlace vence en 15 minutos.

Si ambas variables se dejan sin valor, se conserva SMTP para recuperación e invitaciones. Durante la migración, configura las dos variables de Resend juntas. Un fallo de Resend no genera un segundo envío por SMTP.

La verificación de un envío real requiere un remitente verificado y una cuenta de prueba autorizada con acceso al buzón. Solicita una recuperación para esa cuenta y verifica la recepción y el uso único del enlace.
