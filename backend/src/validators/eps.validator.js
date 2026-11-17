const fail = (mensaje, status = 400) => {
  throw Object.assign(new Error(mensaje), { status });
};
function object(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    fail('Campos no permitidos.');
  return value;
}
function text(value, label, max = 150, required = true) {
  if (
    typeof value !== 'string' ||
    value.trim().length > max ||
    /[\u0000-\u001f]/u.test(value) ||
    (required && !value.trim())
  )
    fail(label + ' invalido.');
  return value.trim();
}
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    fail('Identificador invalido.');
  return Number(value);
}
function choice(value, values) {
  if (!values.includes(value)) fail('Estado o filtro invalido.');
  return value;
}
function query(q = {}) {
  object(q, ['pagina', 'buscar', 'estado', 'farmacia', 'paciente']);
  return {
    pagina: q.pagina === undefined ? 1 : id(q.pagina),
    buscar: q.buscar === undefined ? '' : text(q.buscar, 'Busqueda', 100, false),
    estado: q.estado === undefined ? '' : text(q.estado, 'Estado', 30, false),
    farmacia: q.farmacia === undefined ? undefined : id(q.farmacia),
    paciente: q.paciente === undefined ? undefined : text(q.paciente, 'Paciente', 150),
  };
}
function afiliado(b, create = false) {
  object(
    b,
    create
      ? [
          'nombres',
          'apellidos',
          'tipo_documento',
          'documento',
          'fecha_nacimiento',
          'telefono',
          'correo',
          'direccion',
          'ciudad',
          'regimen',
          'estado',
        ]
      : [
          'nombres',
          'apellidos',
          'fecha_nacimiento',
          'telefono',
          'correo',
          'direccion',
          'ciudad',
          'regimen',
          'estado',
          'version',
        ],
  );
  const data = {};
  const limits = {
    nombres: 100,
    apellidos: 100,
    tipo_documento: 10,
    documento: 30,
    fecha_nacimiento: 10,
    telefono: 20,
    correo: 150,
    direccion: 255,
    ciudad: 100,
    regimen: 30,
    estado: 20,
  };
  for (const [key, max] of Object.entries(limits)) {
    if (create || Object.hasOwn(b, key))
      data[key] = text(b[key], key, max, !['telefono', 'direccion'].includes(key));
  }
  if (!Object.keys(data).length) fail('No hay cambios.');
  if (data.tipo_documento)
    choice(data.tipo_documento, ['CC', 'TI', 'CE', 'RC', 'PA', 'PEP', 'PPT']);
  if (data.estado)
    choice(data.estado.toUpperCase(), ['ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'RETIRADO']);
  if (data.regimen) choice(data.regimen.toUpperCase(), ['CONTRIBUTIVO', 'SUBSIDIADO', 'ESPECIAL']);
  if (data.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)) fail('Correo invalido.');
  if (data.documento && !/^[A-Za-z0-9-]{3,30}$/.test(data.documento)) fail('Documento invalido.');
  if (data.fecha_nacimiento) {
    const d = new Date(data.fecha_nacimiento + 'T00:00:00Z');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_nacimiento) ||
      isNaN(d.getTime()) ||
      d.toISOString().slice(0, 10) !== data.fecha_nacimiento ||
      d > new Date() ||
      d.getUTCFullYear() < 1900
    )
      fail('Fecha de nacimiento invalida.');
  }
  return data;
}
function profile(b) {
  object(b, ['nombre', 'correo', 'telefono', 'direccion', 'ciudad', 'version']);
  const data = {};
  for (const [key, max] of Object.entries({
    nombre: 150,
    correo: 150,
    telefono: 20,
    direccion: 255,
    ciudad: 100,
  }))
    data[key] = text(b[key], key, max, ['nombre', 'ciudad'].includes(key));
  if (data.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)) fail('Correo invalido.');
  return { ...data, version: id(b.version) };
}
module.exports = { fail, object, text, id, choice, query, afiliado, profile };
