const authorizationSelect = {
  id: true,
  eps_id: true,
  afiliado_id: true,
  solicitud_id: true,
  concepto: true,
  estado: true,
  motivo: true,
  responsable_id: true,
  version: true,
  created_at: true,
  updated_at: true,
};
const { randomUUID } = require('node:crypto');
const v = require('../validators/eps.validator');
const patientSelect = {
  id: true,
  nombre: true,
  apellido: true,
  tipo_documento: true,
  cedula: true,
  estado: true,
};
const pharmacySelect = {
  id: true,
  nombre: true,
  apellido: true,
  correo: true,
  telefono: true,
  ciudad: true,
  estado: true,
};
const searchable = (fields, term) =>
  term ? { OR: fields.map((f) => ({ [f]: { contains: term, mode: 'insensitive' } })) } : {};
function createService(db) {
  const event = (tx, c, tipo, id, titulo, detalle = {}) =>
    tx.epsEvento.create({
      data: { eps_id: c.id, actor_id: c.actor, tipo, registro_id: String(id), titulo, detalle },
    });
  async function page(model, where, q, options = {}) {
    return db.$transaction(
      async (tx) => {
        const total = await tx[model].count({ where });
        const paginas = Math.max(1, Math.ceil(total / 25));
        const pagina = Math.min(q.pagina, paginas);
        const datos = await tx[model].findMany({
          where,
          orderBy: { id: 'desc' },
          skip: (pagina - 1) * 25,
          take: 25,
          ...options,
        });
        return { datos, paginacion: { pagina, paginas, total, tamano: 25 } };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  const patientScope = (c) => ({ rol_id: 2, afiliado: { is: { eps_id: c.id } } });
  const requestScope = (c) => ({ usuario: patientScope(c) });
  async function affiliate(tx, c, id, active = false) {
    const a = await tx.afiliado.findFirst({
      where: {
        id,
        eps_id: c.id,
        ...(active ? { estado: { equals: 'ACTIVO', mode: 'insensitive' } } : {}),
      },
    });
    if (!a) v.fail('Afiliado no encontrado o sin afiliacion activa.', 404);
    return a;
  }
  async function request(tx, c, id) {
    const s = await tx.solicitud.findFirst({
      where: { id, ...requestScope(c) },
      select: { id: true, usuario_id: true, estado: true },
    });
    if (!s) v.fail('Solicitud no encontrada.', 404);
    return s;
  }
  return {
    async dashboard(c) {
      return db.$transaction(
        async (tx) => {
          const unread = { eps_id: c.id, lecturas: { none: { usuario_id: c.actor } } };
          const [
            afiliados,
            pacientes,
            farmacias,
            autorizaciones,
            pendientes,
            solicitudes,
            inventario,
            agotados,
            bajo,
            notificaciones,
          ] = await Promise.all([
            tx.afiliado.count({ where: { eps_id: c.id } }),
            tx.usuario.count({ where: patientScope(c) }),
            tx.epsFarmacia.count({
              where: { eps_id: c.id, activa: true, farmacia: { rol_id: 3, estado: 'ACTIVO' } },
            }),
            tx.epsAutorizacion.count({ where: { eps_id: c.id } }),
            tx.epsAutorizacion.count({ where: { eps_id: c.id, estado: 'PENDIENTE' } }),
            tx.solicitud.count({ where: requestScope(c) }),
            tx.epsExistencia.count({
              where: {
                vinculo: { eps_id: c.id, activa: true, farmacia: { rol_id: 3, estado: 'ACTIVO' } },
              },
            }),
            tx.epsExistencia.count({
              where: {
                vinculo: { eps_id: c.id, activa: true, farmacia: { rol_id: 3, estado: 'ACTIVO' } },
                stock: 0,
              },
            }),
            tx.epsExistencia.count({
              where: {
                vinculo: { eps_id: c.id, activa: true, farmacia: { rol_id: 3, estado: 'ACTIVO' } },
                stock: { gt: 0, lte: tx.epsExistencia.fields.minimo },
              },
            }),
            tx.epsEvento.count({ where: unread }),
          ]);
          return {
            afiliados,
            pacientes,
            farmacias,
            autorizaciones,
            pendientes,
            solicitudes,
            inventario,
            agotados,
            stock_bajo: bajo,
            notificaciones,
          };
        },
        { isolationLevel: 'RepeatableRead' },
      );
    },
    afiliados(c, input) {
      const q = v.query(input);
      if (q.estado) v.choice(q.estado, ['ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'RETIRADO']);
      return page(
        'afiliado',
        {
          eps_id: c.id,
          ...searchable(['nombres', 'apellidos', 'documento', 'correo'], q.buscar),
          ...(q.estado ? { estado: { equals: q.estado, mode: 'insensitive' } } : {}),
        },
        q,
        {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            tipo_documento: true,
            documento: true,
            fecha_nacimiento: true,
            telefono: true,
            correo: true,
            direccion: true,
            ciudad: true,
            regimen: true,
            estado: true,
            usuario_id: true,
            eps_version: true,
          },
        },
      );
    },
    async guardarAfiliado(c, id, input) {
      const data = v.afiliado(input, !id);
      if (id) v.id(input.version);
      return db.$transaction(
        async (tx) => {
          let row;
          if (id) {
            const a = await affiliate(tx, c, id);
            if (
              a.usuario_id &&
              ['nombres', 'apellidos', 'correo'].some(
                (k) => data[k] !== undefined && data[k] !== a[k],
              )
            )
              v.fail(
                'La identidad vinculada debe corregirse mediante el procedimiento autorizado de cuentas.',
                409,
              );
            const changed = await tx.afiliado.updateMany({
              where: { id, eps_id: c.id, eps_version: input.version },
              data: { ...data, eps_version: { increment: 1 } },
            });
            if (changed.count !== 1) v.fail('La afiliacion cambio. Recarga la ficha.', 409);
            row = await tx.afiliado.findFirst({ where: { id, eps_id: c.id } });
          } else {
            row = await tx.afiliado.create({ data: { ...data, id: randomUUID(), eps_id: c.id } });
          }
          await event(
            tx,
            c,
            'AFILIADO',
            row.id,
            id ? 'Afiliacion actualizada' : 'Afiliado registrado',
            { campos: Object.keys(data), estado: row.estado },
          );
          return row;
        },
        { isolationLevel: 'Serializable' },
      );
    },
    pacientes(c, input) {
      const q = v.query(input);
      if (q.estado) v.choice(q.estado, ['ACTIVO', 'INACTIVO']);
      return page(
        'usuario',
        {
          ...patientScope(c),
          ...searchable(['nombre', 'apellido', 'cedula'], q.buscar),
          ...(q.estado ? { estado: q.estado } : {}),
        },
        q,
        {
          select: {
            ...patientSelect,
            afiliado: { select: { id: true, estado: true, regimen: true } },
          },
        },
      );
    },
    async paciente(c, id) {
      id = v.id(id);
      const p = await db.usuario.findFirst({
        where: { id, ...patientScope(c) },
        select: {
          ...patientSelect,
          afiliado: { select: { id: true, estado: true, regimen: true } },
        },
      });
      if (!p) v.fail('Paciente no encontrado.', 404);
      return p;
    },
    farmacias(c, input) {
      const q = v.query(input);
      if (q.estado) v.choice(q.estado, ['ACTIVA', 'INACTIVA']);
      return page(
        'epsFarmacia',
        {
          eps_id: c.id,
          ...(q.estado ? { activa: q.estado === 'ACTIVA' } : {}),
          farmacia: { rol_id: 3, ...searchable(['nombre', 'apellido'], q.buscar) },
        },
        q,
        { include: { farmacia: { select: pharmacySelect } } },
      );
    },
    async vincular(c, input) {
      v.object(input, ['farmacia_id', 'activa', 'version']);
      const id = v.id(input.farmacia_id);
      if (typeof input.activa !== 'boolean') v.fail('Indica el estado de vinculacion.');
      return db.$transaction(
        async (tx) => {
          const f = await tx.usuario.findFirst({
            where: { id, rol_id: 3, estado: 'ACTIVO' },
            select: { id: true },
          });
          if (!f) v.fail('No se encontro una farmacia activa con ese identificador.', 404);
          const old = await tx.epsFarmacia.findUnique({
            where: { eps_id_farmacia_id: { eps_id: c.id, farmacia_id: id } },
          });
          let r;
          if (old) {
            const version = v.id(input.version);
            const change = await tx.epsFarmacia.updateMany({
              where: { id: old.id, eps_id: c.id, version },
              data: { activa: input.activa, version: { increment: 1 } },
            });
            if (change.count !== 1) v.fail('La vinculacion cambio. Actualiza la lista.', 409);
            r = await tx.epsFarmacia.findUnique({ where: { id: old.id } });
          } else {
            if (input.activa !== true) v.fail('La farmacia todavia no esta vinculada.');
            r = await tx.epsFarmacia.create({ data: { eps_id: c.id, farmacia_id: id } });
          }
          await event(tx, c, 'FARMACIA', r.id, 'Vinculacion de farmacia actualizada', {
            farmacia_id: id,
            activa: input.activa,
          });
          return r;
        },
        { isolationLevel: 'Serializable' },
      );
    },
    inventario(c, input) {
      const q = v.query(input);
      if (q.estado) v.choice(q.estado, ['AGOTADO', 'BAJO', 'DISPONIBLE']);
      const stock =
        q.estado === 'AGOTADO'
          ? { stock: 0 }
          : q.estado === 'BAJO'
            ? { stock: { gt: 0, lte: db.epsExistencia.fields.minimo } }
            : q.estado === 'DISPONIBLE'
              ? { stock: { gt: 0 } }
              : {};
      return page(
        'epsExistencia',
        {
          vinculo: {
            eps_id: c.id,
            activa: true,
            farmacia: { rol_id: 3, estado: 'ACTIVO' },
            ...(q.farmacia ? { farmacia_id: q.farmacia } : {}),
          },
          ...stock,
          medicamento: {
            ...searchable(['nombre', 'principio_activo', 'registro_sanitario'], q.buscar),
            ...(q.estado === 'DISPONIBLE' ? { estado: 'DISPONIBLE' } : {}),
          },
        },
        q,
        {
          select: {
            id: true,
            stock: true,
            minimo: true,
            actualizado_at: true,
            medicamento: {
              select: {
                id: true,
                nombre: true,
                principio_activo: true,
                concentracion: true,
                registro_sanitario: true,
              },
            },
            vinculo: {
              select: { farmacia: { select: { id: true, nombre: true, apellido: true } } },
            },
          },
        },
      );
    },
    autorizaciones(c, input) {
      const q = v.query(input);
      if (q.estado) v.choice(q.estado, ['PENDIENTE', 'APROBADA', 'RECHAZADA']);
      return page(
        'epsAutorizacion',
        {
          eps_id: c.id,
          afiliado: { eps_id: c.id },
          ...(q.estado ? { estado: q.estado } : {}),
          ...(q.paciente ? { afiliado_id: q.paciente } : {}),
          ...(q.buscar
            ? {
                OR: [
                  { concepto: { contains: q.buscar, mode: 'insensitive' } },
                  { afiliado: searchable(['documento', 'nombres', 'apellidos'], q.buscar) },
                ],
              }
            : {}),
        },
        q,
        {
          select: {
            ...authorizationSelect,
            afiliado: { select: { id: true, nombres: true, apellidos: true, documento: true } },
            farmacia_vinculo: { select: { activa: true, farmacia: { select: { nombre: true, apellido: true } } } },
          },
        },
      );
    },
    async crearAutorizacion(c, input) {
      v.object(input, ['afiliado_id', 'solicitud_id', 'concepto', 'motivo']);
      const afiliado_id = v.text(input.afiliado_id, 'Afiliado', 150),
        concepto = v.text(input.concepto, 'Concepto', 1000),
        motivo = v.text(input.motivo, 'Motivo', 1000);
      const solicitud_id = input.solicitud_id ? v.id(input.solicitud_id) : null;
      return db.$transaction(
        async (tx) => {
          const a = await affiliate(tx, c, afiliado_id, true);
          if (solicitud_id) {
            const s = await request(tx, c, solicitud_id);
            if (s.usuario_id !== a.usuario_id)
              v.fail('La solicitud no pertenece al afiliado.', 404);
          }
          const r = await tx.epsAutorizacion.create({
            select: authorizationSelect,
            data: {
              eps_id: c.id,
              afiliado_id,
              solicitud_id,
              concepto,
              motivo,
              responsable_id: c.actor,
            },
          });
          await event(tx, c, 'AUTORIZACION', r.id, 'Autorizacion creada', {
            estado: r.estado,
            motivo,
          });
          return r;
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async resolverAutorizacion(c, id, input) {
      id = v.id(id);
      v.object(input, ['estado', 'motivo', 'version']);
      const estado = v.choice(input.estado, ['APROBADA', 'RECHAZADA']),
        motivo = v.text(input.motivo, 'Motivo', 1000),
        version = v.id(input.version);
      return db.$transaction(
        async (tx) => {
          const a = await tx.epsAutorizacion.findFirst({
            select: authorizationSelect,
            where: {
              id,
              eps_id: c.id,
              afiliado: { eps_id: c.id, estado: { equals: 'ACTIVO', mode: 'insensitive' } },
            },
          });
          if (!a) v.fail('Autorizacion no encontrada o afiliacion inactiva.', 404);
          const r = await tx.epsAutorizacion.updateMany({
            where: { id, eps_id: c.id, estado: 'PENDIENTE', version },
            data: { estado, motivo, responsable_id: c.actor, version: { increment: 1 } },
          });
          if (r.count !== 1) v.fail('La autorizacion ya cambio. Actualiza la lista.', 409);
          await event(tx, c, 'AUTORIZACION', id, 'Autorizacion ' + estado.toLowerCase(), {
            anterior: 'PENDIENTE',
            estado,
            motivo,
          });
          return tx.epsAutorizacion.findFirst({
            select: authorizationSelect,
            where: { id, eps_id: c.id },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    },
    solicitudes(c, input) {
      const q = v.query(input);
      if (q.estado)
        v.choice(q.estado, [
          'PENDIENTE',
          'APROBADA',
          'PREPARANDO',
          'LISTA',
          'ENTREGADA',
          'CANCELADA',
        ]);
      return page(
        'solicitud',
        {
          ...requestScope(c),
          ...(q.estado ? { estado: q.estado } : {}),
          ...(q.paciente ? { usuario_id: v.id(q.paciente) } : {}),
          ...(q.buscar
            ? {
                usuario: {
                  ...patientScope(c),
                  ...searchable(['nombre', 'apellido', 'cedula'], q.buscar),
                },
              }
            : {}),
        },
        q,
        {
          select: {
            id: true,
            fecha: true,
            estado: true,
            usuario: { select: patientSelect },
            detalles: {
              select: { cantidad: true, medicamento: { select: { id: true, nombre: true } } },
            },
            seguimientos_eps: {
              where: { eps_id: c.id },
              select: {
                estado: true,
                motivo: true,
                version: true,
                updated_at: true,
                responsable_id: true,
              },
            },
          },
        },
      );
    },
    async seguimiento(c, id, input) {
      id = v.id(id);
      v.object(input, ['estado', 'motivo', 'version']);
      const estado = v.choice(input.estado, ['ABIERTA', 'EN_REVISION', 'RESUELTA', 'CERRADA']),
        motivo = v.text(input.motivo, 'Motivo', 1000);
      return db.$transaction(
        async (tx) => {
          await request(tx, c, id);
          const old = await tx.epsSeguimiento.findUnique({
            where: { eps_id_solicitud_id: { eps_id: c.id, solicitud_id: id } },
          });
          const allowed = {
            ABIERTA: ['EN_REVISION'],
            EN_REVISION: ['RESUELTA'],
            RESUELTA: ['EN_REVISION', 'CERRADA'],
            CERRADA: [],
          };
          if (!allowed[old?.estado || 'ABIERTA'].includes(estado))
            v.fail('Transicion de seguimiento no permitida.', 409);
          let r;
          if (old) {
            const version = v.id(input.version);
            const changed = await tx.epsSeguimiento.updateMany({
              where: { id: old.id, eps_id: c.id, version },
              data: { estado, motivo, responsable_id: c.actor, version: { increment: 1 } },
            });
            if (changed.count !== 1) v.fail('El seguimiento cambio. Recarga la solicitud.', 409);
            r = await tx.epsSeguimiento.findUnique({ where: { id: old.id } });
          } else {
            if (input.version !== undefined && input.version !== 0)
              v.fail('Version inicial invalida.');
            r = await tx.epsSeguimiento.create({
              data: { eps_id: c.id, solicitud_id: id, estado, motivo, responsable_id: c.actor },
            });
          }
          await event(tx, c, 'SOLICITUD', id, 'Seguimiento actualizado', {
            anterior: old?.estado || 'ABIERTA',
            estado,
            motivo,
          });
          return r;
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async historial(c, tipo, id, input = {}) {
      const q = v.query(input);
      v.choice(tipo, ['AUTORIZACION', 'SOLICITUD', 'AFILIADO']);
      if (tipo === 'AFILIADO') await affiliate(db, c, v.text(id, 'Afiliado', 150));
      else if (tipo === 'SOLICITUD') await request(db, c, v.id(id));
      else {
        const a = await db.epsAutorizacion.findFirst({
          select: authorizationSelect,
          where: { id: v.id(id), eps_id: c.id, afiliado: { eps_id: c.id } },
        });
        if (!a) v.fail('Autorizacion no encontrada.', 404);
      }
      return page('epsEvento', { eps_id: c.id, tipo, registro_id: String(id) }, q);
    },
    notificaciones(c, input) {
      const q = v.query(input);
      if (q.estado) v.choice(q.estado, ['PENDIENTE', 'LEIDA']);
      return page(
        'epsEvento',
        {
          eps_id: c.id,
          ...(q.estado
            ? {
                lecturas:
                  q.estado === 'LEIDA'
                    ? { some: { usuario_id: c.actor } }
                    : { none: { usuario_id: c.actor } },
              }
            : {}),
          ...(q.buscar ? { titulo: { contains: q.buscar, mode: 'insensitive' } } : {}),
        },
        q,
        {
          select: {
            id: true,
            tipo: true,
            registro_id: true,
            titulo: true,
            created_at: true,
            lecturas: { where: { usuario_id: c.actor }, select: { leida_at: true } },
          },
        },
      );
    },
    async leer(c, id) {
      id = v.id(id);
      return db.$transaction(async (tx) => {
        const e = await tx.epsEvento.findFirst({
          where: { id, eps_id: c.id },
          select: { id: true },
        });
        if (!e) v.fail('Notificacion no encontrada.', 404);
        await tx.epsLectura.upsert({
          where: { evento_id_usuario_id: { evento_id: id, usuario_id: c.actor } },
          create: { evento_id: id, usuario_id: c.actor },
          update: {},
        });
        return { id };
      });
    },
    perfil(c) {
      return db.epsEntidad.findUnique({
        where: { id: c.id },
        select: {
          id: true,
          nombre: true,
          nit: true,
          correo: true,
          telefono: true,
          direccion: true,
          ciudad: true,
          version: true,
        },
      });
    },
    async guardarPerfil(c, input) {
      const { version, ...data } = v.profile(input);
      return db.$transaction(
        async (tx) => {
          const changed = await tx.epsEntidad.updateMany({
            where: { id: c.id, version },
            data: { ...data, version: { increment: 1 } },
          });
          if (changed.count !== 1) v.fail('El perfil cambio. Recarga antes de guardar.', 409);
          await event(tx, c, 'PERFIL', c.id, 'Perfil EPS actualizado', {
            campos: Object.keys(data),
          });
          return tx.epsEntidad.findUnique({ where: { id: c.id } });
        },
        { isolationLevel: 'Serializable' },
      );
    },
    async logout(c) {
      await db.epsAcceso.update({
        where: { usuario_id: c.actor },
        data: { revocado_at: new Date() },
      });
      return { cerrada: true };
    },
  };
}
module.exports = { createService };
