// Ejecutar en una terminal local propia. Nunca acepta contraseñas por argumentos o archivos.
const { obtenerCuentasAutorizadas } = require('../src/config/authorized-accounts');

function validarPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('La contraseña debe tener al menos 12 caracteres y máximo 72 bytes.');
  }
}

async function revisarCuentas(prisma, { soloLectura = false } = {}) {
  const AUTORIZADAS = obtenerCuentasAutorizadas();
  const cuentas = await prisma.usuario.findMany({
    where: { correo: { in: AUTORIZADAS.map(c => c.correo), mode: 'insensitive' } },
    select: { id: true, correo: true, rol_id: true, estado: true, ...(!soloLectura && { password: true }) }
  });
  if (cuentas.length !== 2) throw new Error('Deben existir exactamente las dos cuentas autorizadas.');
  return AUTORIZADAS.map(esperada => {
    const cuenta = cuentas.find(c => c.correo === esperada.correo);
    const estadosPermitidos = soloLectura ? ['ACTIVO', 'INACTIVO'] : ['INACTIVO'];
    if (!cuenta || cuenta.rol_id !== esperada.rol_id || !estadosPermitidos.includes(cuenta.estado)) {
      throw new Error('Correo, rol o estado inesperado. No se modificará ninguna cuenta.');
    }
    return cuenta;
  });
}

async function activarCuentas({ prisma, bcrypt, cuentas, passwords }) {
  const AUTORIZADAS = obtenerCuentasAutorizadas();
  if (!Array.isArray(passwords) || passwords.length !== 2 || !Array.isArray(cuentas) || cuentas.length !== 2) throw new Error('Datos incompletos.');
  const hashes = [];
  for (let i = 0; i < 2; i++) {
    if (cuentas[i].correo !== AUTORIZADAS[i].correo || cuentas[i].rol_id !== AUTORIZADAS[i].rol_id || cuentas[i].estado !== 'INACTIVO') throw new Error('Cuenta fuera del alcance autorizado.');
    validarPassword(passwords[i]);
    hashes.push(await bcrypt.hash(passwords[i], 10));
  }
  return prisma.$transaction(async tx => {
    for (let i = 0; i < 2; i++) {
      const cuenta = cuentas[i];
      // Incluye el estado y hash leídos: aborta si otra solicitud cambió la cuenta.
      const guardado = await tx.usuario.updateMany({
        where: { id: cuenta.id, correo: cuenta.correo, rol_id: cuenta.rol_id, estado: 'INACTIVO', password: cuenta.password },
        data: { password: hashes[i] }
      });
      if (guardado.count !== 1) throw new Error('La cuenta cambió durante la operación.');
      const almacenada = await tx.usuario.findUnique({ where: { id: cuenta.id }, select: { password: true } });
      if (!almacenada || !await bcrypt.compare(passwords[i], almacenada.password)) throw new Error('No se pudo verificar la contraseña guardada.');
      await tx.usuario.update({ where: { id: cuenta.id }, data: { estado: 'ACTIVO' }, select: { id: true } });
      await tx.tokenRecuperacion.deleteMany({ where: { usuario_id: cuenta.id } });
    }
    return AUTORIZADAS.map(c => ({ ...c, estado: 'ACTIVO', hashCompatible: true }));
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}

function preguntarOculto(texto, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('Se requiere una terminal interactiva local; no se admite entrada redirigida.'));
  }
  return new Promise((resolve, reject) => {
    let valor = '';
    const rawAnterior = Boolean(input.isRaw);
    output.write(texto);
    input.setRawMode(true);
    input.setEncoding('utf8');
    function terminar() {
      input.removeListener('data', recibir);
      input.removeListener('end', cerrar);
      input.removeListener('error', cerrar);
      input.setRawMode(rawAnterior);
      input.pause();
      output.write('\n');
    }
    function cerrar() { valor = ''; terminar(); reject(new Error('Entrada cancelada.')); }
    function recibir(datos) {
      for (const letra of datos) {
        if (letra === '\u0003' || letra === '\u0004' || letra === '\u001b') { cerrar(); return; }
        if (letra === '\r' || letra === '\n') { terminar(); resolve(valor); valor = ''; return; }
        if (letra === '\b' || letra === '\u007f') valor = Array.from(valor).slice(0, -1).join('');
        else if (letra >= ' ') valor += letra;
      }
    }
    input.on('data', recibir);
    input.once('end', cerrar);
    input.once('error', cerrar);
    input.resume();
  });
}

async function main() {
  const modo = process.argv[2];
  if (!['--check', '--apply'].includes(modo) || process.argv.length !== 3) {
    console.error('Uso: node scripts/activar-cuentas-administrativamente.cjs --check | --apply');
    process.exitCode = 1;
    return;
  }
  if (modo === '--apply' && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    console.error('Abre una terminal local interactiva. No introduzcas contraseñas en el chat.');
    process.exitCode = 1;
    return;
  }
  const prisma = require('../src/config/prisma');
  const pool = require('../src/config/database');
  let passwords = [];
  let confirmadas = false;
  try {
    const cuentas = await revisarCuentas(prisma, { soloLectura: modo === '--check' });
    console.log(JSON.stringify(cuentas.map(({ correo, rol_id, estado }) => ({ correo, rol_id, estado }))));
    if (modo === '--check') {
      console.log(JSON.stringify({ ambasActivas: cuentas.every(c => c.estado === 'ACTIVO'), soloLectura: true }));
      return;
    }
    console.log('Solo se activarán estas dos cuentas. No se certificará la titularidad del correo.');
    const respuesta = await preguntarOculto('Escribe ACTIVAR para autorizar esta transacción (entrada oculta): ');
    if (respuesta !== 'ACTIVAR') throw new Error('Operación no confirmada.');
    for (const cuenta of cuentas) {
      let password = await preguntarOculto(`Contraseña para ${cuenta.correo} (oculta): `);
      validarPassword(password);
      let repetida = await preguntarOculto('Repite la contraseña (oculta): ');
      if (password !== repetida) throw new Error('Las contraseñas no coinciden.');
      passwords.push(password);
      password = repetida = '';
    }
    const bcrypt = require('bcrypt');
    const resultado = await activarCuentas({ prisma, bcrypt, cuentas, passwords });
    confirmadas = true;
    // Ejecuta el servicio de login real sin imprimir el JWT ni credenciales.
    const auth = require('../src/services/auth.service');
    for (let i = 0; i < cuentas.length; i++) {
      const acceso = await auth.login({ correo: cuentas[i].correo, password: passwords[i] });
      if (acceso.usuario.rol !== cuentas[i].rol_id || !acceso.ok) throw new Error('Login no confirmado.');
    }
    console.log(JSON.stringify(resultado.map(c => ({ ...c, loginVerificado: true, verificacionCorreo: 'NO_CERTIFICADA' }))));
  } catch (error) {
    const mensajesSeguros = new Set([
      'Operación no confirmada.',
      'Entrada cancelada.',
      'La contraseña debe tener al menos 12 caracteres y máximo 72 bytes.',
      'Las contraseñas no coinciden.',
      'La cuenta cambió durante la operación.',
      'Correo, rol o estado inesperado. No se modificará ninguna cuenta.',
      'Se requiere una terminal interactiva local; no se admite entrada redirigida.'
    ]);
    if (mensajesSeguros.has(error.message)) console.error(error.message);
    else console.error('Fallo técnico en la operación. No se muestran detalles que puedan contener credenciales.');
    console.error(confirmadas
      ? 'La transacción se confirmó, pero la comprobación posterior de login falló. Revisa el estado antes de reintentar.'
      : 'Operación cancelada o fallida: no se confirmó ningún cambio. Revisa cuentas, conexión y entradas.');
    process.exitCode = 1;
  } finally {
    passwords.fill(''); passwords = [];
    await prisma.$disconnect(); await pool.end();
  }
}

module.exports = { obtenerCuentasAutorizadas, revisarCuentas, activarCuentas, preguntarOculto, validarPassword };
if (require.main === module) main().catch(() => { console.error('No se pudo iniciar la operación.'); process.exitCode = 1; });
