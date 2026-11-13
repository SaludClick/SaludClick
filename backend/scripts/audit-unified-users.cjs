// Read-only inventory. Never prints people, passwords, tokens or connection URLs.
require('dotenv').config({quiet:true});
const {createHash}=require('node:crypto');
async function main(){
  const prisma=require('../src/config/prisma');
  const pool=require('../src/config/database');
  const eps=require('../src/config/eps-prisma');
  try{
    const local=await prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [identity]=await tx.$queryRawUnsafe('SELECT current_database() AS base,current_schema() AS esquema');
      const accounts=await tx.$queryRawUnsafe('SELECT id,nombre,apellido,correo,cedula,tipo_documento,rol_id,estado,created_at FROM usuarios ORDER BY id');
      const columns=await tx.$queryRawUnsafe("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('usuarios','afiliados','pacientes_autorizados') ORDER BY table_name,ordinal_position");
      const relations=await tx.$queryRawUnsafe("SELECT r.relname AS tabla,pg_get_constraintdef(c.oid) AS relacion FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE c.contype='f' AND n.nspname='public' AND r.relname IN ('usuarios','afiliados','pacientes_autorizados')");
      const [fingerprint]=await tx.$queryRawUnsafe("SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY id)::text,'[]')) AS huella FROM usuarios u");
      return {identity,accounts,columns,relations,fingerprint};
    },{isolationLevel:'RepeatableRead',timeout:20000});
    const source=await require('../src/repositories/afiliados-origen.repository').leer();
    const sourceSchema=await eps.obtenerConexionEPS().prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const columns=await tx.$queryRawUnsafe("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ('afiliados','eps') ORDER BY table_name,ordinal_position",source.conexion.esquema);
      const relations=await tx.$queryRawUnsafe("SELECT r.relname AS tabla,pg_get_constraintdef(c.oid) AS relacion FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE c.contype='f' AND n.nspname=$1 AND r.relname IN ('afiliados','eps')",source.conexion.esquema);
      return {columns,relations};
    },{isolationLevel:'RepeatableRead',timeout:20000});
    const doc=value=>String(value??'').normalize('NFC').trim();
    const matches=source.afiliados.flatMap(a=>local.accounts.filter(u=>doc(u.cedula)&&doc(u.cedula)===doc(a.documento)).map(u=>({typeMatches:!u.tipo_documento||!a.tipo_documento||doc(u.tipo_documento).toUpperCase()===doc(a.tipo_documento).toUpperCase()})));
    const emailMatches=source.afiliados.filter(a=>a.correo&&local.accounts.some(u=>u.correo&&u.correo.trim().toLowerCase()===a.correo.trim().toLowerCase())).length;
    console.log(JSON.stringify({soloLectura:true,local:{...local.identity,tabla:'usuarios',cuentas:local.accounts.length,activas:local.accounts.filter(u=>u.estado==='ACTIVO').length,columnas:local.columns,relaciones:local.relations,huella:local.fingerprint.huella},eps:{...source.conexion,registros:source.afiliados.length,campos:require('../src/services/afiliados-import.service').CAMPOS,columnas:sourceSchema.columns,relaciones:sourceSchema.relations,huella:createHash('sha256').update(JSON.stringify(source.afiliados)).digest('hex')},coincidenciasDocumento:matches.length,coincidenciasDocumentoTipoCompatible:matches.filter(m=>m.typeMatches).length,coincidenciasCorreo:emailMatches,datosModificados:false},null,2));
  }finally{await eps.cerrarConexionEPS();await prisma.$disconnect();await pool.end();}
}
main().catch(error=>{console.error(JSON.stringify({estado:'AUDITORIA_NO_COMPLETADA',codigo:error.code||error.codigo||error.name}));process.exitCode=1;});
