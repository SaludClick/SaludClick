// Lectura de GitHub sin fetch/checkout ni cambios de refs. Nunca usa Neon.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/calidad/activacion-farmacia-2026-11-17/resolucion-bloqueos');
async function main(){
    const r=spawnSync('git',['-c','credential.interactive=false','ls-remote','--heads','origin'],{cwd:root,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'},encoding:'utf8'});
    if(r.status!==0)throw new Error('No se pudo consultar el remoto sin cambiar refs.');
    const refs=r.stdout.trim().split(/\r?\n/).map(l=>{const [sha,ref]=l.split(/\s+/);return {sha,ref};});
    const audit=JSON.parse(fs.readFileSync(path.join(out,'../auditoria-readonly.json'),'utf8'));
    const missing=audit.destino.historial.filter(h=>h.migration_name.includes('_eps_')&&!fs.existsSync(path.join(root,'backend/prisma/migrations',h.migration_name,'migration.sql')));
    const results=[];
    for(const ref of refs)for(const target of missing){
        const url=`https://raw.githubusercontent.com/SaludClick/SaludClick/${ref.sha}/backend/prisma/migrations/${target.migration_name}/migration.sql`;
        try{
            const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
            const row={ref:ref.ref,commit:ref.sha,nombre:target.migration_name,status:response.status};
            if(response.ok){const bytes=Buffer.from(await response.arrayBuffer());const hash=crypto.createHash('sha256').update(bytes).digest('hex');row.sha256=hash;row.coincide=hash===target.checksum;if(row.coincide){const dir=path.join(out,'originales-verificados',target.migration_name);fs.mkdirSync(dir,{recursive:true});const dest=path.join(dir,'migration.sql');if(fs.existsSync(dest)&&!fs.readFileSync(dest).equals(bytes))throw new Error('Artefacto previo distinto; se conserva');fs.writeFileSync(dest,bytes);}}
            results.push(row);
        }catch{results.push({ref:ref.ref,commit:ref.sha,nombre:target.migration_name,codigo:'LECTURA_RAW_NO_DISPONIBLE'});}
    }
    const report={alcance:'ls-remote y HTTPS de archivos por commit; no fetch, checkout ni escrituras remotas',refs,resultados:results,nota:'Un 404 sin autenticación no distingue un archivo ausente de un repositorio privado; solo se recupera con coincidencia SHA256 exacta.'};
    fs.writeFileSync(path.join(out,'busqueda-remota.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({ramas:refs.length,consultas:results.length,originalesVerificados:results.filter(r=>r.coincide).length,estados:[...new Set(results.map(r=>r.status||r.codigo))]}));
}
main().catch(()=>{console.error('Búsqueda de lectura no completada; no se muestran credenciales.');process.exitCode=1;});
