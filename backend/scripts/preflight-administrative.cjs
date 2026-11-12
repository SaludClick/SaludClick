// Read-only comparison. Never runs migrations, creates accounts or prints connection URLs.
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const fs=require('node:fs');
const path=require('node:path');
const expected={administrative_cases:['id','cliente_id','responsable_id','tipo','estado','created_at','resuelta_at'],administrative_messages:['id','caso_id','remitente_id','contenido','leido_at'],administrative_notifications:['id','destinatario_id','caso_id','leida_at'],administrative_audit:['id','actor_id','accion','resultado'],administrative_settings:['clave','valor'],administrative_preferences:['usuario_id','notificaciones','compacto','sesiones_revocadas_at']};
async function main(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_NOT_CONFIGURED');
  const url=new URL(process.env.DATABASE_URL);
  if(['prefer','require','verify-ca'].includes(url.searchParams.get('sslmode')))url.searchParams.set('sslmode','verify-full');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:10000});
  try{
    await db.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='10000'");
    const columns=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (table_name LIKE 'administrative_%' OR table_name IN ('usuarios','roles','_prisma_migrations'))")).rows;
    const missing=Object.entries(expected).flatMap(([table,fields])=>fields.filter(field=>!columns.some(c=>c.table_name===table&&c.column_name===field)).map(field=>`${table}.${field}`));
    const roles=(await db.query('SELECT id,nombre FROM roles ORDER BY id')).rows;
    const statuses=(await db.query('SELECT rol_id,estado,count(*)::int total FROM usuarios GROUP BY rol_id,estado ORDER BY rol_id')).rows;
    const migrations=columns.some(c=>c.table_name==='_prisma_migrations')?(await db.query('SELECT migration_name,finished_at IS NOT NULL AS aplicada,rolled_back_at IS NOT NULL AS revertida FROM _prisma_migrations ORDER BY started_at')).rows:[];
    const files=fs.readdirSync(path.join(__dirname,'../prisma/migrations'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
    const duplicates=(await db.query('SELECT count(*)::int total FROM (SELECT lower(correo) FROM usuarios GROUP BY lower(correo) HAVING count(*)>1) d')).rows[0].total;
    await db.query('ROLLBACK');
    console.log(JSON.stringify({soloLectura:true,compatible:!missing.length,faltantes:missing,roles,cuentasPorEstado:statuses,gruposCorreoDuplicado:duplicates,migracionesRegistradas:migrations,migracionesEnRepositorio:files},null,2));
  }finally{await db.end();}
}
main().catch(error=>{console.error(JSON.stringify({soloLectura:true,errorCodigo:error.code||error.name,estado:'NO_VERIFICADO'}));process.exitCode=1;});
