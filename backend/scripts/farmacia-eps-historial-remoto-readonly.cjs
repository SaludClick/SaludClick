// Solo ls-remote y GET públicos a GitHub; no fetch Git, refs, tokens o Neon.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const targets=[
 {nombre:'20261114090000_eps_workspace',sha256:'2f98aa07aec71b403cd38e1d721a570f3996b6be54bbfb400b7bc88f73c4e835'},
 {nombre:'20261115090000_eps_role_integration',sha256:'99b5dca81847e36f95f4f0d1372dd4598705abb5eb98f408ead9d7637212076e'}
];
async function main(){
 const r=spawnSync('git',['-c','credential.interactive=false','ls-remote','--heads','origin'],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
 if(r.status!==0)throw new Error('REMOTO_NO_DISPONIBLE');
 const refs=r.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>{const [sha,ref]=line.split(/\s+/);return{sha,ref};});
 const report={fecha:new Date().toISOString(),alcance:'ls-remote y GET públicos del historial GitHub por ruta y rama, sin fetch ni escrituras remotas',refs,consultas:[],candidatos:[],limitaciones:[]};
 const base='https://api.github.com/repos/SaludClick/SaludClick';
 async function get(url){try{const response=await fetch(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'SaludClick-readonly-forensics'},signal:AbortSignal.timeout(15000)});return{status:response.status,data:await response.json(),remaining:response.headers.get('x-ratelimit-remaining')};}catch{return{status:null};}}
 const info=await get(base);report.repositorio={status:info.status,publico:info.status===200?info.data.private===false:null};
 if(info.status!==200)report.limitaciones.push('API pública no accesible: no se puede distinguir falta de acceso de ausencia; se necesitan artefactos/autorización del propietario.');
 else for(const ref of refs)for(const target of targets){
  const file=`backend/prisma/migrations/${target.nombre}/migration.sql`;
  let page=1;
  while(true){
   const url=base+'/commits?'+new URLSearchParams({sha:ref.sha,path:file,per_page:'100',page:String(page)});
   const res=await get(url);report.consultas.push({ref:ref.ref,commit:ref.sha,nombre:target.nombre,pagina:page,status:res.status,commits:Array.isArray(res.data)?res.data.map(c=>c.sha):[],restantes:res.remaining});
   if(res.status!==200||!Array.isArray(res.data)){report.limitaciones.push('Consulta de historial no completada para '+ref.ref+'/'+target.nombre);break;}
   for(const entry of res.data){
    const raw=await fetch(`https://raw.githubusercontent.com/SaludClick/SaludClick/${entry.sha}/${file}`,{signal:AbortSignal.timeout(15000)}).catch(()=>null);
    const candidate={nombre:target.nombre,commit:entry.sha,status:raw?.status||null};
    if(raw?.ok){const bytes=Buffer.from(await raw.arrayBuffer());candidate.sha256=crypto.createHash('sha256').update(bytes).digest('hex');candidate.coincide=candidate.sha256===target.sha256;
     if(candidate.coincide){const folder=path.join(root,'docs/calidad/reportes/originales-eps-recuperados',target.nombre);fs.mkdirSync(folder,{recursive:true});const dest=path.join(folder,'migration.sql');if(fs.existsSync(dest)){if(!fs.readFileSync(dest).equals(bytes))throw new Error('ARTEFACTO_PREVIO_DISTINTO');}else fs.writeFileSync(dest,bytes,{flag:'wx'});}
    }
    report.candidatos.push(candidate);
   }
   if(res.data.length<100)break;
   if(++page>20){report.limitaciones.push('Límite de 2000 commits por ruta alcanzado, inspección incompleta');break;}
  }
 }
 const out=path.join(root,'docs/calidad/reportes/farmacia-eps-historial-remoto-2026-11-17.json');
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ramas:refs.length,api:report.repositorio,consultas:report.consultas.length,candidatos:report.candidatos.length,originalesExactos:report.candidatos.filter(c=>c.coincide).length,limitaciones:report.limitaciones}));
}
main().catch(()=>{console.error('Búsqueda de lectura no completada; no se muestran credenciales.');process.exitCode=1;});
