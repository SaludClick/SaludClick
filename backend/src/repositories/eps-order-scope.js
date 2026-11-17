function orderScope(farmaciaId, assignmentReady = true) {
  if (farmaciaId === undefined) return {};
  if (!assignmentReady) return { usuario: { afiliado: { is: null } } };
  return {
    OR: [
      { usuario: { afiliado: { is: null } } },
      {
        autorizaciones_eps: {
          some: {
            estado: 'APROBADA',
            farmacia_vinculo: { farmacia_id: farmaciaId, activa: true, eps: { activa: true } },
          },
        },
      },
    ],
  };
}
async function assignmentReady(db) {
  if (typeof db.$queryRawUnsafe !== 'function') return false;
  const rows = await db.$queryRawUnsafe(
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='eps_autorizaciones' AND column_name='farmacia_vinculo_id') AS ready",
  );
  return rows[0]?.ready === true;
}
module.exports = { orderScope, assignmentReady };
