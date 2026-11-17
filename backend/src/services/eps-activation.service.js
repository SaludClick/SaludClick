// Controlled EPS setup/import. Source reads only; no account or role creation.
const { createHash } = require('node:crypto');
const { CAMPOS } = require('./afiliados-import.service');
const v = require('../validators/eps.validator');
const tables = [
  'eps_entidades',
  'eps_accesos',
  'eps_farmacias',
  'eps_existencias',
  'eps_autorizaciones',
  'eps_seguimientos',
  'eps_eventos',
  'eps_lecturas',
  'afiliados',
];
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stop = (code) => {
  throw Object.assign(new Error(code), { code });
};
function parameters(input) {
  v.object(input, ['epsId', 'accountId', 'metadata']);
  const epsId = v.text(input.epsId, 'EPS', 80),
    accountId = v.id(input.accountId),
    metadata = input.metadata || {};
  v.object(metadata, ['nit', 'correo', 'telefono', 'direccion']);
  const clean = {};
  for (const [key, max] of Object.entries({ nit: 30, correo: 150, telefono: 20, direccion: 255 }))
    clean[key] = metadata[key] === undefined ? '' : v.text(metadata[key], key, max, false);
  if (clean.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.correo))
    v.fail('Correo EPS invalido.');
  return { epsId, accountId, metadata: clean };
}
function snapshotFor(input, epsId) {
  if (
    !input?.entidad ||
    String(input.entidad.id) !== epsId ||
    !['ACTIVA', 'ACTIVO'].includes(String(input.entidad.estado).toUpperCase())
  )
    stop('EPS_SOURCE_ENTITY_NOT_ACTIVE');
  const entity = {
    id: epsId,
    nombre: v.text(input.entidad.nombre, 'EPS', 150),
    ciudad: v.text(input.entidad.ciudad, 'Ciudad', 100),
  };
  if (!Array.isArray(input.afiliados) || input.afiliados.length > 10000) stop('EPS_SOURCE_INVALID');
  const ids = new Set(),
    docs = new Set();
  const afiliados = input.afiliados
    .map((row) => {
      if (
        CAMPOS.some((c) => typeof row[c] !== 'string') ||
        row.eps_id !== epsId ||
        ids.has(row.id) ||
        docs.has(row.documento)
      )
        stop('EPS_SOURCE_INVALID');
      v.text(row.id, 'Afiliado', 150);
      const original = Object.fromEntries(CAMPOS.map((c) => [c, row[c]]));
      // Validate compatibility without rewriting the original 13 source fields.
      v.afiliado(
        Object.fromEntries(
          CAMPOS.filter((c) => !['id', 'eps_id'].includes(c)).map((c) => [c, row[c]]),
        ),
        true,
      );
      ids.add(row.id);
      docs.add(row.documento);
      return original;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return { entity, afiliados, sourceHash: digest({ entity, afiliados }) };
}
function sameIdentity(a, u) {
  return (
    u?.rol_id === 2 &&
    u.estado === 'ACTIVO' &&
    u.cedula === a.documento &&
    u.nombre === a.nombres &&
    u.apellido === a.apellidos &&
    u.tipo_documento === a.tipo_documento &&
    u.correo === a.correo
  );
}
function createActivationService({ db, readSource }) {
  async function facts(tx, p, source) {
    const present = (
      await tx.$queryRawUnsafe(
        'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
        tables,
      )
    ).map((r) => r.table_name);
    const ready = tables.every((t) => present.includes(t));
    const account = await tx.usuario.findUnique({
      where: { id: p.accountId },
      select: { id: true, rol_id: true, estado: true },
    });
    if (!account || account.rol_id !== 4 || account.estado !== 'ACTIVO')
      stop('EPS_ACCOUNT_NOT_ACTIVE');
    const entity = ready ? await tx.epsEntidad.findUnique({ where: { id: p.epsId } }) : null;
    if (
      entity &&
      (!entity.activa ||
        entity.nombre !== source.entity.nombre ||
        entity.ciudad !== source.entity.ciudad)
    )
      stop('EPS_ENTITY_CONFLICT');
    const member = ready
      ? await tx.epsAcceso.findUnique({ where: { usuario_id: p.accountId } })
      : null;
    if (member && (member.eps_id !== p.epsId || !member.activo)) stop('EPS_MEMBERSHIP_CONFLICT');
    const docs = source.afiliados.map((a) => a.documento);
    const users = await tx.usuario.findMany({
      where: { cedula: { in: docs } },
      orderBy: { id: 'asc' },
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
    const authorizationTable = (
      await tx.$queryRawUnsafe("SELECT to_regclass('public.pacientes_autorizados')::text AS name")
    )[0]?.name;
    const authorized = authorizationTable
      ? await tx.pacienteAutorizado.findMany({
          where: { cedula: { in: docs }, estado: 'AUTORIZADO' },
          orderBy: { id: 'asc' },
          select: { cedula: true, nombres: true, apellidos: true, tipo_documento: true },
        })
      : [];
    const existing = present.includes('afiliados')
      ? await tx.afiliado.findMany({
          orderBy: { id: 'asc' },
          where: {
            OR: [
              { id: { in: source.afiliados.map((a) => a.id) } },
              { documento: { in: docs } },
              { usuario_id: { in: users.map((u) => u.id) } },
            ],
          },
        })
      : [];
    const additions = [],
      links = [];
    let unlinked = 0;
    for (const a of source.afiliados) {
      const matching = existing.filter((row) => row.id === a.id || row.documento === a.documento);
      if (matching.length > 1 || matching.some((row) => CAMPOS.some((c) => row[c] !== a[c])))
        stop('EPS_AFFILIATE_CONFLICT');
      const current = matching[0],
        user = users.find((u) => u.cedula === a.documento),
        allowed = authorized.find((r) => r.cedula === a.documento);
      const verified =
        sameIdentity(a, user) &&
        allowed &&
        allowed.nombres === a.nombres &&
        allowed.apellidos === a.apellidos &&
        allowed.tipo_documento === a.tipo_documento;
      if (verified) {
        const owner = existing.find((row) => row.usuario_id === user.id);
        if (owner && owner.id !== a.id) stop('EPS_PATIENT_LINK_CONFLICT');
        if (current?.usuario_id && current.usuario_id !== user.id)
          stop('EPS_PATIENT_LINK_CONFLICT');
      }
      if (!current) additions.push({ ...a, ...(verified ? { usuario_id: user.id } : {}) });
      if (verified && !current?.usuario_id)
        links.push({ afiliado_id: a.id, usuario_id: user.id, new: !current });
      if (!verified && !current?.usuario_id) unlinked++;
    }
    const profilePatch = {};
    if (entity)
      for (const [key, value] of Object.entries(p.metadata)) {
        if (!value) continue;
        if (entity[key] && entity[key] !== value) stop('EPS_PROFILE_CONFLICT');
        if (!entity[key]) profilePatch[key] = value;
      }
    const profile = entity ? { ...entity, ...profilePatch } : { ...source.entity, ...p.metadata };
    const planHash = digest({
      parameters: p,
      sourceHash: source.sourceHash,
      ready,
      account,
      entity,
      member,
      existing,
      users,
      authorized,
      additions,
      links,
    });
    return { planHash, ready, account, entity, member, profile, profilePatch, additions, links, unlinked };
  }
  function summary(p, source, f) {
    return {
      mode: 'READ_ONLY_PLAN',
      epsId: p.epsId,
      epsNombre: source.entity.nombre,
      accountId: p.accountId,
      schemaReady: f.ready,
      sourceAffiliates: source.afiliados.length,
      newAffiliates: f.additions.length,
      verifiedPatientLinks: f.links.length,
      unlinkedAffiliates: f.unlinked,
      createEntity: !f.entity,
      createMembership: !f.member,
      updateEntityFields: Object.keys(f.profilePatch),
      missingEntityFields: ['nit', 'correo', 'telefono', 'direccion'].filter((k) => !f.profile[k]),
      planHash: f.planHash,
      sourceHash: source.sourceHash,
      sourceWrites: 0,
    };
  }
  return {
    async plan(input) {
      const p = parameters(input),
        source = snapshotFor(await readSource(p.epsId), p.epsId);
      return db.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          return summary(p, source, await facts(tx, p, source));
        },
        { isolationLevel: 'RepeatableRead', timeout: 30000 },
      );
    },
    async apply(input, expectedPlan) {
      const p = parameters(input);
      if (!/^[a-f0-9]{64}$/.test(expectedPlan || '')) stop('EPS_ACTIVATION_APPROVAL_REQUIRED');
      const source = snapshotFor(await readSource(p.epsId), p.epsId);
      return db.$transaction(
        async (tx) => {
          const f = await facts(tx, p, source);
          if (!f.ready) stop('EPS_SCHEMA_PENDING');
          if (f.planHash !== expectedPlan) stop('EPS_ACTIVATION_PLAN_CHANGED');
          if (!f.entity) await tx.epsEntidad.create({ data: f.profile });
          else if (Object.keys(f.profilePatch).length) {
            const changed = await tx.epsEntidad.updateMany({
              where: { id: p.epsId, version: f.entity.version },
              data: { ...f.profilePatch, version: { increment: 1 } },
            });
            if (changed.count !== 1) stop('EPS_ENTITY_CHANGED');
          }
          if (!f.member)
            await tx.epsAcceso.create({ data: { usuario_id: p.accountId, eps_id: p.epsId } });
          for (const a of f.additions) {
            const linked = Boolean(a.usuario_id);
            await tx.afiliado.create({
              data: {
                ...a,
                ...(linked ? { verificado_por: p.accountId, verificado_at: new Date() } : {}),
              },
            });
          }
          for (const link of f.links.filter((l) => !l.new)) {
            const changed = await tx.afiliado.updateMany({
              where: { id: link.afiliado_id, eps_id: p.epsId, usuario_id: null },
              data: {
                usuario_id: link.usuario_id,
                verificado_por: p.accountId,
                verificado_at: new Date(),
                eps_version: { increment: 1 },
              },
            });
            if (changed.count !== 1) stop('EPS_PATIENT_LINK_CHANGED');
          }
          if (
            !f.entity ||
            !f.member ||
            f.additions.length ||
            f.links.length ||
            Object.keys(f.profilePatch).length
          )
            await tx.epsEvento.create({
              data: {
                eps_id: p.epsId,
                actor_id: p.accountId,
                tipo: 'ACTIVACION',
                registro_id: p.epsId,
                titulo: 'Configuracion EPS y afiliados verificados',
                detalle: {
                  afiliados: f.additions.length,
                  vinculaciones: f.links.length,
                  sourceHash: source.sourceHash,
                  camposEPS: Object.keys(f.profilePatch),
                },
              },
            });
          return { ...summary(p, source, f), mode: 'APPLIED', sourceWrites: 0 };
        },
        { isolationLevel: 'Serializable', timeout: 120000 },
      );
    },
  };
}
module.exports = { createActivationService, snapshotFor, sameIdentity, parameters };
