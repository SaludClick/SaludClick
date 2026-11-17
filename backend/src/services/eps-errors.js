// EPS-only diagnostics: never return connection strings, SQL or driver messages.
function databaseFailure(error) {
  const codes = [error.code, error.meta?.code, error.cause?.code];
  const has = (values) => codes.some((code) => values.includes(code));
  if (has(['EPS_PRISMA_CLIENT_PENDING']))
    return {
      status: 503,
      codigo: 'EPS_PRISMA_CLIENT_PENDING',
      mensaje:
        'El backend usa un cliente Prisma sin los modelos EPS. Regenera el cliente y reinicia el backend.',
    };
  if (has(['P2021', 'P2022', '42P01', '42703']))
    return {
      status: 503,
      codigo: 'EPS_SCHEMA_PENDING',
      mensaje:
        'La base principal todavia no tiene el esquema EPS requerido. Su migracion necesita autorizacion antes de aplicarse.',
    };
  if (has(['P1000', 'P1010', '28P01', '28000', '42501']))
    return {
      status: 503,
      codigo: 'EPS_DATABASE_PERMISSION',
      mensaje:
        'La conexion del backend no tiene acceso suficiente a la base EPS. Revisa sus permisos privados; no cambies credenciales desde el panel.',
    };
  if (
    has([
      'P1001',
      'P1002',
      'P1017',
      'P2024',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNRESET',
      'EAI_AGAIN',
      '53300',
      '57P03',
    ])
  )
    return {
      status: 503,
      codigo: 'EPS_DATABASE_UNAVAILABLE',
      mensaje:
        'La base de datos EPS no esta disponible temporalmente. Verifica la conexion del backend y vuelve a intentar.',
    };
  return {
    status: 500,
    codigo: 'EPS_OPERATION_FAILED',
    mensaje: 'No se pudo completar la operacion EPS. Revisa el diagnostico del backend.',
  };
}
function safeDiagnostic(error, phase) {
  const safe = (v) =>
    typeof v === 'string' && /^[A-Za-z0-9_]+$/.test(v) ? v.slice(0, 64) : undefined;
  return {
    phase,
    code: safe(error.code),
    name: safe(error.name),
    databaseCode: safe(error.meta?.code),
  };
}
module.exports = { databaseFailure, safeDiagnostic };
