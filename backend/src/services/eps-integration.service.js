const { operacion } = require('./farmacia.service');
const v = require('../validators/eps.validator');
const pharmacySelect = { id: true, nombre: true, apellido: true, estado: true };
const ownRole = (c, role) => {
  if (c.rol !== role) v.fail('Operacion fuera de tu rol.', 403);
};
const same = (a, u, p) =>
  u.rol_id === 2 &&
  u.estado === 'ACTIVO' &&
  u.cedula === a.documento &&
  u.nombre === a.nombres &&
  u.apellido === a.apellidos &&
  u.tipo_documento === a.tipo_documento &&
  u.correo === a.correo &&
  p?.estado === 'AUTORIZADO' &&
  p.nombres === a.nombres &&
  p.apellidos === a.apellidos &&
  p.tipo_documento === a.tipo_documento;
function createService(
  db,
  { advanceOrder = (...args) => require('./farmacia.service').avanzarPedido(...args) } = {},
) {
  const event = (tx, c, epsId, tipo, id, titulo, detalle = {}) =>
    tx.epsEvento.create({
      data: { eps_id: epsId, actor_id: c.id, tipo, registro_id: String(id), titulo, detalle },
    });
  async function entity(tx, id) {
    id = v.text(id, 'EPS', 80);
    const e = await tx.epsEntidad.findUnique({ where: { id } });
    if (!e) v.fail('Entidad EPS no encontrada.', 404);
    return e;
  }
  async function page(model, where, q, select) {
    return db.$transaction(
      async (tx) => {
        const total = await tx[model].count({ where }),
          paginas = Math.max(1, Math.ceil(total / 25)),
          pagina = Math.min(q.pagina, paginas);
        return {
          datos: await tx[model].findMany({
            where,
            select,
            orderBy: { id: 'desc' },
            skip: (pagina - 1) * 25,
            take: 25,
          }),
          paginacion: { total, pagina, paginas, tamano: 25 },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  const pharmacyScope = (c) => ({
    estado: 'APROBADA',
    farmacia_vinculo: { farmacia_id: c.id, activa: true, eps: { activa: true }, farmacia: { rol_id: 3, estado: 'ACTIVO' } },
  });
  return {
    entidades(c, input) {
      ownRole(c, 1);
      const q = v.query(input);
      return page(
        'epsEntidad',
        q.buscar ? { nombre: { contains: q.buscar, mode: 'insensitive' } } : {},
        q,
        {
          id: true,
          nombre: true,
          nit: true,
          correo: true,
          telefono: true,
          direccion: true,
          ciudad: true,
          activa: true,
          version: true,
          _count: { select: { accesos: true, farmacias: true, autorizaciones: true } },
        },
      );
    },
    async guardarEntidad(c, id, input) {
      ownRole(c, 1);
      v.object(
        input,
        id
          ? ['nombre', 'nit', 'correo', 'telefono', 'direccion', 'ciudad', 'activa', 'version']
          : ['id', 'nombre', 'nit', 'correo', 'telefono', 'direccion', 'ciudad'],
      );
      const data = {};
      for (const [k, max] of Object.entries({
        nombre: 150,
        nit: 30,
        correo: 150,
        telefono: 20,
        direccion: 255,
        ciudad: 100,
      }))
        data[k] = v.text(input[k] ?? '', k, max, ['nombre', 'ciudad'].includes(k));
      if (data.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo))
        v.fail('Correo invalido.');
      if (id && typeof input.activa !== 'boolean') v.fail('Estado de EPS invalido.');
      const key = id ? v.text(id, 'EPS', 80) : v.text(input.id, 'EPS', 80);
      return db.$transaction(
        async (tx) => {
          let row;
          if (id) {
            const old = await entity(tx, key),
              version = v.id(input.version);
            if (old.version !== version) v.fail('La entidad cambio. Actualiza la ficha.', 409);
            if (
              Object.entries(data).every(([k, value]) => old[k] === value) &&
              old.activa === input.activa
            )
              return old;
            const changed = await tx.epsEntidad.updateMany({
              where: { id: key, version },
              data: { ...data, activa: input.activa, version: { increment: 1 } },
            });
            if (changed.count !== 1) v.fail('La entidad cambio.', 409);
            row = await entity(tx, key);
          } else row = await tx.epsEntidad.create({ data: { id: key, ...data } });
          await event(
            tx,
            c,
            key,
            'CONFIGURACION',
            key,
            id ? 'Entidad EPS actualizada' : 'Entidad EPS registrada',
            { campos: Object.keys(data) },
          );
          return row;
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async supervision(c, epsId) {
      ownRole(c, 1);
      await entity(db, epsId);
      return db.$transaction(
        async (tx) => {
          const [afiliados, pacientes, farmacias, autorizaciones, pendientes, solicitudes] =
            await Promise.all([
              tx.afiliado.count({ where: { eps_id: epsId } }),
              tx.afiliado.count({ where: { eps_id: epsId, usuario_id: { not: null } } }),
              tx.epsFarmacia.count({ where: { eps_id: epsId, activa: true } }),
              tx.epsAutorizacion.count({ where: { eps_id: epsId } }),
              tx.epsAutorizacion.count({ where: { eps_id: epsId, estado: 'PENDIENTE' } }),
              tx.solicitud.count({ where: { usuario: { afiliado: { is: { eps_id: epsId } } } } }),
            ]);
          return {
            estadisticas: {
              afiliados,
              pacientes,
              farmacias,
              autorizaciones,
              pendientes,
              solicitudes,
            },
            accesos: await tx.epsAcceso.findMany({
              where: { eps_id: epsId },
              select: {
                usuario_id: true,
                activo: true,
                usuario: {
                  select: { id: true, nombre: true, apellido: true, rol_id: true, estado: true },
                },
              },
            }),
            farmacias: await tx.epsFarmacia.findMany({
              where: { eps_id: epsId },
              select: {
                id: true,
                farmacia_id: true,
                activa: true,
                version: true,
                farmacia: { select: pharmacySelect },
              },
            }),
          };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    },
    autorizacionesAdministrativas(c, epsId, input) {
      ownRole(c, 1);
      const q = v.query(input);
      return page('epsAutorizacion', { eps_id: v.text(epsId, 'EPS', 80) }, q, {
        id: true,
        eps_id: true,
        estado: true,
        responsable_id: true,
        farmacia_vinculo_id: true,
        created_at: true,
        updated_at: true,
      });
    },
    async acceso(c, epsId, input) {
      ownRole(c, 1);
      v.object(input, ['usuario_id', 'activo']);
      const usuario_id = v.id(input.usuario_id);
      if (typeof input.activo !== 'boolean') v.fail('Estado de acceso invalido.');
      return db.$transaction(
        async (tx) => {
          await entity(tx, epsId);
          const u = await tx.usuario.findUnique({
            where: { id: usuario_id },
            select: { id: true, rol_id: true, estado: true },
          });
          if (!u || u.rol_id !== 4 || u.estado !== 'ACTIVO')
            v.fail('Se requiere una cuenta EPS activa.', 400);
          const old = await tx.epsAcceso.findUnique({ where: { usuario_id } });
          if (old && old.eps_id !== epsId)
            v.fail('La cuenta pertenece a otra EPS. Requiere revision expresa.', 409);
          if (old && old.activo === input.activo) return { usuario_id, activo: old.activo };
          const row = old
            ? await tx.epsAcceso.update({
                where: { usuario_id },
                data: { activo: input.activo, revocado_at: new Date() },
              })
            : await tx.epsAcceso.create({
                data: { usuario_id, eps_id: epsId, activo: input.activo },
              });
          await event(
            tx,
            c,
            epsId,
            'CONFIGURACION',
            usuario_id,
            'Acceso de cuenta EPS actualizado',
            { activo: input.activo },
          );
          return { usuario_id: row.usuario_id, activo: row.activo };
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async pacienteVinculo(c, epsId, input) {
      ownRole(c, 1);
      v.object(input, ['afiliado_id', 'usuario_id']);
      const id = v.text(input.afiliado_id, 'Afiliado', 150),
        usuario_id = v.id(input.usuario_id);
      return db.$transaction(
        async (tx) => {
          await entity(tx, epsId);
          const a = await tx.afiliado.findFirst({ where: { id, eps_id: epsId } }),
            u = await tx.usuario.findUnique({
              where: { id: usuario_id },
              select: {
                id: true,
                rol_id: true,
                estado: true,
                cedula: true,
                nombre: true,
                apellido: true,
                tipo_documento: true,
                correo: true,
              },
            });
          if (!a || !u) v.fail('Afiliado o cuenta no encontrados.', 404);
          const p = await tx.pacienteAutorizado.findUnique({ where: { cedula: a.documento } });
          if (!same(a, u, p))
            v.fail('La identidad y la autorizacion vigente deben coincidir exactamente.', 409);
          if (a.usuario_id === usuario_id) return { id, usuario_id };
          if (a.usuario_id || (await tx.afiliado.findUnique({ where: { usuario_id } })))
            v.fail('La persona ya tiene una vinculacion. No se trasladara automaticamente.', 409);
          const changed = await tx.afiliado.updateMany({
            where: { id, eps_id: epsId, usuario_id: null, eps_version: a.eps_version },
            data: {
              usuario_id,
              verificado_por: c.id,
              verificado_at: new Date(),
              eps_version: { increment: 1 },
            },
          });
          if (changed.count !== 1) v.fail('La afiliacion cambio.', 409);
          await event(tx, c, epsId, 'AFILIADO', id, 'Cuenta de paciente vinculada', {
            campos: ['usuario_id'],
          });
          return { id, usuario_id };
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async farmaciaVinculo(c, epsId, input) {
      ownRole(c, 1);
      await entity(db, epsId);
      return require('./eps.service').createService(db).vincular({ id: epsId, actor: c.id }, input);
    },
    async afiliacion(c) {
      ownRole(c, 2);
      const a = await db.afiliado.findUnique({
        where: { usuario_id: c.id },
        select: {
          id: true,
          eps_id: true,
          estado: true,
          regimen: true,
          tipo_documento: true,
          documento: true,
          nombres: true,
          apellidos: true,
        },
      });
      if (!a) return { afiliacion: null };
      const eps = await db.epsEntidad.findUnique({
        where: { id: a.eps_id },
        select: {
          id: true,
          nombre: true,
          activa: true,
          correo: true,
          telefono: true,
          ciudad: true,
        },
      });
      return { afiliacion: { ...a, eps } };
    },
    autorizacionesPaciente(c, input) {
      ownRole(c, 2);
      const q = v.query(input);
      return page('epsAutorizacion', { afiliado: { usuario_id: c.id } }, q, {
        id: true,
        estado: true,
        concepto: true,
        motivo: true,
        solicitud_id: true,
        updated_at: true,
        eps: { select: { id: true, nombre: true } },
        farmacia_vinculo: { select: { farmacia: { select: pharmacySelect } } },
      });
    },
    solicitudesPaciente(c, input) {
      ownRole(c, 2);
      const q = v.query(input);
      return page('solicitud', { usuario_id: c.id }, q, {
        id: true,
        estado: true,
        fecha: true,
        detalles: { select: { cantidad: true, medicamento: { select: { nombre: true } } } },
        autorizaciones_eps: { select: { id: true, estado: true, updated_at: true } },
      });
    },
    async derivar(c, id, input) {
      ownRole(c, 4);
      id = v.id(id);
      v.object(input, ['farmacia_id', 'version']);
      const farmacia_id = v.id(input.farmacia_id),
        version = v.id(input.version);
      return db.$transaction(
        async (tx) => {
          const a = await tx.epsAutorizacion.findFirst({
            where: { id, eps_id: c.epsId, estado: 'APROBADA', afiliado: { eps_id: c.epsId } },
            include: { solicitud: { select: { estado: true } } },
          });
          if (!a || !a.solicitud_id)
            v.fail('Se requiere una autorizacion aprobada con solicitud propia.', 404);
          const f = await tx.epsFarmacia.findFirst({
            where: {
              eps_id: c.epsId,
              farmacia_id,
              activa: true,
              farmacia: { rol_id: 3, estado: 'ACTIVO' },
            },
          });
          if (!f) v.fail('Farmacia no vinculada a esta EPS.', 404);
          if (a.farmacia_vinculo_id === f.id) return { id, farmacia_id };
          if (a.solicitud.estado !== 'APROBADA')
            v.fail('La solicitud ya no est? pendiente de preparaci?n.', 409);
          const otherAssignment = await tx.epsAutorizacion.findFirst({
            where: {
              id: { not: id }, solicitud_id: a.solicitud_id, estado: 'APROBADA',
              farmacia_vinculo_id: { not: null },
            },
            select: { id: true },
          });
          if (otherAssignment)
            v.fail('La solicitud ya est? asignada en otra autorizaci?n. Reasigna desde esa autorizaci?n.', 409);
          const changed = await tx.epsAutorizacion.updateMany({
            where: { id, eps_id: c.epsId, version, estado: 'APROBADA' },
            data: { farmacia_vinculo_id: f.id, version: { increment: 1 } },
          });
          if (changed.count !== 1) v.fail('La autorizacion cambio. Recarga la lista.', 409);
          await event(tx, c, c.epsId, 'AUTORIZACION', id, 'Farmacia asignada a la autorizacion', {
            farmacia_id,
          });
          return { id, farmacia_id };
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async autorizacionesFarmacia(c, input) {
      ownRole(c, 3);
      const q = v.query(input);
      const result = await page('epsAutorizacion', pharmacyScope(c), q, {
        id: true,
        estado: true,
        solicitud_id: true,
        updated_at: true,
        eps: { select: { id: true, nombre: true } },
        afiliado: { select: { nombres: true, apellidos: true } },
        solicitud: {
          select: {
            id: true,
            estado: true,
            pagos: { select: { estado: true, simulacion: true } },
            detalles: {
              select: { cantidad: true, medicamento: { select: { id: true, nombre: true, requiere_formula: true } } },
            },
          },
        },
      });
      result.datos = result.datos.map(row => {
        if (!row.solicitud) return row;
        const { id, estado, detalles } = row.solicitud;
        return { ...row, solicitud: {
          id, estado, operacion: operacion(row.solicitud),
          detalles: detalles.map(({ cantidad, medicamento }) => ({
            cantidad, medicamento: { id: medicamento.id, nombre: medicamento.nombre },
          })),
        } };
      });
      return result;
    },
    async avanzarFarmacia(c, id, input, notify) {
      ownRole(c, 3);
      id = v.id(id);
      const a = await db.epsAutorizacion.findFirst({
        where: { solicitud_id: id, ...pharmacyScope(c) },
        select: { id: true },
      });
      if (!a) v.fail('Solicitud no asignada a esta farmacia.', 404);
      return advanceOrder(String(id), input, notify, c.id, a.id);
    },
    catalogoFarmacia(c, input) {
      ownRole(c, 3);
      const q = v.query(v.object(input, ['buscar', 'pagina']));
      const where = q.buscar
        ? { OR: ['nombre', 'principio_activo', 'registro_sanitario'].map(campo => ({
            [campo]: { contains: q.buscar, mode: 'insensitive' },
          })) }
        : {};
      return page('medicamento', where, q, {
        id: true, nombre: true, concentracion: true, presentacion: true, registro_sanitario: true,
      });
    },
    existenciasFarmacia(c, input) {
      ownRole(c, 3);
      const q = v.query(input);
      return page(
        'epsExistencia',
        {
          vinculo: { farmacia_id: c.id, activa: true, eps: { activa: true } },
          ...(q.buscar
            ? { medicamento: { nombre: { contains: q.buscar, mode: 'insensitive' } } }
            : {}),
        },
        q,
        {
          id: true,
          stock: true,
          minimo: true,
          actualizado_at: true,
          vinculo_id: true,
          medicamento_id: true,
          medicamento: { select: { id: true, nombre: true } },
          vinculo: { select: { eps_id: true, eps: { select: { nombre: true } } } },
        },
      );
    },
    async stock(c, input) {
      ownRole(c, 3);
      v.object(input, ['vinculo_id', 'medicamento_id', 'stock', 'minimo', 'actualizado_at']);
      const vinculo_id = v.id(input.vinculo_id),
        medicamento_id = v.id(input.medicamento_id);
      if (
        !Number.isSafeInteger(input.stock) ||
        input.stock < 0 ||
        !Number.isSafeInteger(input.minimo) ||
        input.minimo < 0
      )
        v.fail('Existencias y minimo deben ser enteros no negativos.');
      return db.$transaction(
        async (tx) => {
          const link = await tx.epsFarmacia.findFirst({
            where: { id: vinculo_id, farmacia_id: c.id, activa: true, eps: { activa: true } },
          });
          if (!link) v.fail('Convenio de farmacia no encontrado.', 404);
          if (
            !(await tx.medicamento.findUnique({
              where: { id: medicamento_id },
              select: { id: true },
            }))
          )
            v.fail('Medicamento no encontrado.', 404);
          const key = { vinculo_id_medicamento_id: { vinculo_id, medicamento_id } };
          const old = await tx.epsExistencia.findUnique({ where: key });
          if (old) {
            if (old.stock === input.stock && old.minimo === input.minimo) return old;
            const date = new Date(input.actualizado_at);
            if (!input.actualizado_at || isNaN(date.getTime()))
              v.fail('Recarga las existencias antes de guardar.', 409);
            const r = await tx.epsExistencia.updateMany({
              where: { id: old.id, actualizado_at: date },
              data: { stock: input.stock, minimo: input.minimo, actualizado_at: new Date() },
            });
            if (r.count !== 1) v.fail('Las existencias cambiaron. Actualiza la lista.', 409);
            return tx.epsExistencia.findUnique({ where: key });
          }
          return tx.epsExistencia.create({
            data: { vinculo_id, medicamento_id, stock: input.stock, minimo: input.minimo },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    },
    conveniosFarmacia(c) {
      ownRole(c, 3);
      return db.epsFarmacia.findMany({
        where: { farmacia_id: c.id, activa: true, eps: { activa: true } },
        select: { id: true, eps_id: true, eps: { select: { nombre: true } } },
        orderBy: { id: 'asc' },
      });
    },
    notificaciones(c, input) {
      const q = v.query(input);
      if (q.estado) v.choice(q.estado, ['PENDIENTE', 'LEIDA']);
      return page(
        'epsNotificacionCompartida',
        {
          usuario_id: c.id,
          rol_destinatario: c.rol,
          ...(c.rol === 4 ? { eps_id: c.epsId } : {}),
          ...(c.rol === 1 ? { tipo: 'CONFIGURACION' } : {}),
          ...(q.estado ? { leida_at: q.estado === 'PENDIENTE' ? null : { not: null } } : {}),
        },
        q,
        { id: true, tipo: true, registro_id: true, titulo: true, created_at: true, leida_at: true },
      );
    },
    async leer(c, id) {
      id = v.id(id);
      return db.$transaction(async (tx) => {
        const where = {
          id,
          usuario_id: c.id,
          rol_destinatario: c.rol,
          ...(c.rol === 4 ? { eps_id: c.epsId } : {}),
          ...(c.rol === 1 ? { tipo: 'CONFIGURACION' } : {}),
        };
        const item = await tx.epsNotificacionCompartida.findFirst({
          where,
          select: { id: true, clave: true, eps_id: true },
        });
        if (!item) v.fail('Notificacion no encontrada.', 404);
        await tx.epsNotificacionCompartida.updateMany({
          where: { ...where, leida_at: null },
          data: { leida_at: new Date() },
        });
        if (c.rol === 4 && /^EPS_EVENTO:[1-9]\d*$/.test(item.clave)) {
          const eventId = Number(item.clave.split(':')[1]);
          const e = await tx.epsEvento.findFirst({
            where: { id: eventId, eps_id: c.epsId },
            select: { id: true },
          });
          if (e)
            await tx.epsLectura.upsert({
              where: { evento_id_usuario_id: { evento_id: eventId, usuario_id: c.id } },
              create: { evento_id: eventId, usuario_id: c.id },
              update: {},
            });
        }
        return { id };
      });
    },
  };
}
module.exports = { createService, same };
