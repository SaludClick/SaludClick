const { audit } = require('./auditar-catalogo-produccion.cjs');

audit().then(({ conexion, resumen, duplicados, huella }) => {
  const cumple1000 = resumen.loteInvimaNeon === 1000 && resumen.filas.coincide_codigo === 1000 && !duplicados.codigoNeon.length;
  console.log(JSON.stringify({
    conexion, totalTabla: resumen.neon, totalLoteInvima: resumen.loteInvimaNeon,
    esperadosCsv: resumen.csv, coincidenciasCsv: resumen.filas.coincide_codigo || 0,
    soloCsv: resumen.filas.solo_csv || 0, cumple1000, huella,
  }, null, 2));
  if (!cumple1000) process.exitCode = 1;
}).catch(error => {
  console.error('Verificacion no completada (' + (error.code || error.name) + ').');
  process.exitCode = 1;
});
