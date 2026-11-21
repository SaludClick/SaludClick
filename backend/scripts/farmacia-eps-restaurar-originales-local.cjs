// Restaura únicamente archivos locales probados por SHA256; nunca ejecuta SQL.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function restaurar(){
 const audit=JSON.parse(fs.readFileSync(path.join(root,'docs/calidad/reportes/farmacia-usuarios-continuacion-readonly-2026-11-17.json'),'utf8'));
 const evidence=JSON.parse(fs.readFileSync(path.join(root,'docs/calidad/reportes/farmacia-eps-historial-remoto-2026-11-17.json'),'utf8'));
 return audit.historiaEps.filter(h=>['20261114090000_eps_workspace','20261115090000_eps_role_integration'].includes(h.migration_name)).map(h=>{
  const proof=evidence.candidatos.find(c=>c.nombre===h.migration_name&&c.coincide&&c.sha256===h.checksum);if(!proof)throw new Error('Falta evidencia verificable');
  const bytes=fs.readFileSync(path.join(root,'docs/calidad/reportes/originales-eps-recuperados',h.migration_name,'migration.sql'));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==h.checksum)throw new Error('Hash no coincide');
  const folder=path.join(root,'backend/prisma/migrations',h.migration_name);fs.mkdirSync(folder,{recursive:true});const to=path.join(folder,'migration.sql');
  if(fs.existsSync(to)){if(!fs.readFileSync(to).equals(bytes))throw new Error('Se conserva un archivo distinto, no sobrescribir');}else fs.writeFileSync(to,bytes,{flag:'wx'});
  return{nombre:h.migration_name,sha256:h.checksum,commit:proof.commit,restauradoLocal:true,sqlEjecutado:false};
 });
}
if(require.main===module)console.log(JSON.stringify(restaurar(),null,2));
module.exports={restaurar};
