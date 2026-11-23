const express = require('express');
const { disponible } = require('../config/farmacia-operacion');
const { createGuard } = require('../middlewares/eps-integration.middleware');
const { createService } = require('../services/eps-integration.service');
const { databaseFailure, safeDiagnostic } = require('../services/eps-errors');
function createRouter({ db, guard, service } = {}) {
  const { sinQuery } = require('../validators/farmacia-solicitudes.validator');
  const r = express.Router(),
    allow = guard || createGuard({ db });
  let s = service;
  const get = () => (s ??= createService(db || require('../config/prisma')));
  const handle =
    (fn, status = 200) =>
    async (req, res) => {
      try {
        res.status(status).json({ ok: true, ...(await fn(get(), req)) });
      } catch (e) {
        if (e.status) return res.status(e.status).json({ ok: false, mensaje: e.message });
        if (['P2002', 'P2034'].includes(e.code))
          return res
            .status(409)
            .json({
              ok: false,
              mensaje: 'Registro duplicado o cambio simultaneo. Actualiza la lista.',
            });
        const f = databaseFailure(e);
        console.error('EPS integration:', safeDiagnostic(e, 'integration-operation'));
        res.status(f.status).json({ ok: false, codigo: f.codigo, mensaje: f.mensaje });
      }
    };
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  r.get(
    '/admin/eps',
    allow(1),
    handle((s, r) => s.entidades(r.actor, r.query)),
  );
  r.post(
    '/admin/eps',
    allow(1),
    handle(async (s, r) => ({ entidad: await s.guardarEntidad(r.actor, null, r.body) }), 201),
  );
  r.put(
    '/admin/eps/:epsId',
    allow(1),
    handle(async (s, r) => ({ entidad: await s.guardarEntidad(r.actor, r.params.epsId, r.body) })),
  );
  r.get(
    '/admin/eps/:epsId/resumen',
    allow(1),
    handle((s, r) => s.supervision(r.actor, r.params.epsId)),
  );
  r.get(
    '/admin/eps/:epsId/autorizaciones',
    allow(1),
    handle((s, r) => s.autorizacionesAdministrativas(r.actor, r.params.epsId, r.query)),
  );
  r.put(
    '/admin/eps/:epsId/acceso',
    allow(1),
    handle(async (s, r) => ({ acceso: await s.acceso(r.actor, r.params.epsId, r.body) })),
  );
  r.put(
    '/admin/eps/:epsId/paciente',
    allow(1),
    handle(async (s, r) => ({ vinculo: await s.pacienteVinculo(r.actor, r.params.epsId, r.body) })),
  );
  r.put(
    '/admin/eps/:epsId/farmacia',
    allow(1),
    handle(async (s, r) => ({ vinculo: await s.farmaciaVinculo(r.actor, r.params.epsId, r.body) })),
  );
  r.get(
    '/paciente/afiliacion',
    allow(2),
    handle((s, r) => s.afiliacion(r.actor)),
  );
  r.get(
    '/paciente/autorizaciones',
    allow(2),
    handle((s, r) => s.autorizacionesPaciente(r.actor, r.query)),
  );
  r.get(
    '/paciente/solicitudes',
    allow(2),
    handle((s, r) => s.solicitudesPaciente(r.actor, r.query)),
  );
  r.put(
    '/eps/autorizaciones/:id/farmacia',
    allow(4),
    handle(async (s, r) => ({ asignacion: await s.derivar(r.actor, r.params.id, r.body) })),
  );
  const farmacia = require('../services/farmacia.service');
  r.get('/farmacia/pedidos', allow(3), handle((s, r) => farmacia.listarPedidos(r.query, r.actor.id, null)));
  r.get('/farmacia/pedidos/:id', allow(3), handle((s, r) => farmacia.detallePedido(r.params.id, r.query, r.actor.id, null)));
  r.get(
    '/farmacia/autorizaciones',
    allow(3),
    handle((s, r) => s.autorizacionesFarmacia(r.actor, r.query)),
  );
  r.patch(
    '/farmacia/solicitudes/:id/estado',
    allow(3),
    handle(async (s, r) => {
      sinQuery(r.query);
      disponible();
      return { pedido: await s.avanzarFarmacia(r.actor, r.params.id, r.body, r.app.get('farmaciaNotificationEvents')) };
    }),
  );
  r.get(
    '/farmacia/convenios',
    allow(3),
    handle(async (s, r) => ({ datos: await s.conveniosFarmacia(r.actor) })),
  );
  r.get(
    '/farmacia/catalogo',
    allow(3),
    handle((s, r) => s.catalogoFarmacia(r.actor, r.query)),
  );
  r.get(
    '/farmacia/existencias',
    allow(3),
    handle((s, r) => s.existenciasFarmacia(r.actor, r.query)),
  );
  r.put(
    '/farmacia/existencias',
    allow(3),
    handle(async (s, r) => {
      disponible();
      return { existencia: await s.stock(r.actor, r.body) };
    }),
  );
  r.get(
    '/notificaciones',
    allow(1, 2, 3, 4),
    handle((s, r) => s.notificaciones(r.actor, r.query)),
  );
  r.patch(
    '/notificaciones/:id/leida',
    allow(1, 2, 3, 4),
    handle((s, r) => s.leer(r.actor, r.params.id)),
  );
  return r;
}
module.exports = { createRouter };
