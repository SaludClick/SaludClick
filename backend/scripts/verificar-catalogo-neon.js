require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const prisma = require('../src/config/prisma');
async function main() {
  const filter = { codigo_fuente: { startsWith: 'INVIMA-CUM-' } };
  const [total, activos, stockPositivo, preciosCero, conImagen, conReferencia, duplicados] = await Promise.all([
    prisma.medicamento.count({where:filter}),
    prisma.medicamento.count({where:{...filter,estado:'DISPONIBLE'}}),
    prisma.medicamento.count({where:{...filter,stock:{gt:0}}}),
    prisma.medicamento.count({where:{...filter,precio:0}}),
    prisma.imagenMedicamento.count({where:{medicamento:filter}}),
    prisma.medicamento.count({where:{...filter,precio_referencial:{not:null}}}),
    prisma.$queryRaw`SELECT codigo_fuente, COUNT(*)::int AS cantidad FROM medicamentos WHERE codigo_fuente LIKE 'INVIMA-CUM-%' GROUP BY codigo_fuente HAVING COUNT(*) > 1`
  ]);
  const report = { total, activos, stockPositivo, preciosCero, imagenesRegistradas:conImagen, conPrecioReferencial:conReferencia, duplicados:duplicados.length, cumple1000:total===1000 };
  console.log(JSON.stringify(report,null,2));
  if (total !== 1000 || duplicados.length) process.exitCode = 1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
