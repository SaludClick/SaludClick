# Revocación de sesiones

El JWT lleva la versión actual de la cuenta. El servidor verifica la firma y consulta la cuenta en PostgreSQL para comprobar estado, rol y versión antes de atender solicitudes autenticadas. El rol institucional también requiere una membresía IPS o EPS vigente. Cada operación conserva sus controles de ámbito y pertenencia.

La migración `20261123235000_revocacion_sesiones` aumenta la versión cuando cambian el estado, el rol, el correo, la contraseña, la membresía institucional o el registro de revocación de farmacia. También lo hace al activar o desactivar una institución. La reversión de uno de estos cambios no recupera la validez de los JWT anteriores.

Los canales de Socket.IO verifican al conectarse y al recibir eventos autenticados. El servidor vuelve a verificar a los destinatarios antes de emitir eventos de aplicación y comprueba las conexiones inactivas cada cinco segundos. La sesión de visitante de VITALIX conserva su mecanismo de revocación propio.

La migración requiere las tablas de IPS, EPS y sesiones de farmacia. Revisa el esquema y aplica las migraciones en orden antes de desplegar. Los JWT antiguos carecen de versión y sus titulares deberán iniciar sesión nuevamente. La prueba aislada usa datos ficticios, solicitudes HTTP y una conexión Socket.IO real.
