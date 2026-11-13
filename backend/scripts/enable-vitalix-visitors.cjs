// Only the visitor migration is authorized. Other migrations are never run here.
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const {createHash,randomUUID,randomBytes,X509Certificate}=require('node:crypto');
const {spawn}=require('node:child_process');
const env=require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env')));
const migration='20261113120000_administrative_visitors';
const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/migrations',migration,'migration.sql'),'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
const backupDir=path.resolve(__dirname,'../database/backups/vitalix-visitors-20261113');
const backupFile=path.join(backupDir,'saludclick-primary-tls-verified.backup');
const manifestFile=path.join(backupDir,'verified-backup.json');
const caFile=path.join(backupDir,'isrg-root-x1.pem');
const caFingerprint='96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6';
const expectedHost='ep-billowing-bonus-b5hsio7e-pooler.c-7.us-east-2.aws.neon.tech';
const expectedChecksum='fd419707be3667660b75e55e400aa685b36ea2d84d4ff0c4d1b3d155a8ef2194';
function config(value){const u=new URL(value);u.searchParams.set('sslmode','verify-full');return u;}
function requireTarget(){
  const url=config(env.DATABASE_URL);
  if(url.hostname!==expectedHost||url.pathname!=='/neondb'||checksum!==expectedChecksum)throw new Error('AUTHORIZED_TARGET_OR_MIGRATION_CHANGED');
  return url;
}
function docker(args,{input,output,extraEnv}={}){
  return new Promise((resolve,reject)=>{
    let stdout=[],stderr=[];
    const p=spawn('docker',args,{windowsHide:true,env:{...process.env,...extraEnv},stdio:['pipe',output??'pipe','pipe']});
    if(p.stdout)p.stdout.on('data',c=>stdout.push(c));p.stderr.on('data',c=>stderr.push(c));
    p.on('error',()=>reject(new Error('DOCKER_PROCESS_UNAVAILABLE')));
    p.on('close',code=>{
      if(code===0)return resolve(Buffer.concat(stdout).toString());
      let diagnostic=Buffer.concat(stderr).toString();
      for(const key of ['DATABASE_URL','EPS_DATABASE_URL']){
        const u=new URL(env[key]);
        for(const value of [env[key],u.username,u.password,decodeURIComponent(u.username),decodeURIComponent(u.password)])if(value)diagnostic=diagnostic.split(value).join('[REDACTED]');
      }
      fs.writeFileSync(path.join(backupDir,'backup-command-error.private.txt'),diagnostic.replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED_URL]'));
      reject(new Error('BACKUP_OR_RESTORE_COMMAND_FAILED'));
    });
    p.stdin.on('error',()=>{});p.stdin.end(input);
  });
}
const quote=value=>'"'+value.replaceAll('"','""')+'"';
async function fingerprints(db,{afterVisitor=false}={}){
  await db.query("SET TIME ZONE 'UTC'");
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const result={};
  for(const {tablename} of tables){
    const expression=afterVisitor&&tablename==='administrative_cases'?"(to_jsonb(t)-'visitante_hash'-'visitante_expira_at')":'to_jsonb(t)';
    const where=afterVisitor&&tablename==='_prisma_migrations'?' WHERE migration_name<>$1':'';
    const values=(await db.query(`SELECT ${expression}::text AS value FROM public.${quote(tablename)} t${where} ORDER BY ${expression}::text COLLATE "C"`,where?[migration]:[])).rows;
    result[tablename]={count:values.length,sha256:createHash('sha256').update(JSON.stringify(values.map(r=>r.value))).digest('hex')};
  }
  return result;
}
async function epsFingerprint(){
  const url=config(env.EPS_DATABASE_URL),schema=env.EPS_DATABASE_SCHEMA||'public';
  if(url.hostname!=='ep-delicate-mountain-bei8g1c9-pooler.c-9.us-east-2.aws.neon.tech'||schema!=='public')throw new Error('EPS_IDENTITY_CHANGED');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000});
  try{await db.connect();await db.query('BEGIN READ ONLY');const all=await fingerprints(db);await db.query('ROLLBACK');if(all.afiliados?.count!==50)throw new Error('EPS_COUNT_CHANGED');return all;}finally{await db.end();}
}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function canonicalConstraints(constraints){
  return constraints.map(c=>{
    if(c.relname!=='administrative_cases')return c;
    const field=c.conname==='administrative_cases_estado_check'?'estado':c.conname==='administrative_cases_tipo_check'?'tipo':null;
    if(!field)return c;
    const values=field==='estado'?['ABIERTA','EN_ATENCION','RESUELTA','CERRADA']:['SOLICITUD','CONVERSACION'];
    const source=`CHECK (${field}::text = ANY (ARRAY[${values.map(v=>`'${v}'::character varying`).join(', ')}]::text[]))`;
    const restored=`CHECK (${field}::text = ANY (ARRAY[${values.map(v=>`'${v}'::character varying::text`).join(', ')}]))`;
    return c.definition===source||c.definition===restored?{...c,definition:source}:c;
  });
}
function equivalentStructure(a,b){return equal(a.indexes,b.indexes)&&equal(a.sequences,b.sequences)&&equal(canonicalConstraints(a.constraints),canonicalConstraints(b.constraints));}
async function checkConstraintSemantics(source,restored){
  for(const field of ['estado','tipo']){
    const query="SELECT pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname='administrative_cases' AND c.conname=$1";
    const name=`administrative_cases_${field}_check`,values=['ABIERTA','EN_ATENCION','RESUELTA','CERRADA','SOLICITUD','CONVERSACION','INVALIDO','',null,'abierta','ABIERTA '];
    const [a,b]=await Promise.all([source.query(query,[name]),restored.query(query,[name])]);
    if(a.rows.length!==1||b.rows.length!==1)throw new Error('CHECK_CONSTRAINT_MISSING');
    // Expressions come only from the two exact known catalogue definitions.
    const known=[a.rows[0].definition,b.rows[0].definition].map(definition=>({relname:'administrative_cases',conname:name,definition}));
    if(!equal(canonicalConstraints([known[0]]),canonicalConstraints([known[1]])))throw new Error('CHECK_CONSTRAINT_EXPRESSION_CHANGED');
    const evaluate=(db,expression)=>db.query(`WITH candidate(${field}) AS (SELECT unnest($1::varchar[])) SELECT ${field},(${expression}) AS accepted FROM candidate`,[values]);
    const [left,right]=await Promise.all([evaluate(source,a.rows[0].definition.slice(7,-1)),evaluate(restored,b.rows[0].definition.slice(7,-1))]);
    if(!equal(left.rows,right.rows))throw new Error('RESTORED_CHECK_SEMANTICS_DIFFER');
  }
}
async function structure(db){
  const constraints=(await db.query("SELECT c.conname,t.relname,pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname COLLATE \"C\",c.conname COLLATE \"C\"")).rows;
  const indexes=(await db.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename COLLATE \"C\",indexname COLLATE \"C\"")).rows;
  const sequences=(await db.query("SELECT sequencename,data_type::text,start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text,last_value::text FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename COLLATE \"C\"")).rows;
  return {constraints,indexes,sequences};
}
async function backup(){
  const url=requireTarget();
  const ca=new X509Certificate(fs.readFileSync(caFile));
  if(ca.fingerprint256!==caFingerprint||!ca.ca||ca.subject!==ca.issuer||!ca.verify(ca.publicKey))throw new Error('VERIFIED_CA_CHANGED');
  if(!fs.existsSync(backupDir)||fs.existsSync(backupFile)||fs.existsSync(manifestFile))throw new Error('BACKUP_DIRECTORY_NOT_READY_OR_ALREADY_USED');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000});let file,restore;
  try{
    await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const before=await fingerprints(db),relations=await structure(db),eps=await epsFingerprint();
    if(before.usuarios?.count!==5||before.administrative_cases===undefined)throw new Error('PRIMARY_DATA_CHANGED');
    const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='administrative_cases' AND column_name LIKE 'visitante_%'")).rows;
    if(columns.length)throw new Error('SCHEMA_CHANGED_BEFORE_BACKUP');
    const snapshot=(await db.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    // Credentials are sent over stdin to the one-shot tool, never command arguments or logs.
    const credentials=[url.hostname,url.port||'5432',decodeURIComponent(url.pathname.slice(1)),decodeURIComponent(url.username),decodeURIComponent(url.password),snapshot];
    if(credentials.some(v=>/[\r\n]/.test(v)))throw new Error('UNSUPPORTED_CREDENTIAL_FORMAT');
    file=fs.openSync(backupFile,'wx');
    await docker(['run','--rm','-i','--mount',`type=bind,source=${caFile},target=/run/isrg-root-x1.pem,readonly`,'postgres:18','sh','-c','IFS= read -r PGHOST; IFS= read -r PGPORT; IFS= read -r PGDATABASE; IFS= read -r PGUSER; IFS= read -r PGPASSWORD; IFS= read -r PGSNAPSHOT; export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD; export PGSSLMODE=verify-full PGSSLROOTCERT=/run/isrg-root-x1.pem; exec pg_dump --format=custom --snapshot="$PGSNAPSHOT"'],{input:credentials.join('\n')+'\n',output:file});
    fs.closeSync(file);file=null;await db.query('ROLLBACK');
    const dump=fs.readFileSync(backupFile);if(dump.length<1000||dump.subarray(0,5).toString()!=='PGDMP')throw new Error('BACKUP_ARCHIVE_INVALID');
    const restoreName='saludclick-vitalix-restore-'+randomUUID().slice(0,8),password=randomBytes(32).toString('hex');
    await docker(['run','-d','--name',restoreName,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD','-e','POSTGRES_USER','-e','POSTGRES_DB','postgres:18'],{extraEnv:{POSTGRES_PASSWORD:password,POSTGRES_USER:'postgres',POSTGRES_DB:'saludclick_recovery_verify'}});
    let ready=false;
    for(let attempt=0;attempt<30;attempt++){
      const status=await docker(['exec',restoreName,'sh','-c','pg_isready -U postgres >/dev/null 2>&1 && echo READY || echo WAIT']);
      if(status.trim()==='READY'){ready=true;break;}await new Promise(r=>setTimeout(r,1000));
    }
    if(!ready)throw new Error('RESTORE_SERVER_NOT_READY');
    await docker(['exec','-i',restoreName,'pg_restore','--exit-on-error','--no-owner','--no-privileges','-U','postgres','-d','saludclick_recovery_verify'],{input:dump});
    const info=JSON.parse(await docker(['inspect',restoreName]))[0];
    const binding=info.NetworkSettings.Ports['5432/tcp'];
    if(binding.length!==1||binding[0].HostIp!=='127.0.0.1')throw new Error('RESTORE_DESTINATION_REJECTED');
    restore=new Client({host:'127.0.0.1',port:Number(binding[0].HostPort),user:'postgres',password,database:'saludclick_recovery_verify',connectionTimeoutMillis:10000});
    await restore.connect();await restore.query('BEGIN READ ONLY');
    const recovered=await fingerprints(restore),restoredRelations=await structure(restore);await restore.query('ROLLBACK');
    if(!equal(before,recovered)||!equivalentStructure(relations,restoredRelations))throw new Error('RESTORED_DATA_OR_RELATION_FINGERPRINT_MISMATCH');
    await checkConstraintSemantics(db,restore);
    await restore.end();restore=null;
    await db.query('BEGIN READ ONLY');const after=await fingerprints(db);await db.query('ROLLBACK');
    if(!equal(before,after)||!equal(eps,await epsFingerprint()))throw new Error('SOURCE_CHANGED_DURING_BACKUP');
    await docker(['stop',restoreName]);
    const manifest={verified:true,verifiedAt:new Date().toISOString(),primaryHost:url.hostname,database:'neondb',migration,checksum,tls:{sslmode:'verify-full',caSource:'https://letsencrypt.org/certs/isrgrootx1.pem',caFingerprint},backupFile,bytes:dump.length,dumpSha256:createHash('sha256').update(dump).digest('hex'),restoreContainer:restoreName,restoreDatabase:'saludclick_recovery_verify',tables:before,relations,eps};
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2),{flag:'wx'});
    console.log(JSON.stringify({status:'BACKUP_RESTORED_AND_VERIFIED',backupFile,manifestFile,bytes:dump.length,sha256:manifest.dumpSha256,tables:Object.keys(before).length,accounts:before.usuarios.count,epsAffiliates:eps.afiliados.count,primaryWrites:0}));
  }finally{if(file!==undefined&&file!==null)fs.closeSync(file);if(restore)await restore.end();await db.end();}
}
async function verifyExistingBackup(){
  const url=requireTarget(),restoreName='saludclick-vitalix-restore-97528d98';
  if(fs.existsSync(manifestFile))throw new Error('VERIFICATION_ALREADY_PRESENT');
  const dump=fs.readFileSync(backupFile);
  if(dump.length<1000||dump.subarray(0,5).toString()!=='PGDMP')throw new Error('BACKUP_ARCHIVE_INVALID');
  const ca=new X509Certificate(fs.readFileSync(caFile));if(ca.fingerprint256!==caFingerprint)throw new Error('CA_CHANGED');
  const info=JSON.parse(await docker(['inspect',restoreName]))[0];
  const vars=Object.fromEntries(info.Config.Env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
  const bindings=info.NetworkSettings.Ports['5432/tcp'];
  if(!info.State.Running||bindings?.length!==1||bindings[0].HostIp!=='127.0.0.1'||vars.POSTGRES_DB!=='saludclick_recovery_verify')throw new Error('RESTORE_DESTINATION_REJECTED');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000});
  const restore=new Client({host:'127.0.0.1',port:Number(bindings[0].HostPort),user:vars.POSTGRES_USER,password:vars.POSTGRES_PASSWORD,database:vars.POSTGRES_DB});
  try{
    await db.connect();await restore.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await restore.query('BEGIN READ ONLY');
    const tables=await fingerprints(db),relations=await structure(db),recovered=await fingerprints(restore),restoredRelations=await structure(restore),eps=await epsFingerprint();
    if(tables.usuarios?.count!==5||!equal(tables,recovered)||!equivalentStructure(relations,restoredRelations))throw new Error('RESTORE_VERIFICATION_FAILED');
    await checkConstraintSemantics(db,restore);
    const toc=await docker(['exec','-i',restoreName,'pg_restore','--list'],{input:dump});
    if(!toc.includes('TABLE DATA public usuarios')||!toc.includes('FK CONSTRAINT'))throw new Error('BACKUP_CATALOGUE_INCOMPLETE');
    await db.query('ROLLBACK');await restore.query('ROLLBACK');
    await db.query('BEGIN READ ONLY');const current=await fingerprints(db);await db.query('ROLLBACK');
    if(!equal(tables,current)||!equal(eps,await epsFingerprint()))throw new Error('SOURCE_CHANGED_DURING_VERIFICATION');
    fs.writeFileSync(path.join(backupDir,'backup-catalogue.private.txt'),toc,{flag:'wx'});
    const manifest={verified:true,verifiedAt:new Date().toISOString(),primaryHost:url.hostname,database:'neondb',migration,checksum,tls:{sslmode:'verify-full',caSource:'https://letsencrypt.org/certs/isrgrootx1.pem',caFingerprint},backupFile,bytes:dump.length,dumpSha256:createHash('sha256').update(dump).digest('hex'),restoreContainer:restoreName,restoreDatabase:'saludclick_recovery_verify',tables,relations,eps,checkSemanticsVerified:true,exactCastRepresentationsVerified:true};
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2),{flag:'wx'});
    console.log(JSON.stringify({status:'BACKUP_RESTORED_AND_VERIFIED',backupFile,bytes:dump.length,sha256:manifest.dumpSha256,tables:Object.keys(tables).length,relations:relations.constraints.length,indexes:relations.indexes.length,sequences:relations.sequences.length,accounts:tables.usuarios.count,epsAffiliates:eps.afiliados.count,checkSemanticsVerified:true,primaryWrites:0}));
  }finally{await db.end();await restore.end();}
}
async function inspect(){
  const url=config(env.DATABASE_URL),epsUrl=config(env.EPS_DATABASE_URL);
  if(url.hostname===epsUrl.hostname||url.pathname!=='/neondb'||!url.hostname.endsWith('.neon.tech'))throw new Error('PRIMARY_DESTINATION_REJECTED');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000});
  const eps=new Client({connectionString:epsUrl.toString(),connectionTimeoutMillis:15000});
  try{
    await db.connect();await eps.connect();
    await db.query('BEGIN READ ONLY');await eps.query('BEGIN READ ONLY');
    const identity=(await db.query("SELECT current_database() AS database,current_schema() AS schema,current_setting('server_version') AS version")).rows[0];
    if(identity.database!=='neondb'||identity.schema!=='public')throw new Error('PRIMARY_IDENTITY_MISMATCH');
    const accounts=(await db.query("SELECT count(*)::int total,count(*) FILTER(WHERE id=1 AND rol_id=1 AND estado='ACTIVO')::int administrator FROM usuarios")).rows[0];
    const schema=env.EPS_DATABASE_SCHEMA||'public';if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw new Error('EPS_SCHEMA_REJECTED');
    const affiliates=(await eps.query(`SELECT count(*)::int total FROM "${schema}".afiliados`)).rows[0].total;
    if(accounts.total!==5||accounts.administrator!==1||affiliates!==50)throw new Error('EXPECTED_DATA_COUNTS_MISMATCH');
    const columns=(await db.query("SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('administrative_cases','administrative_messages','administrative_audit') ORDER BY table_name,column_name")).rows;
    if(columns.some(c=>c.column_name==='visitante_hash'||c.column_name==='visitante_expira_at'))throw new Error('VISITOR_SCHEMA_ALREADY_PRESENT_REQUIRES_REVIEW');
    const history=(await db.query('SELECT migration_name,finished_at IS NOT NULL AS applied,rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY started_at')).rows;
    if(history.some(m=>m.migration_name===migration&&!m.rolled_back))throw new Error('VISITOR_MIGRATION_ALREADY_REGISTERED');
    const cases=(await db.query('SELECT count(*)::int cases,(SELECT count(*)::int FROM administrative_messages) AS messages,(SELECT count(*)::int FROM administrative_notifications) AS notifications FROM administrative_cases')).rows[0];
    await db.query('ROLLBACK');await eps.query('ROLLBACK');
    console.log(JSON.stringify({status:'READ_ONLY_INSPECTION_PASSED',primary:{host:url.hostname,...identity},eps:{host:epsUrl.hostname,count:affiliates},accounts,...cases,migration,checksum,columns,history},null,2));
  }finally{await db.end();await eps.end();}
}
let migrationCommitted=false;
async function permissions(db){
  const objects=(await db.query("SELECT c.relname,c.relkind,c.relowner::text,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S') ORDER BY c.relname COLLATE \"C\"")).rows;
  const roles=(await db.query('SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY rolname COLLATE "C"')).rows;
  return {objects,roles};
}
async function applyAuthorizedMigration(){
  const url=requireTarget(),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),dump=fs.readFileSync(backupFile);
  if(!manifest.verified||!manifest.checkSemanticsVerified||manifest.primaryHost!==url.hostname||manifest.database!=='neondb'||manifest.migration!==migration||manifest.checksum!==checksum||manifest.dumpSha256!==createHash('sha256').update(dump).digest('hex')||manifest.bytes!==dump.length||manifest.tls?.sslmode!=='verify-full'||manifest.tls?.caFingerprint!==caFingerprint||Date.now()-Date.parse(manifest.verifiedAt)>86400000)throw new Error('RECOVERABLE_BACKUP_PROOF_REJECTED');
  const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000});
  try{
    await db.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='10000'; SET LOCAL statement_timeout='60000'");
    await db.query('SELECT pg_advisory_xact_lock(72411013)');
    const identity=(await db.query('SELECT current_database() AS database,current_schema() AS schema')).rows[0];
    if(identity.database!=='neondb'||identity.schema!=='public')throw new Error('PRIMARY_IDENTITY_MISMATCH');
    for(const table of Object.keys(manifest.tables))await db.query(`LOCK TABLE public.${quote(table)} IN SHARE MODE`);
    const before=await fingerprints(db),aclBefore=await permissions(db),epsBefore=await epsFingerprint();
    if(!equal(before,manifest.tables)||!equal(epsBefore,manifest.eps)||before.usuarios?.count!==5||epsBefore.afiliados?.count!==50)throw new Error('DATA_CHANGED_SINCE_VERIFIED_BACKUP');
    const existing=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='administrative_cases' AND column_name IN ('visitante_hash','visitante_expira_at')")).rows;
    if(existing.length)throw new Error('VISITOR_SCHEMA_ALREADY_PRESENT');
    const history=await db.query('SELECT id FROM _prisma_migrations WHERE migration_name=$1',[migration]);
    if(history.rows.length)throw new Error('MIGRATION_ALREADY_RECORDED');
    // Execute only the exact SQL reviewed and pinned above. No migrate deploy or other SQL migrations.
    await db.query(sql);
    const columns=(await db.query("SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND ((table_name='administrative_cases' AND column_name IN ('cliente_id','visitante_hash','visitante_expira_at')) OR (table_name='administrative_messages' AND column_name='remitente_id') OR (table_name='administrative_audit' AND column_name='actor_id'))")).rows;
    if(columns.length!==5||columns.some(c=>c.is_nullable!=='YES'))throw new Error('MIGRATION_SCHEMA_VERIFICATION_FAILED');
    const constraint=(await db.query("SELECT convalidated FROM pg_constraint WHERE conname='administrative_case_identity' AND conrelid='public.administrative_cases'::regclass")).rows;
    const index=(await db.query("SELECT indisvalid,indisunique FROM pg_index WHERE indexrelid='public.administrative_cases_visitante_key'::regclass")).rows;
    if(constraint.length!==1||!constraint[0].convalidated||index.length!==1||!index[0].indisvalid||!index[0].indisunique)throw new Error('VISITOR_CONSTRAINT_VERIFICATION_FAILED');
    await db.query('INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES($1,$2,now(),$3,now(),1)',[randomUUID(),checksum,migration]);
    const after=await fingerprints(db,{afterVisitor:true}),aclAfter=await permissions(db),epsAfter=await epsFingerprint();
    if(!equal(before,after)||!equal(aclBefore,aclAfter)||!equal(epsBefore,epsAfter))throw new Error('DATA_OR_PERMISSIONS_CHANGED_ROLLBACK_REQUIRED');
    await db.query('COMMIT');migrationCommitted=true;
    const result={status:'AUTHORIZED_VISITOR_MIGRATION_COMMITTED',appliedAt:new Date().toISOString(),migration,checksum,primaryHost:url.hostname,database:identity.database,schema:identity.schema,backupSha256:manifest.dumpSha256,tablesPreserved:Object.keys(before).length,accountsPreserved:before.usuarios.count,epsAffiliatesPreserved:epsAfter.afiliados.count,dataUnchanged:true,permissionsUnchanged:true,otherMigrationsExecuted:0,conversationsCreated:0};
    fs.writeFileSync(path.join(backupDir,'migration-applied.json'),JSON.stringify(result,null,2),{flag:'wx'});
    await db.query('BEGIN READ ONLY');const durable=await fingerprints(db,{afterVisitor:true}),record=(await db.query('SELECT checksum,finished_at IS NOT NULL AS finished FROM _prisma_migrations WHERE migration_name=$1',[migration])).rows;await db.query('ROLLBACK');
    if(!equal(durable,before)||record.length!==1||record[0].checksum!==checksum||!record[0].finished)throw new Error('POST_COMMIT_VERIFICATION_FAILED');
    console.log(JSON.stringify({...result,postCommitVerified:true}));
  }catch(error){if(!migrationCommitted)await db.query('ROLLBACK').catch(()=>{});throw error;}finally{await db.end();}
}
if(require.main===module){
  if(process.argv.includes('--inspect')||process.argv.includes('--backup')||process.argv.includes('--verify-backup')||process.argv.includes('--apply-authorized'))(process.argv.includes('--apply-authorized')?applyAuthorizedMigration():process.argv.includes('--verify-backup')?verifyExistingBackup():process.argv.includes('--backup')?backup():inspect()).catch(error=>{console.error(JSON.stringify({status:migrationCommitted?'MIGRATION_COMMITTED_POSTCHECK_REQUIRES_REVIEW':'STOPPED_WITHOUT_MIGRATION',code:error.code||error.message}));process.exitCode=1;});
  else {console.error('INSPECT_MODE_REQUIRED');process.exitCode=1;}
}
module.exports={env,migration,sql,checksum,config,fingerprints,structure,epsFingerprint,canonicalConstraints,equivalentStructure};
