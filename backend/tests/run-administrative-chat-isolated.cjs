// Dedicated local-container runner. Never reads backend/.env or production URLs.
// --prepare-schema is explicit and must be authorized before first use.
const {spawnSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const path=require('node:path');
const {Client}=require('pg');
const container='saludclick-afiliados-validate-20261111';
const tables=['administrative_cases','administrative_messages','administrative_notifications','administrative_audit','administrative_settings','administrative_preferences'];
async function main(){
  const info=spawnSync('docker',['inspect',container],{encoding:'utf8',windowsHide:true});
  if(info.status!==0)throw new Error('ISOLATED_CONTAINER_UNAVAILABLE');
  const config=JSON.parse(info.stdout)[0];
  const values=Object.fromEntries(config.Config.Env.map(item=>{const i=item.indexOf('=');return [item.slice(0,i),item.slice(i+1)];}));
  const binding=config.HostConfig.PortBindings?.['5432/tcp'];
  if(!config.State.Running||values.POSTGRES_DB!=='saludclick_test'||!values.POSTGRES_PASSWORD||binding?.length!==1||binding[0].HostIp!=='127.0.0.1'||binding[0].HostPort!=='55434')throw new Error('ISOLATED_DATABASE_DESTINATION_REJECTED');
  const url=new URL('postgresql://127.0.0.1:55434/saludclick_test');url.username=values.POSTGRES_USER||'postgres';url.password=values.POSTGRES_PASSWORD;url.searchParams.set('sslmode','disable');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
  try{
    await db.connect();
    const identity=(await db.query('SELECT current_database() AS name')).rows[0];
    if(identity.name!=='saludclick_test')throw new Error('ISOLATED_DATABASE_IDENTITY_MISMATCH');
    const present=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",[tables])).rows.map(r=>r.tablename);
    if(present.length&&present.length!==tables.length)throw new Error('PARTIAL_TEST_SCHEMA_REQUIRES_REVIEW');
    if(!present.length){
      if(!process.argv.includes('--prepare-schema')){
        console.log(JSON.stringify({aislada:true,base:'saludclick_test',estado:'ESQUEMA_DE_PRUEBAS_PENDIENTE',tablasFaltantes:tables,migracionesEjecutadas:0}));process.exitCode=2;return;
      }
      const name='20261112120000_administrative_workspace';
      const sql=readFileSync(path.resolve(__dirname,'../prisma/migrations',name,'migration.sql'),'utf8');
      await db.query('BEGIN');
      try{
        await db.query(sql);
        await db.query('INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES($1,$2,now(),$3,now(),1)',[randomUUID(),createHash('sha256').update(sql).digest('hex'),name]);
        await db.query('COMMIT');
      }catch(error){await db.query('ROLLBACK');throw error;}
      console.log(JSON.stringify({aislada:true,base:'saludclick_test',esquemaExistenteCargado:name}));
    }
    const visitorColumns=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='administrative_cases' AND column_name='visitante_hash'");
    if(!visitorColumns.rows.length){
      if(!process.argv.includes('--prepare-visitors'))throw new Error('ISOLATED_VISITOR_SCHEMA_PENDING');
      const name='20261113120000_administrative_visitors';
      const sql=readFileSync(path.resolve(__dirname,'../prisma/migrations',name,'migration.sql'),'utf8');
      await db.query('BEGIN');
      try{
        await db.query(sql);
        await db.query('INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES($1,$2,now(),$3,now(),1)',[randomUUID(),createHash('sha256').update(sql).digest('hex'),name]);
        await db.query('COMMIT');
      }catch(error){await db.query('ROLLBACK');throw error;}
      console.log(JSON.stringify({aislada:true,base:'saludclick_test',esquemaVisitantes:name}));
    }
  }finally{await db.end();}
  const result=spawnSync(process.execPath,['--test',path.resolve(__dirname,'administrative-chat.isolated.cjs')],{cwd:path.resolve(__dirname,'..'),env:{...process.env,ADMIN_CHAT_BROWSER:process.argv.includes('--browser')?'1':process.env.ADMIN_CHAT_BROWSER||'0',TEST_DATABASE_URL:url.toString(),DATABASE_URL:url.toString()},windowsHide:true,stdio:'inherit'});
  process.exitCode=result.status??1;
}
main().catch(error=>{console.error(JSON.stringify({estado:'PRUEBA_AISLADA_NO_COMPLETADA',codigo:error.code||error.name,motivo:/^[A-Z_]+$/.test(error.message||'')?error.message:undefined}));process.exitCode=1;});
