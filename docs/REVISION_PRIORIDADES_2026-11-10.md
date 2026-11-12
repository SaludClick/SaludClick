# Revisión y prioridades de SaludClick

Fecha: 10 de noviembre de 2026. Revisión local; no se conectó a Neon, no se ejecutó SQL ni se modificaron credenciales o datos. No se hizo commit ni push.

## Estructura revisada

- `frontend/`: Astro y React; 12 páginas HTML heredadas en `public/`, dos páginas Astro (chat y cuentas), componentes React y módulos JavaScript compartidos. Se conserva esta combinación para no reemplazar trabajo existente.
- `backend/`: Express y Socket.IO. Rutas → controladores → servicios → repositorios; PostgreSQL mediante `pg` y Prisma con adaptador PostgreSQL. Prisma no es el único acceso a datos.
- `backend/prisma/`: esquema e historial de migraciones PostgreSQL; catálogo INVIMA, chat, fórmulas, idempotencia y rol EPS.
- `backend/data/`: CSV INVIMA de 1.000 referencias. `private_uploads/` almacena fórmulas fuera de la carpeta pública.
- `backend/tests/`: pruebas Node, contratos HTTP, servicios, repositorios, navegador Edge e integración PostgreSQL separada.
- `docs/`: documentación técnica y evidencias históricas; los resultados históricos no sustituyen una ejecución actual.

## Correcciones realizadas

1. El esquema Prisma omitía los campos INVIMA y los modelos de imágenes y observaciones de precio que ya existían en la migración del catálogo. Se restauró ese contrato y se generó el cliente local, sin aplicar migraciones.
2. Los dos archivos SQL de instalación de una base vacía también omitían el catálogo. Se añadió el mismo DDL aditivo existente. Son archivos de instalación para bases vacías; no se ejecutaron ni se deben usar como actualización de Neon.
3. La configuración de las páginas HTML apuntaba siempre a `localhost:3000`. Ahora usa el origen de la página por defecto y conserva cualquier URL configurada explícitamente. Funciona con el proxy de Astro y con Express sirviendo el build.
4. Se añadió `npm.cmd run catalogo:validar`: verifica las 1.000 filas, campos, estados y duplicados sin cargar Prisma ni conectar a una base. Los errores de los scripts del catálogo ya no imprimen mensajes completos del proveedor de base de datos.
5. Se aislaron cuatro suites que cargaban la configuración real de PostgreSQL aun usando datos simulados. El doble de base rechaza accesos inesperados; no se necesita una credencial real para esas pruebas.
6. Se actualizaron contratos antiguos que permitían farmacia en rutas administrativas y registro público. Se conserva la política actual: administración exclusiva del rol 1 y creación de cuentas autorizada por un administrador.

## Estado de los módulos

| Módulo | Implementación y observaciones |
| --- | --- |
| Autenticación | Login JWT, bcrypt, Google, recuperación y reCAPTCHA implementados. Registro restringido al administrador; no se habilitó registro público. Google requiere cuenta existente. Falta validar proveedores reales en un entorno de demostración. |
| Medicamentos | API y frontend conectados; búsqueda, categorías, carrito e imágenes locales. CSV validado localmente. La API actual devuelve los campos básicos, no todos los metadatos INVIMA. |
| Fórmulas | Carga privada, validación de formato/tamaño, consulta por propietario y revisión administrativa. No existe asociación obligatoria de una fórmula con el pedido. |
| Pedidos | Validación, inventario, transacción, bloqueo y clave de idempotencia implementados. El pago es simulado. Falta validar persistencia con PostgreSQL aislado. |
| Historial | Consulta autenticada y detalle de pedidos; hay pruebas de navegación. Falta recorrido con registros reales de demostración. |
| Perfil | Consulta y actualización con validación; pruebas de servicio y navegador. |
| Administración | Cuentas de paciente/farmacia/EPS, pedidos, estados, fórmulas e indicadores. Solo administrador. Farmacia tiene verificación de acceso y chat, no un módulo completo de inventario. |
| Chat | React, Socket.IO, historial y autorización por conversación; se conserva su implementación. |

## Configuración y bloqueos

- No hay `backend/.env` en esta copia. `DATABASE_URL` es obligatoria para arrancar; `JWT_SECRET` es necesario para autenticación. El ejemplo del backend tampoco enumera estas dos variables. No se creó ni editó ningún archivo de credenciales.
- El login exige configuración coherente de reCAPTCHA: clave pública del frontend, secreto del backend y hostnames permitidos. No se desactivó esta protección.
- SMTP y Google necesitan configuración válida para verificar sus flujos externos.
- Prisma configura `provider = "postgresql"`, URL por entorno y `@prisma/adapter-pg`. El pool mantiene validación TLS. Sin una conexión disponible no se certifica el estado de migraciones ni el contenido de Neon.
- PowerShell bloquea `npm.ps1` en este equipo: usar `npm.cmd` evita cambiar la política de ejecución.
- Las dependencias se instalaron con `npm.cmd ci` desde los lockfiles; no se actualizaron versiones.

## Verificaciones

- `frontend`: `npm.cmd run build` completó correctamente.
- `frontend`: `npm.cmd run check` completó con 0 errores, 0 advertencias y una sugerencia por variable sin uso.
- Prisma: `validate` correcto con una URL ficticia local, sin conexión; cliente generado correctamente.
- `backend`: `npm.cmd run catalogo:validar` correcto: 1.000 referencias únicas y estados aceptados por el importador. Esto verifica el archivo local, no la vigencia actual ante INVIMA ni su carga en Neon.
- Pruebas focalizadas de contratos HTTP, catálogo, CORS y chat: 87 aprobadas.
- Integración PostgreSQL: se intentó y se canceló antes de conectar por ausencia de `TEST_DATABASE_URL`. El guard exige una base autenticada en `127.0.0.1:55434/saludclick_test`; no se sustituyó por Neon.
- Suite completa `npm.cmd test`: **307 pruebas aprobadas, 0 fallidas, 0 omitidas**, incluidas las pruebas de navegador Edge con API simulada. No equivale a una prueba contra Neon.

## Pendientes por prioridad

1. **P0 — Arranque de la demo:** configurar privadamente las variables requeridas en un entorno aislado. Confirmar la base destino, su esquema y roles; comprobar salud del backend. Usar Astro o el build servido por Express.
2. **P0 — Persistencia:** preparar PostgreSQL de pruebas con el esquema y migraciones requeridos y ejecutar `npm.cmd run test:integration:postgres`. Probar login → catálogo → pedido → historial → perfil → fórmula → revisión administrativa con cuentas de demostración.
3. **P1 — INVIMA en la base:** verificar en modo lectura las migraciones y ejecutar `npm.cmd run catalogo:verificar` únicamente con un destino autorizado. La importación escribe datos: no se ejecutó. Los registros importados quedan INACTIVOS, stock 0 y precio 0 por diseño; no sirven directamente para demostrar una compra. Preparar inventario y precios ficticios únicamente en la base de demo.
4. **P1 — Entrega SENA:** documentar cuentas de demo por rol sin publicar contraseñas, pasos de arranque y evidencias del recorrido completo. Aclarar que los pagos son simulados y el alta de cuentas es administrativa.
5. **P2 — Completar alcance funcional:** si la rúbrica lo exige, gestión de inventario por farmacia, detalle INVIMA visible, asociación fórmula-pedido y funcionalidades propias de EPS. La existencia del rol EPS no equivale a un módulo EPS completo.
6. **P2 — Robustez posterior:** control de intentos de autenticación, revocación de sesiones ante cambios de rol/estado, auditoría administrativa, limpieza de archivos huérfanos al fallar una carga y almacenamiento privado persistente para despliegue.

## Ejecución local tras configurar el entorno

En una terminal: `cd backend`, `npm.cmd ci`, `npm.cmd run dev`.

En otra: `cd frontend`, `npm.cmd ci`, `npm.cmd run dev`. Abrir `http://localhost:4321`.

Para servir la versión compilada: ejecutar `npm.cmd run build` desde `frontend/` y luego `npm.cmd start` desde `backend/`; abrir `http://localhost:3000` si no se cambió el puerto. Reiniciar el backend después de generar el build.

No ejecutar importaciones, seeds ni migraciones contra producción como parte del arranque.

## Seguimiento del arranque local

Después de la revisión se configuraron los archivos locales ignorados por Git
`backend/.env` y `frontend/.env.local` con los valores proporcionados por el usuario.
No forman parte del commit. El backend inició y confirmó conexión a Neon y Prisma;
la página de inicio y el login respondieron HTTP 200. Se recompiló Astro y se
comprobó que `/recaptcha-config.json` entrega la clave pública configurada.

La inicialización de reCAPTCHA en el navegador sigue pendiente de confirmar:
el acceso reportado usaba `127.0.0.1:4321`, mientras que el backend admite
`localhost`. Se indicó usar `http://localhost:3000/login.html` y comprobar en la
consola de Google el tipo v2 Checkbox y el dominio autorizado. No se certifica
todavía el login completo ni el estado de migraciones o las 1.000 filas en Neon.
