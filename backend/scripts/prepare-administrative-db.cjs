// Apply only the two existing migrations needed by the seven admin modules.
// Default is a read-only plan; --apply is explicit. Never changes account state.
require('dotenv').config({quiet:true});
const {Client}=require('pg');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const migrations=[
  {name:'20261110230500_create_pacientes_autorizados',tables:['pacientes_autorizados','auditorias_pacientes_autorizados']},
  {name:'20261112120000_administrative_workspace',tables:['administrative_cases','administrative_messages','administrative_notifications','administrative_audit','administrative_settings','administrative_preferences']}
];
async function prepare(db,apply=false){
  await db.query(apply?'BEGIN':'BEGIN READ ONLY');
  try{
    await db.query("SET LOCAL statement_timeout='30000'");
    if(apply)await db.query('SELECT pg_advisory_xact_lock(72411013)');
    const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename);
    if(!tables.includes('_prisma_migrations')||!tables.includes('usuarios'))throw new Error('BASE_SCHEMA_REQUIRED');
    const registered=(await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations')).rows;
    const plan=[];
    for(const m of migrations){
      const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations',m.name,'migration.sql'),'utf8');
      const checksum=createHash('sha256').update(sql).digest('hex');
      const existing=m.tables.filter(t=>tables.includes(t));
      const records=registered.filter(r=>r.migration_name===m.name&&!r.rolled_back_at);
      if(existing.length===m.tables.length){
        // Existing tables are never recreated or silently baselined.
        if(records.some(r=>!r.finished_at||r.checksum!==checksum))throw new Error('MIGRATION_HISTORY_MISMATCH');
        plan.push({migracion:m.name,accion:'CONSERVAR_EXISTENTE'});continue;
      }
      if(existing.length||records.length)throw new Error('PARTIAL_SCHEMA_REQUIRES_REVIEW');
      if(m.name.endsWith('administrative_workspace')){
        const duplicates=await db.query('SELECT 1 FROM usuarios GROUP BY lower(correo) HAVING count(*)>1 LIMIT 1');
        if(duplicates.rows.length)throw new Error('DUPLICATE_EMAIL_REQUIRES_REVIEW');
      }
      plan.push({migracion:m.name,accion:apply?'APLICADA':'PENDIENTE'});
      if(apply){
        await db.query(sql);
        await db.query('INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES($1,$2,now(),$3,NULL,now(),1)',[randomUUID(),checksum,m.name]);
      }
    }
    await db.query(apply?'COMMIT':'ROLLBACK');return {soloLectura:!apply,plan};
  }catch(error){await db.query('ROLLBACK');throw error;}
}
async function main(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_NOT_CONFIGURED');
  const url=new URL(process.env.DATABASE_URL);
  if(['prefer','require','verify-ca'].includes(url.searchParams.get('sslmode')))url.searchParams.set('sslmode','verify-full');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:10000});
  try{await db.connect();console.log(JSON.stringify(await prepare(db,process.argv.includes('--apply')),null,2));}finally{await db.end();}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({estado:'NO_APLICADO',codigo:error.code||error.message}));process.exitCode=1;});
module.exports={prepare};
