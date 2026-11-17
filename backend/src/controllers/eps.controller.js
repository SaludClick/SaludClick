const { databaseFailure, safeDiagnostic } = require('../services/eps-errors');
function createController({ service } = {}) {
  const get = () =>
    service || require('../services/eps.service').createService(require('../config/prisma'));
  const wrap =
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
        const failure = databaseFailure(e);
        console.error('EPS operation:', safeDiagnostic(e, 'operation'));
        res
          .status(failure.status)
          .json({ ok: false, codigo: failure.codigo, mensaje: failure.mensaje });
      }
    };
  const c = {};
  for (const name of [
    'dashboard',
    'afiliados',
    'pacientes',
    'farmacias',
    'inventario',
    'autorizaciones',
    'solicitudes',
    'notificaciones',
  ])
    c[name] = wrap(async (s, r) => {
      const data = await s[name](r.eps, r.query);
      return name === 'dashboard' ? { estadisticas: data } : data;
    });
  c.acceso = wrap(async () => ({ mensaje: 'Acceso autorizado al panel EPS.' }));
  c.crearAfiliado = wrap(
    async (s, r) => ({ afiliado: await s.guardarAfiliado(r.eps, null, r.body) }),
    201,
  );
  c.actualizarAfiliado = wrap(async (s, r) => ({
    afiliado: await s.guardarAfiliado(r.eps, r.params.id, r.body),
  }));
  c.paciente = wrap(async (s, r) => ({ paciente: await s.paciente(r.eps, r.params.id) }));
  c.vincular = wrap(async (s, r) => ({ vinculo: await s.vincular(r.eps, r.body) }));
  c.crearAutorizacion = wrap(
    async (s, r) => ({ autorizacion: await s.crearAutorizacion(r.eps, r.body) }),
    201,
  );
  c.resolverAutorizacion = wrap(async (s, r) => ({
    autorizacion: await s.resolverAutorizacion(r.eps, r.params.id, r.body),
  }));
  c.seguimiento = wrap(async (s, r) => ({
    seguimiento: await s.seguimiento(r.eps, r.params.id, r.body),
  }));
  c.historial = wrap(async (s, r) => s.historial(r.eps, r.params.tipo, r.params.id, r.query));
  c.leer = wrap(async (s, r) => s.leer(r.eps, r.params.id));
  c.perfil = wrap(async (s, r) => ({ perfil: await s.perfil(r.eps) }));
  c.guardarPerfil = wrap(async (s, r) => ({ perfil: await s.guardarPerfil(r.eps, r.body) }));
  c.logout = wrap(async (s, r) => s.logout(r.eps));
  return c;
}
module.exports = { createController };
