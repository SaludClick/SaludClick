# Roles y permisos de SaludClick

Actualizado el 11 de noviembre de 2026. Esta entrega conserva los IDs existentes:
administrador 1, usuario/paciente 2, farmacia 3 y EPS 4. No cambia roles ni registros
en Neon y no agrega migraciones.

## Matriz de acceso

| Función | Usuario/paciente | Farmacia | Administrador | EPS |
| --- | --- | --- | --- | --- |
| Inicio tras login | Dashboard personal | Panel de farmacia | Administración | Perfil |
| Perfil propio | Sí | Sí | Sí | Sí |
| Pedidos, checkout e historial personales | Solo propios | No | No | No |
| Cargar y consultar fórmulas personales | Solo propias | No | No | No |
| Cuentas de paciente, farmacia y EPS | No | No | Sí | No |
| Indicadores y pedidos administrativos | No | No | Sí | No |
| Revisión administrativa de fórmulas | No | No | Sí | No |
| Pedidos operativos para preparación y entrega | No | Sí | No, usa su módulo administrativo | No |
| Inventario paginado de farmacia | No | Consulta | No, conserva sus indicadores | No |
| Chat | Conversaciones propias | Conversaciones autorizadas | No | No |

El catálogo básico `/api/medicamentos` conserva la consulta autenticada existente.
La pantalla de compra es del paciente; farmacia tiene su propia consulta de
existencias. No se añadió edición de stock o precios.

## Protección en el backend

- Las rutas personales de pedidos, fórmulas y dashboard requieren JWT y rol 2.
  Los repositorios conservan el filtro por propietario.
- Administración mantiene su acceso exclusivo al rol 1 y farmacia al rol 3.
  Un administrador no necesita usar una identidad de farmacia para gestionar
  pedidos: mantiene su módulo administrativo existente.
- Las nuevas rutas no reciben un rol, usuario propietario, precio o inventario
  desde el cliente como autorización.
- Los filtros se validan; las listas devuelven 25 elementos por página, con orden
  estable. Los pedidos operativos no incluyen correo, contraseña ni pagos.
- El perfil solo actualiza los campos permitidos. Si se omite la cédula se
  conserva; el frontend permite editarla expresamente. El correo es solo lectura.
- Los errores async no capturados reciben JSON genérico 500; las APIs inexistentes
  reciben 404 y los cuerpos por encima del límite reciben 413 sin stacks internos.

## API de farmacia

Todas estas rutas requieren `Authorization: Bearer <JWT>` con rol de farmacia.

| Método y ruta | Uso |
| --- | --- |
| `GET /api/farmacia/verificar-acceso` | Comprobar acceso existente |
| `GET /api/farmacia/pedidos?pagina=1&estado=APROBADA` | Consultar pedidos operativos |
| `GET /api/farmacia/inventario?pagina=1&buscar=acetaminofen` | Consultar existencias |
| `PATCH /api/farmacia/pedidos/:id/estado` | Avanzar un pedido pagado |

Sin filtro de estado se muestran `APROBADA`, `PREPARANDO` y `LISTA`.
El filtro también admite `ENTREGADA`. No se incluyen pedidos pendientes o cancelados.
La respuesta contiene `paginacion` con `pagina`, `tamano`, `total` y `paginas`.

Ejemplo de cuerpo para avanzar un pedido:

```json
{ "estadoActual": "APROBADA", "estado": "PREPARANDO" }
```

Solo se permite `APROBADA → PREPARANDO → LISTA → ENTREGADA`.
La actualización compara el estado anterior y comprueba que exista un pago
aprobado en una sola operación de base. Si el pedido cambió, no existe o no tiene
pago aprobado, responde 409; se debe actualizar la lista. Farmacia no puede
cancelar, retroceder, saltarse pasos, alterar precios ni modificar cuentas.

## Pantallas y sesiones

- `/pages/farmacia.html` ofrece filtros, páginas, existencias y acciones operativas.
- `frontend/public/js/roles.js` centraliza destinos y permisos de pantallas.
- Los enlaces no permitidos se ocultan. Los accesos directos y destinos pendientes
  de otro rol llevan a su inicio correspondiente. Esto acompaña la autorización
  del backend; los datos del almacenamiento del navegador no dan permisos en Express.
- Guardar el perfil conserva el tipo de sesión: temporal o persistente.
- Chat redirige sesiones ausentes a `/login.html` y no consulta ni inicia sockets
  para administrador, EPS o identidades desconocidas.

## Verificación de esta entrega

- Suite completa: **369 pruebas aprobadas, ninguna fallida ni omitida**.
- Incluye recorridos Edge con API simulada: preparación y entrega, inventario,
  login por rol, destinos pendientes ajenos, menús, perfil temporal y rechazo en chat.
- Build Astro correcto. `astro check`: 0 errores y 0 advertencias; permanece una
  sugerencia histórica por variable sin uso en `dashboard.js`.
- Backend reiniciado con conexión a Neon y Prisma. Páginas verificadas con HTTP 200
  y rutas nuevas verificadas sin sesión, sin efectuar operaciones sobre datos.
- No se probaron escrituras reales de farmacia ni se ejecutó la suite PostgreSQL
  de fixtures: requiere una base local aislada. No se modificó producción.

## Límites y siguiente entrega

1. Validar persistencia y concurrencia con `TEST_DATABASE_URL` en la base aislada
   exigida por el runner. No usar Neon de producción como destino de fixtures.
2. Los pedidos e inventario son compartidos por el sistema: no existe un modelo
   de sucursales o asignación de pedidos a una farmacia concreta. Diseñar esa
   separación antes de ofrecer una plataforma para varias farmacias independientes.
3. El JWT mantiene las claims emitidas al iniciar sesión. Falta invalidación
   inmediata ante cambios de rol/estado y gestión segura de sesiones.
4. EPS conserva su rol y acceso al perfil; sus flujos específicos siguen pendientes.
5. La revisión de fórmulas por farmacia no se habilitó: permanece en administración.
   La asociación obligatoria de fórmula con pedido sigue pendiente.
6. Confirmar reCAPTCHA v2 y dominio en la consola de Google y recorrer el login real.

## Commits de la primera tanda

Los cambios se publicaron de uno en uno, sin reescribir historia:

1. `1b2c35f`: limitar funciones personales al paciente.
2. `a923492`: consultas paginadas de farmacia.
3. `c942c39`: transiciones operativas con control de concurrencia.
4. `697f7d7`: panel de farmacia y pruebas de navegador.
5. `6e09318`: destinos y navegación por rol.
6. `7b766ca`: acceso y redirección del chat.
7. `f381210`: documento y sesión del perfil.
8. `9cc54c9`: respuestas seguras de error en la API.
9. Documentación de permisos, validaciones y límites de esta entrega.

La rama tenía 30 commits al comenzar; esta tanda la lleva a 39. La meta de superar
100 sigue pendiente y debe cubrirse con mejoras funcionales verificadas, conservando
commits que se puedan revisar y revertir de forma independiente.
