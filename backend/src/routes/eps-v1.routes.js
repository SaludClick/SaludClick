const express = require('express');
const { createEpsSession } = require('../middlewares/eps-session.middleware');
const { createController } = require('../controllers/eps-v1.controller');
function createRouter({ controller = createController(), guard = createEpsSession() } = {}) {
  const r = express.Router();
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
    r.get('/' + path, guard, controller[path]);
  r.get('/verificar-acceso', guard, controller.acceso);
  r.post('/afiliados', guard, controller.crearAfiliado);
  r.patch('/afiliados/:id', guard, controller.actualizarAfiliado);
  r.get('/pacientes/:id', guard, controller.paciente);
  r.put('/farmacias/vinculo', guard, controller.vincular);
  r.post('/autorizaciones', guard, controller.crearAutorizacion);
  r.patch('/autorizaciones/:id', guard, controller.resolverAutorizacion);
  r.patch('/solicitudes/:id/seguimiento', guard, controller.seguimiento);
  r.get('/historial/:tipo/:id', guard, controller.historial);
  r.patch('/notificaciones/:id/leida', guard, controller.leer);
  r.get('/perfil', guard, controller.perfil);
  r.put('/perfil', guard, controller.guardarPerfil);
  r.post('/logout', guard, controller.logout);
  return r;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
