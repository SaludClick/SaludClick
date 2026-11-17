const express = require('express');
const { createEpsSession } = require('../middlewares/eps-session.middleware');
const { createController } = require('../controllers/eps.controller');
function createRouter({ controller = createController(), guard = createEpsSession() } = {}) {
  const r = express.Router();
  r.use(guard);
  for (const path of [
    'dashboard',
    'afiliados',
    'pacientes',
    'farmacias',
    'inventario',
    'autorizaciones',
    'solicitudes',
    'notificaciones',
  ])
    r.get('/' + path, controller[path]);
  r.get('/verificar-acceso', controller.acceso);
  r.post('/afiliados', controller.crearAfiliado);
  r.patch('/afiliados/:id', controller.actualizarAfiliado);
  r.get('/pacientes/:id', controller.paciente);
  r.put('/farmacias/vinculo', controller.vincular);
  r.post('/autorizaciones', controller.crearAutorizacion);
  r.patch('/autorizaciones/:id', controller.resolverAutorizacion);
  r.patch('/solicitudes/:id/seguimiento', controller.seguimiento);
  r.get('/historial/:tipo/:id', controller.historial);
  r.patch('/notificaciones/:id/leida', controller.leer);
  r.get('/perfil', controller.perfil);
  r.put('/perfil', controller.guardarPerfil);
  r.post('/logout', controller.logout);
  return r;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
