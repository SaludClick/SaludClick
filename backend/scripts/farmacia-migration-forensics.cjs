// Solo Git/archivos locales. No carga .env, no conecta ni modifica refs/stash.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const out=path.join(root,'docs/calidad/activacion-farmacia-2026-11-17/resolucion-bloqueos');
const audit=JSON.parse(fs.readFileSync(path.join(out,'../auditoria-readonly.json'),'utf8'));
const targets=audit.destino.historial.filter(h=>!h.archivoLocal);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(prefix,args,input){const r=spawnSync('git',[...prefix,...args],{cwd:root,input,windowsHide:true,maxBuffer:128*1024*1024});if(r.status!==0)throw new Error('Lectura Git no disponible: '+args[0]);return r.stdout;}
function variants(buffer){
 const text=buffer.toString('utf8'),base=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 return [['bytes_originales',buffer],['LF_sin_BOM',Buffer.from(base)],['CRLF_sin_BOM',Buffer.from(base.replace(/\n/g,'\r\n'))],['LF_un_salto_final',Buffer.from(base.replace(/\n*$/,'')+'\n')],['LF_sin_salto_final',Buffer.from(base.replace(/\n*$/,''))]];
}
function inspect(){
 const found=new Map(),sources=[],errors=[];
 const locations=[{nombre:'repositorio_actual',prefix:[]},{nombre:'git_backup_usuario',prefix:['--git-dir='+path.resolve(root,'../.git_backup')]}];
 for(const location of locations){
  try{
   const listed=git(location.prefix,['cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype) %(objectsize)']).toString('utf8').trim().split('\n').map(s=>s.trim().split(' '));
   const candidates=listed.filter(([,type,size])=>type==='blob'&&Number(size)<=2*1024*1024).map(([id])=>id);
   sources.push({origen:location.nombre,objetos:listed.length,blobsExaminados:candidates.length});
   for(let start=0;start<candidates.length;start+=50){
    const ids=candidates.slice(start,start+50),buffer=git(location.prefix,['cat-file','--batch'],ids.join('\n')+'\n');let offset=0;
    for(const id of ids){const end=buffer.indexOf(10,offset);const header=buffer.subarray(offset,end).toString('ascii').split(' ');const size=Number(header[2]);if(!Number.isFinite(size))throw new Error('Respuesta de cat-file incompleta');const content=buffer.subarray(end+1,end+1+size);offset=end+size+2;
     const digest=sha(content),target=targets.find(t=>t.checksum===digest);
     if(target&&!found.has(target.migration_name))found.set(target.migration_name,{buffer:Buffer.from(content),proveniencia:{origen:location.nombre,gitBlob:id,sha256:digest,transformacion:'ninguna'}});
    }
   }
  }catch{errors.push({origen:location.nombre,codigo:'LECTURA_GIT_NO_DISPONIBLE'});}
 }
 // Recuperar únicamente SQL literal de llamadas históricas, nunca ejecutar el
 // código guardado en una sesión. Un resultado solo se acepta por SHA256 exacto.
 const sessions=path.resolve(root,'../.codex/sessions');
 const listing=spawnSync('rg',['-l','-F',...targets.filter(t=>!fs.existsSync(path.join(root,'backend/prisma/migrations',t.migration_name,'migration.sql'))).flatMap(t=>['-e',t.migration_name]),sessions,'-g','*.jsonl'],{windowsHide:true,maxBuffer:2*1024*1024,encoding:'utf8'});
 const files=listing.status===0?listing.stdout.trim().split(/\r?\n/).filter(Boolean):[];
 const hits=[];
 function examine(text,origin,level=0){
  if(level>3||typeof text!=='string'||text.length>4*1024*1024)return;
  for(const target of targets.filter(t=>!found.has(t.migration_name))){
   if(!text.includes(target.migration_name))continue;
   const pieces=[text];
   for(const m of text.matchAll(/tools\.apply_patch\(\s*("(?:\\.|[^"\\])*")/g))try{pieces.push(JSON.parse(m[1]));}catch{}
   for(const m of text.matchAll(/@['"]\r?\n([\s\S]*?)\r?\n['"]@/g))pieces.push(m[1]);
   for(const m of text.matchAll(/`((?:\\.|[^`\\])*)`/g)){pieces.push(m[1]);pieces.push(m[1].replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\`/g,'`'));}
   for(const m of text.matchAll(/(?:'''|""")([\s\S]*?)(?:'''|""")/g))pieces.push(m[1]);
   for(const piece of pieces){
    const escaped=target.migration_name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const patch=new RegExp('\\*\\*\\* Add File: [^\\n]*'+escaped+'[\\\\/]migration\\.sql\\r?\\n([\\s\\S]*?)(?=\\*\\*\\* (?:Add|Update|Delete|End)|$)');
    const match=patch.exec(piece);
    const raw=match?match[1].split(/\r?\n/).filter(line=>line.startsWith('+')).map(line=>line.slice(1)).join('\n'):piece;
    const attempts=[raw,raw+'\n'];
    for(const value of attempts)for(const [transform,bytes] of variants(Buffer.from(value))){
     if(sha(bytes)!==target.checksum)continue;
     found.set(target.migration_name,{buffer:bytes,proveniencia:{origen:'registro_historico_local',...origin,transformacion:transform,sha256:target.checksum}});
    }
   }
   if(/CREATE\s+(?:TABLE|UNIQUE\s+INDEX)/i.test(text)&&!found.has(target.migration_name))hits.push({...origin,nombre:target.migration_name,longitud:text.length,patch:text.includes('*** Add File:'),heredoc:/@['"]/.test(text)});
  }
  try{walk(JSON.parse(text),origin,level+1);}catch{}
 }
 function walk(value,origin,level=0){if(typeof value==='string')examine(value,origin,level);else if(Array.isArray(value))for(const x of value)walk(x,origin,level);else if(value&&typeof value==='object')for(const x of Object.values(value))walk(x,origin,level);}
 for(const file of files){const lines=fs.readFileSync(file,'utf8').split('\n');for(let i=0;i<lines.length;i++)if(targets.some(t=>lines[i].includes(t.migration_name))){try{walk(JSON.parse(lines[i]),{archivo:path.relative(path.resolve(root,'..'),file).replaceAll('\\','/'),linea:i+1});}catch{}}}
 sources.push({origen:'registros_codex_locales',archivosExaminados:files.length,candidatosSQL:hits.length});
 const comparaciones=targets.map(t=>{
  const file=path.join(root,'backend/prisma/migrations',t.migration_name,'migration.sql');
  const current=fs.existsSync(file)?fs.readFileSync(file):null;
  const equivalent=current?variants(current).find(([,bytes])=>sha(bytes)===t.checksum):null;
  if(equivalent&&!found.has(t.migration_name))found.set(t.migration_name,{buffer:equivalent[1],proveniencia:{origen:'archivo_local',ruta:path.relative(root,file).replaceAll('\\','/'),transformacion:equivalent[0],sha256:t.checksum}});
  const recovered=found.get(t.migration_name);
  const normalized=b=>b.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  return {nombre:t.migration_name,sha256Aplicado:t.checksum,sha256Local:current?sha(current):null,recuperada:!!recovered,soloFormato:!!(current&&recovered&&normalized(current)===normalized(recovered.buffer)),coincidenciaVariante:equivalent?.[0]||null,proveniencia:recovered?.proveniencia||null};
 });
 return {report:{alcance:'Archivos, objetos Git y SQL literal de sesiones locales; sin ejecutar código histórico ni escribir en Git/Neon',auditoriaReferencia:audit.fecha,fuentes:sources,errores:errors,candidatosHistoricosNoVerificados:hits,comparaciones},found};
}
if(require.main===module){
 const {report,found}=inspect();fs.mkdirSync(out,{recursive:true});
 const reportPath=path.join(out,'forense-migraciones.json');
 if(fs.existsSync(reportPath)){
  const prior=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  for(const item of report.comparaciones){const saved=prior.comparaciones.find(x=>x.nombre===item.nombre)?.correccionLocal;if(saved&&saved.sha256Despues===item.sha256Aplicado&&item.sha256Local===item.sha256Aplicado)item.correccionLocal=saved;}
 }
 for(const [name,data] of found){const folder=path.join(out,'originales-verificados',name);fs.mkdirSync(folder,{recursive:true});const target=path.join(folder,'migration.sql');if(fs.existsSync(target)&&sha(fs.readFileSync(target))!==sha(data.buffer))throw new Error('Se conserva un artefacto distinto; no sobrescribir');fs.writeFileSync(target,data.buffer);}
 if(process.argv.includes('--corregir-solo-formato'))for(const item of report.comparaciones.filter(x=>x.soloFormato)){
  const target=path.join(root,'backend/prisma/migrations',item.nombre,'migration.sql'),actual=fs.readFileSync(target);
  const backup=path.join(out,'bytes-previos',item.nombre,'migration.sql');fs.mkdirSync(path.dirname(backup),{recursive:true});
  if(!fs.existsSync(backup))fs.writeFileSync(backup,actual);
  const exacto=found.get(item.nombre).buffer;if(sha(exacto)!==item.sha256Aplicado)throw new Error('Hash histórico no verificado');
  fs.writeFileSync(target,exacto);item.correccionLocal={sha256Antes:sha(actual),sha256Despues:sha(exacto),respaldo:path.relative(root,backup).replaceAll('\\','/')};
 }
 fs.writeFileSync(path.join(out,'forense-migraciones.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,candidatosHistoricosNoVerificados:report.candidatosHistoricosNoVerificados.length},null,2));
}
module.exports={inspect,variants};
