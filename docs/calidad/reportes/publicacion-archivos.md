# Archivos de la publicacion

Rama: `fix/bloqueantes-saludclick`.

## Incluidos

76 archivos (incluye este listado). La baja de `frontend/public/login.html` corresponde al reemplazo por Astro.

- `.gitignore`
- `backend/.env.example`
- `backend/prisma/migrations/20261112120000_administrative_workspace/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/scripts/activar-cuentas-administrativamente.cjs`
- `backend/scripts/activar-cuentas-terminal.ps1`
- `backend/scripts/auditar-cuentas-autorizadas.cjs`
- `backend/scripts/auditar-eps-local.cjs`
- `backend/scripts/auditar-origen-eps.cjs`
- `backend/scripts/diagnosticar-afiliados.cjs`
- `backend/scripts/ejecutar-plan-afiliados-neon.cjs`
- `backend/scripts/importar-afiliados.cjs`
- `backend/scripts/invitar-cuentas-autorizadas.cjs`
- `backend/scripts/preflight-administrative.cjs`
- `backend/scripts/preflight-afiliados-neon.cjs`
- `backend/scripts/preparar-rol-eps.cjs`
- `backend/scripts/reenviar-activaciones-autorizadas.cjs`
- `backend/scripts/respaldar-afiliados-neon.cjs`
- `backend/scripts/support/auditar-archivo-eps.ps1`
- `backend/scripts/validar-afiliados-aislado.cjs`
- `backend/scripts/validar-plan-afiliados-neon.cjs`
- `backend/scripts/verificar-cuentas-autorizadas.cjs`
- `backend/scripts/verificar-fuente-afiliados.cjs`
- `backend/server.js`
- `backend/src/config/activation-url.js`
- `backend/src/config/authorized-accounts.js`
- `backend/src/controllers/administrative.controller.js`
- `backend/src/middlewares/admin.middleware.js`
- `backend/src/middlewares/administrative-rate.middleware.js`
- `backend/src/middlewares/administrative-scope.middleware.js`
- `backend/src/middlewares/administrative-session.middleware.js`
- `backend/src/repositories/admin.repository.js`
- `backend/src/repositories/administrative.repository.js`
- `backend/src/repositories/auth.repository.js`
- `backend/src/routes/admin.routes.js`
- `backend/src/routes/administrative.routes.js`
- `backend/src/routes/afiliados.routes.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/routes/dashboard.routes.js`
- `backend/src/routes/index.js`
- `backend/src/services/administrative-export.service.js`
- `backend/src/services/administrative.service.js`
- `backend/src/services/auth.service.js`
- `backend/src/sockets/administrative.socket.js`
- `backend/src/validators/administrative.validator.js`
- `backend/tests/activacion-administrativa.test.cjs`
- `backend/tests/activation-url.test.cjs`
- `backend/tests/admin-contracts.test.cjs`
- `backend/tests/admin-registration-route.test.cjs`
- `backend/tests/administrative-workspace.test.cjs`
- `backend/tests/afiliados-contracts.test.cjs`
- `backend/tests/afiliados-neon-plan.test.cjs`
- `backend/tests/api-contracts.test.cjs`
- `backend/tests/auth-user-characterization.test.cjs`
- `backend/tests/authorized-accounts.test.cjs`
- `backend/tests/frontend.test.cjs`
- `backend/tests/pacientes-autorizados-contracts.test.cjs`
- `backend/tests/repository-layer.test.cjs`
- `backend/tests/support/administrative-browser.cjs`
- `backend/tests/support/administrative-session-fixture.cjs`
- `docs/calidad/reportes/administrador-implementacion.md`
- `docs/calidad/reportes/publicacion-archivos.md`
- `docs/calidad/reportes/publicacion-segura.md`
- `frontend/public/css/administrative.css`
- `frontend/public/js/admin-cuentas.js`
- `frontend/public/js/admin.js`
- `frontend/public/js/administrative.js`
- `frontend/public/js/auth.js`
- `frontend/public/js/restablecer.js`
- `frontend/public/login.html`
- `frontend/public/pages/admin.html`
- `frontend/public/pages/dashboard.html`
- `frontend/public/pages/soporte.html`
- `frontend/public/restablecer.html`
- `frontend/src/components/AdministrativeSupport.jsx`
- `frontend/src/components/Chat.jsx`

## Excluidos locales

Se conservan en disco. Informes, diagnosticos, recibos y TXT operativos: pueden contener informacion privada; el archivo con U+F022 es un listado accidental de rutas.

- `SaludClick`
- `auth-local-validation.txt`
- `auth-manual-validation.txt`
- `auth-targeted-output.txt`
- `auth-validation-output.txt`
- `backend/scripts/activacion-administrativa-resultado.json`
- `diagnostico-pedidos.txt`
- `docs/calidad/evidencias/EV-001-pruebas-backend.txt`
- `docs/calidad/reportes/activacion-administrativa-preparacion.md`
- `docs/calidad/reportes/afiliados-conexion-origen.md`
- `docs/calidad/reportes/afiliados-diagnostico-diseno.md`
- `docs/calidad/reportes/afiliados-eps-local.json`
- `docs/calidad/reportes/afiliados-eps-origen.json`
- `docs/calidad/reportes/afiliados-eps-validacion.md`
- `docs/calidad/reportes/afiliados-neon-autorizacion.md`
- `docs/calidad/reportes/afiliados-neon-ensayo.json`
- `docs/calidad/reportes/afiliados-neon-plan.json`
- `docs/calidad/reportes/afiliados-neon-preflight.json`
- `docs/calidad/reportes/afiliados-validacion.md`
- `docs/calidad/reportes/cuentas-autorizadas-activacion.md`
- `docs/calidad/reportes/errores-pruebas.txt`

Tambien se excluyen los entornos privados, dependencias, compilaciones, caches y respaldos de datos mediante `.gitignore`.
