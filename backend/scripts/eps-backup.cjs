// Full recovery archive + verified local restore. Never changes the Neon source.
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const { Client } = require('pg');
const {
  env,
  config,
  fingerprints,
  structure,
  epsFingerprint,
  equivalentStructure,
} = require('./enable-vitalix-visitors.cjs');
const { hash } = require('./eps-apply-schema.cjs');
const expectedTarget = '7640c9f603b5eb8ae23dd8e47ef8c1057d2a570285547b07acd322e9163baa5d';
const expectedSql = '2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835';
const bin = 'C:/Program Files/PostgreSQL/18/bin';
let phase = 'preflight';
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
function run(directory, name, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    let out = [],
      err = [];
    const child = spawn(path.join(bin, name + '.exe'), args, {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => err.push(b));
    child.once('error', () =>
      reject(Object.assign(new Error('PG_TOOL_UNAVAILABLE'), { code: 'PG_TOOL_UNAVAILABLE' })),
    );
    child.once(name === 'pg_ctl' ? 'exit' : 'close', (code) => {
      if(name === 'pg_ctl'){child.stdout.destroy();child.stderr.destroy();}
      fs.appendFileSync(
        path.join(directory, 'tools.private.log'),
        Buffer.concat([Buffer.from('\n' + name + '\n'), ...out, ...err]),
      );
      if (code !== 0)
        return reject(Object.assign(new Error('PG_TOOL_FAILED'), { code: 'PG_TOOL_FAILED' }));
      resolve(Buffer.concat(out).toString());
    });
  });
}
async function createAndVerify(directory) {
  const root = path.resolve(__dirname, '../database/backups');
  directory = fs.realpathSync(directory);
  const relative = path.relative(root, directory);
  if (!relative || path.isAbsolute(relative) || relative.startsWith('..'))
    fail('EPS_BACKUP_PATH_REJECTED');
  const archive = path.join(directory, 'primary-before-eps.backup'),
    manifestFile = path.join(directory, 'verified-backup.json');
  if (fs.existsSync(archive) || fs.existsSync(manifestFile)) fail('EPS_BACKUP_ALREADY_EXISTS');
  const url = config(env.DATABASE_URL),
    sql = fs.readFileSync(
      path.resolve(__dirname, '../prisma/migrations/20261114090000_eps_workspace/migration.sql'),
      'utf8',
    );
  if (hash(sql) !== expectedSql) fail('EPS_SQL_CHANGED');
  const primary = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
  });
  let admin,
    restore,
    started = false;
  const cluster = path.join(directory, 'restore-cluster'),
    passwordFile = path.join(directory, 'restore-password.private.txt'),
    caFile = path.join(directory, 'node-trust-roots.pem');
  const password = randomBytes(32).toString('hex'),
    user = 'saludclick_eps_restore',
    database = 'saludclick_eps_recovery';
  try {
    await primary.connect();
    await primary.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity = (
      await primary.query('SELECT current_database() AS database,current_schema() AS schema')
    ).rows[0];
    const target = hash(url.hostname + '/' + identity.database + '/' + identity.schema);
    if (target !== expectedTarget) fail('EPS_TARGET_MISMATCH');
    const before = await fingerprints(primary),
      relations = await structure(primary),
      eps = await epsFingerprint();
    const snapshot = (await primary.query('SELECT pg_export_snapshot() AS snapshot')).rows[0]
      .snapshot;
    fs.writeFileSync(caFile, require('node:tls').rootCertificates.join('\n') + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    phase = 'pg_dump';
    console.log(JSON.stringify({ stage: phase, primaryWrites: 0 }));
    await run(
      directory,
      'pg_dump',
      ['--format=custom', '--snapshot=' + snapshot, '--file=' + archive],
      {
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGDATABASE: identity.database,
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: 'verify-full',
        PGSSLROOTCERT: caFile,
        PGCHANNELBINDING: url.searchParams.get('channel_binding') || 'prefer',
      },
    );
    await primary.query('ROLLBACK');
    const bytes = fs.readFileSync(archive);
    if (bytes.length < 1000 || bytes.subarray(0, 5).toString() !== 'PGDMP')
      fail('EPS_BACKUP_ARCHIVE_INVALID');
    phase = 'initialize-local-recovery';
    console.log(JSON.stringify({ stage: phase, bytes: bytes.length }));
    fs.writeFileSync(passwordFile, password + '\n', { flag: 'wx', mode: 0o600 });
    await run(directory, 'initdb', [
      '-D',
      cluster,
      '-U',
      user,
      '--pwfile=' + passwordFile,
      '--auth-host=scram-sha-256',
      '--auth-local=scram-sha-256',
      '--no-locale',
      '--encoding=UTF8',
    ]);
    const probe = net.createServer();
    const port = await new Promise((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const n = probe.address().port;
        probe.close(() => resolve(n));
      });
    });
    await run(directory, 'pg_ctl', [
      '-D',
      cluster,
      '-l',
      path.join(directory, 'postgres.private.log'),
      '-o',
      '-h 127.0.0.1 -p ' + port,
      '-w',
      '-t',
      '30',
      'start',
    ]);
    started = true;
    admin = new Client({
      host: '127.0.0.1',
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 10000,
    });
    await admin.connect();
    await admin.query('CREATE DATABASE ' + database);
    await admin.end();
    admin = null;
    phase = 'pg_restore';
    console.log(JSON.stringify({ stage: phase, localOnly: true }));
    await run(
      directory,
      'pg_restore',
      ['--exit-on-error', '--no-owner', '--no-privileges', '--dbname=' + database, archive],
      {
        PGHOST: '127.0.0.1',
        PGPORT: String(port),
        PGDATABASE: database,
        PGUSER: user,
        PGPASSWORD: password,
        PGSSLMODE: 'disable',
      },
    );
    restore = new Client({
      host: '127.0.0.1',
      port,
      user,
      password,
      database,
      connectionTimeoutMillis: 10000,
    });
    await restore.connect();
    await restore.query('BEGIN READ ONLY');
    const recovered = await fingerprints(restore),
      recoveredStructure = await structure(restore);
    await restore.query('ROLLBACK');
    if (
      JSON.stringify(before) !== JSON.stringify(recovered) ||
      !equivalentStructure(relations, recoveredStructure)
    )
      fail('EPS_RESTORED_CONTENT_OR_STRUCTURE_MISMATCH');
    await restore.end();
    restore = null;
    await primary.query('BEGIN READ ONLY');
    const current = await fingerprints(primary);
    await primary.query('ROLLBACK');
    if (
      JSON.stringify(before) !== JSON.stringify(current) ||
      JSON.stringify(eps) !== JSON.stringify(await epsFingerprint())
    )
      fail('EPS_DATA_CHANGED_DURING_BACKUP');
    await run(directory, 'pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop']);
    started = false;
    const manifest = {
      verified: true,
      verifiedAt: new Date().toISOString(),
      migration: '20261114090000_eps_workspace',
      sqlHash: expectedSql,
      targetFingerprint: target,
      primaryHost: url.hostname,
      database: identity.database,
      schema: identity.schema,
      archive,
      bytes: bytes.length,
      archiveSha256: createHash('sha256').update(bytes).digest('hex'),
      nativePostgreSQL: '18.3',
      localRestoreVerified: true,
      localRestoreStopped: true,
      backupPreservesOwnersAndPrivileges: true,
      restoreIgnoredOwnersAndPrivileges: true,
      tables: before,
      relations,
      sourceEPS: eps,
      primaryWrites: 0,
    };
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({
        status: 'EPS_BACKUP_RECOVERABLE',
        manifestFile,
        archive,
        bytes: bytes.length,
        sha256: manifest.archiveSha256,
        tables: Object.keys(before).length,
        accounts: before.usuarios.count,
        sourceAffiliates: eps.afiliados.count,
        primaryWrites: 0,
      }),
    );
    return manifest;
  } finally {
    if (admin) await admin.end();
    if (restore) await restore.end();
    await primary.end();
    if (started) await run(directory, 'pg_ctl', ['-D', cluster, '-m', 'fast', '-w', 'stop']);
  }
}

async function resumeAndVerify(directory){
 const root=path.resolve(__dirname,'../database/backups');directory=fs.realpathSync(directory);const relative=path.relative(root,directory);if(!relative||path.isAbsolute(relative)||relative.startsWith('..'))fail('EPS_BACKUP_PATH_REJECTED');
 const archive=path.join(directory,'primary-before-eps.backup'),cluster=path.join(directory,'restore-cluster');const bytes=fs.readFileSync(archive);if(bytes.length<1000||bytes.subarray(0,5).toString()!=='PGDMP'||fs.existsSync(path.join(directory,'verified-backup.json')))fail('EPS_RECOVERY_RESUME_REJECTED');
 const pid=fs.readFileSync(path.join(cluster,'postmaster.pid'),'utf8').split(/\r?\n/);if(path.resolve(pid[1])!==path.resolve(cluster)||!/^\d+$/.test(pid[3])||pid[5].trim()!=='127.0.0.1')fail('EPS_LOCAL_RECOVERY_IDENTITY_MISMATCH');
 const port=Number(pid[3]),password=fs.readFileSync(path.join(directory,'restore-password.private.txt'),'utf8').trim(),user='saludclick_eps_restore',database='saludclick_eps_recovery';
 const url=config(env.DATABASE_URL),primary=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000});let admin,restore;let stopped=false;
 try{
  await primary.connect();await primary.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const identity=(await primary.query('SELECT current_database() AS database,current_schema() AS schema')).rows[0];const target=hash(url.hostname+'/'+identity.database+'/'+identity.schema);if(target!==expectedTarget)fail('EPS_TARGET_MISMATCH');
  const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261114090000_eps_workspace/migration.sql'),'utf8');if(hash(sql)!==expectedSql)fail('EPS_SQL_CHANGED');const before=await fingerprints(primary),relations=await structure(primary),eps=await epsFingerprint();
  admin=new Client({host:'127.0.0.1',port,user,password,database:'postgres'});await admin.connect();const local=(await admin.query("SELECT current_user AS role,current_setting('listen_addresses') AS address")).rows[0];if(local.role!==user||local.address!=='127.0.0.1')fail('EPS_LOCAL_RECOVERY_IDENTITY_MISMATCH');
  if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)fail('EPS_RECOVERY_DATABASE_ALREADY_EXISTS');await admin.query('CREATE DATABASE '+database);await admin.end();admin=null;
  phase='pg_restore';console.log(JSON.stringify({stage:phase,localOnly:true}));await run(directory,'pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname='+database,archive],{PGHOST:'127.0.0.1',PGPORT:String(port),PGDATABASE:database,PGUSER:user,PGPASSWORD:password,PGSSLMODE:'disable'});
  restore=new Client({host:'127.0.0.1',port,user,password,database});await restore.connect();await restore.query('BEGIN READ ONLY');const recovered=await fingerprints(restore),recoveredStructure=await structure(restore);await restore.query('ROLLBACK');if(JSON.stringify(before)!==JSON.stringify(recovered)||!equivalentStructure(relations,recoveredStructure))fail('EPS_RESTORED_CONTENT_OR_STRUCTURE_MISMATCH');await restore.end();restore=null;await primary.query('ROLLBACK');
  await primary.query('BEGIN READ ONLY');const current=await fingerprints(primary);await primary.query('ROLLBACK');if(JSON.stringify(current)!==JSON.stringify(before)||JSON.stringify(await epsFingerprint())!==JSON.stringify(eps))fail('EPS_DATA_CHANGED_DURING_BACKUP');
  await run(directory,'pg_ctl',['-D',cluster,'-m','fast','-w','stop']);stopped=true;
  const manifest={verified:true,verifiedAt:new Date().toISOString(),migration:'20261114090000_eps_workspace',sqlHash:expectedSql,targetFingerprint:target,primaryHost:url.hostname,database:identity.database,schema:identity.schema,archive,bytes:bytes.length,archiveSha256:createHash('sha256').update(bytes).digest('hex'),nativePostgreSQL:'18.3',localRestoreVerified:true,localRestoreStopped:true,backupPreservesOwnersAndPrivileges:true,restoreIgnoredOwnersAndPrivileges:true,tables:before,relations,sourceEPS:eps,primaryWrites:0};const manifestFile=path.join(directory,'verified-backup.json');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'EPS_BACKUP_RECOVERABLE',manifestFile,bytes:bytes.length,sha256:manifest.archiveSha256,tables:Object.keys(before).length,accounts:before.usuarios.count,sourceAffiliates:eps.afiliados.count,primaryWrites:0}));
 }finally{if(admin)await admin.end();if(restore)await restore.end();await primary.end();if(!stopped)await run(directory,'pg_ctl',['-D',cluster,'-m','fast','-w','stop']);}
}

if (require.main === module) {
  const directory = process.argv.find((a) => a.startsWith('--directory='))?.slice(12);
  if (!directory || !process.argv.includes('--create-and-verify') && !process.argv.includes('--resume-verify')) {
    console.error('EPS_BACKUP_EXPLICIT_MODE_REQUIRED');
    process.exitCode = 1;
  } else
    (process.argv.includes('--resume-verify') ? resumeAndVerify(directory) : createAndVerify(directory)).catch((e) => {
      console.error(
        JSON.stringify({
          status: 'EPS_BACKUP_NOT_VERIFIED',
          phase,
          code: /^[A-Za-z0-9_]+$/.test(e.code || '') ? e.code : e.name,
          primaryWrites: 0,
        }),
      );
      process.exitCode = 1;
    });
}
module.exports = { createAndVerify };
