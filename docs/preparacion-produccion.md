# Preparaci?n para producci?n

## Configuraci?n

- Compila Astro desde frontend con npm ci y npm run build. Incluye frontend/dist en el despliegue si Express servir? la p?gina.
- Instala el backend con npm ci y arr?ncalo con NODE_ENV=production. Configura DATABASE_URL, JWT_SECRET y CORS_ORIGINS en el entorno del servicio. CORS_ORIGINS debe incluir el origen HTTPS que utilizar? el navegador.
- Configura las claves de reCAPTCHA y los dominios permitidos. Si se habilitan Google o los correos de activaci?n y recuperaci?n, prueba esos flujos con las credenciales del entorno de preproducci?n.
- Monta un volumen privado y persistente para las f?rmulas y as?gnalo a FORMULA_UPLOAD_DIR mediante una ruta absoluta. Migra o monta los archivos existentes en esa ruta antes de cambiar de almacenamiento. Comprueba la restauraci?n conjunta de la base de datos y los adjuntos.
- Comprueba el estado de las migraciones y pru?balas sobre una copia aislada antes de aplicarlas al destino. Verifica que la credencial de Neon reportada en el informe de publicaci?n fue rotada y revocada.

## Verificaci?n de la entrega

1. Compila el frontend y ejecuta npm test desde backend.
2. Ejecuta node --test tests/eps-postgres.isolated.cjs tests/eps-roles.isolated.cjs desde backend. Para incluir Edge, establece EPS_BROWSER=1 y EPS_ROLES_BROWSER=1 despu?s de compilar.
3. En preproducci?n, verifica /api/health y el acceso con una cuenta de cada rol. Comprueba que la farmacia asignada ve el pedido y otra farmacia recibe un listado vac?o o un 404 al consultar su detalle.
4. Comprueba que cancelar dos veces una solicitud elegible repone el stock una sola vez y conserva el historial. Las solicitudes con pago real requieren un flujo de reembolso autorizado.

## Funciones pendientes de habilitaci?n

- Para ejecutar el recorrido completo de pedidos con tarjetas de prueba, configura `PEDIDOS_SIMULADOS=true` en el backend del entorno de simulación. El checkout registra la operación como simulada y Farmacia identifica esos pedidos durante la preparación y entrega. Los cobros reales requieren un proveedor de pagos.
- Los art?culos con f?rmula requerida o con requisito desconocido no se pueden dispensar. Para habilitar este flujo hace falta un responsable autorizado, la relaci?n entre f?rmula y pedido, controles de acceso y registro de la decisi?n.
- La cola de Farmacia muestra pedidos asignados por EPS. Cualquier flujo de pedidos sin asignaci?n EPS requiere una relaci?n verificable de titularidad antes de habilitar su consulta o entrega.
