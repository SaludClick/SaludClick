# Contratos de autenticación y seguridad

Este documento caracteriza el comportamiento existente; no cambia la política.

En la Etapa 4, la lógica de entrada para registro y restablecimiento se ubica en `backend/src/validators/auth.validator.js`. Las operaciones de perfil pasan por `backend/src/services/user.service.js` y `backend/src/validators/user.validator.js`; la persistencia sigue en `backend/src/repositories/auth.repository.js`. Las rutas protegidas siguen aplicando el mismo middleware JWT y no se modifican roles ni permisos.

## JWT y `Authorization`

- Las rutas protegidas usan `backend/src/middlewares/auth.middleware.js` directamente o dentro de `requireAdmin`.
- El formato consumido por el middleware es `Authorization: Bearer <JWT>`. El token se verifica con `process.env.JWT_SECRET`; el payload validado se asigna a `req.usuario`.
- La ausencia de header produce `401 {ok:false,mensaje:"Token no proporcionado"}`. Cualquier fallo de verificación produce `401 {ok:false,mensaje:"Token inválido"}`.
- `backend/src/utils/jwt.js` firma `id`, `correo` y `rol`, con vencimiento de ocho horas. No cambiar algoritmo, campos, secreto ni expiración en esta etapa.
- Una autorización inválida no debe llegar al controlador. Las páginas frontend también usan guardas, pero son protección de interfaz; el backend sigue siendo la autoridad.

## Roles

- `requireAdmin` ejecuta autenticación y convierte `req.usuario.rol_id ?? req.usuario.rol` a número.
- Los únicos roles permitidos actualmente son `1` y `3`; los demás reciben `403 {ok:false,mensaje:"Acceso restringido al personal administrativo."}`.
- Los endpoints privados de usuario requieren JWT, sin una comprobación adicional de rol en rutas. Las consultas de recursos personales deben conservar el vínculo al id de `req.usuario`.

## Registro, login y proveedores

- Registro público: correo se recorta y normaliza a minúsculas; requiere nombre, apellido, documento y contraseña; la contraseña debe tener al menos ocho caracteres y se persiste como hash bcrypt. Los errores del servicio se responden con `400`.
- Login público: correo normalizado; compara con bcrypt y rechaza cuenta inactiva. Credenciales incorrectas responden `400`, no `401`. La respuesta exitosa incluye JWT y perfil básico.
- Google: body `{credential}`; la verificación usa `GOOGLE_CLIENT_ID`. Campo ausente `400`; errores de Google/servicio se convierten en `401` genérico.
- Recuperación: respuesta pública genérica `200` tanto si la cuenta existe como ante errores, para evitar revelar su existencia. El servicio actual genera un token de un solo uso, persiste su hash y envía correo; la documentación del flujo indica 15 minutos.
- Restablecimiento: body `{token,password}`; mínimo actual de seis caracteres; errores `400`.

## Archivos médicos privados

- `backend/private_uploads` no se sirve mediante `express.static`; el endpoint de lectura verifica JWT, consulta fórmula por `id` y usuario propietario, y luego transmite el archivo.
- Carga: JWT obligatorio, formatos admitidos PDF/JPEG/PNG/WEBP, máximo 5 MiB, validación de firma básica y nombre de archivo almacenado generado por UUID. Propietario procede de `req.usuario.id`.
- La administración de fórmulas requiere rol 1 o 3. No se debe mover el directorio, cambiar permisos ni relajar la consulta de propiedad en la etapa de arquitectura.

## Matriz de pruebas de caracterización

| Caso | Resultado actual que se debe fijar |
|---|---|
| Sin `Authorization` en ruta JWT | `401`, `Token no proporcionado` |
| Token malformado/firma inválida | `401`, `Token inválido` |
| JWT expirado | `401`, `Token inválido` |
| JWT válido de usuario normal | acceso a rutas JWT; `403` en rutas admin |
| JWT válido con rol 1 o 3 | acceso a rutas admin |
| Registro duplicado/campos incompletos/contraseña corta | `400` y mensaje de servicio actual |
| Login incorrecto/cuenta inactiva | `400` y mensaje actual |
| Recuperación para correo conocido/desconocido o error de correo | respuesta genérica `200` |
| Google sin credencial / verificación rechazada | `400` / `401` respectivamente |
| Fórmula propia / ajena / inexistente | `200` binario / `404`; acceso nunca debe cruzar propietario |

Las pruebas de API deben montar la app con dobles de servicios/repositorios o usar almacenamiento temporal aislado. No deben leer `.env`, conectarse a producción, usar datos de personas reales ni escribir archivos médicos en `backend/private_uploads`.
