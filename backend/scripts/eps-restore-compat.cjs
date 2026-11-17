
// Planning only: does not execute SQL or modify the original recovery archive.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
function normalizeRecoverySql(sql){
 const expected=['visitante_hash','visitante_expira_at'],removed=[];
 const result=sql.replace(/^ALTER TABLE ONLY public\.administrative_cases ALTER COLUMN (visitante_hash|visitante_expira_at) SET \(pg_attver=\d+\);\r?$/gm,(statement,column)=>{if(removed.some(r=>r.column===column))throw Error('DUPLICATE_INTERNAL_VERSION_OPTION');removed.push({column,statement});return '-- Internal attribute version omitted ONLY in the local recovery rehearsal.';});
 if(removed.length!==2||expected.some(c=>!removed.some(r=>r.column===c))||/\bpg_attver\b/.test(result))throw Error('RECOVERY_METADATA_REVIEW_REQUIRED');
 return {sql:result,removed};
}
function plan(directory){
 const root=path.resolve(__dirname,'../database/backups');directory=fs.realpathSync(directory);const relative=path.relative(root,directory);if(!relative||path.isAbsolute(relative)||relative.startsWith('..'))throw Error('RECOVERY_DIRECTORY_REJECTED');
 const archive=path.join(directory,'primary-before-eps.backup'),original=path.join(directory,'original-recovery.private.sql'),normalized=path.join(directory,'compatible-recovery.private.sql');const checksum=sha(fs.readFileSync(archive));
 if(checksum!=='9b11d84afcb6c05496e54d18eaf1bfe43da7d8821b84f686cb375b65701d5d5d')throw Error('REVIEWED_BACKUP_CHANGED');
 const source=fs.readFileSync(original,'utf8'),result=normalizeRecoverySql(source);fs.writeFileSync(normalized,result.sql,{flag:'wx',mode:0o600});const evidence={mode:'PLAN_ONLY_REQUIRES_APPROVAL',archiveSha256:checksum,originalSqlSha256:sha(source),normalizedSqlSha256:sha(result.sql),removedStatements:result.removed,originalArchiveUnchanged:sha(fs.readFileSync(archive))===checksum,sourceWrites:0,restoreExecuted:false,postgresDocumentation:'https://www.postgresql.org/docs/17/catalog-pg-attribute.html'};
 fs.writeFileSync(path.join(directory,'recovery-compatibility-plan.json'),JSON.stringify(evidence,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(evidence,null,2));
}
if(require.main===module){try{const directory=process.argv.find(a=>a.startsWith('--directory='))?.slice(12);if(!directory)throw Error('RECOVERY_DIRECTORY_REQUIRED');plan(directory);}catch(e){console.error(JSON.stringify({status:'RECOVERY_PLAN_STOPPED',code:e.message}));process.exitCode=1;}}
module.exports={normalizeRecoverySql};
