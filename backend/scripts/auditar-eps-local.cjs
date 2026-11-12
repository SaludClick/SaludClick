// Consulta directa de los contenedores activos y copias de SOLO LECTURA de los
// volúmenes detenidos. No inicia ni modifica los contenedores originales detenidos.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const ejecutar=promisify(execFile);
const q=s=>'"'+s.replaceAll('"','""')+'"';
async function docker(args){return(await ejecutar('docker',args,{windowsHide:true,maxBuffer:4*1024*1024,timeout:45000})).stdout.trim();}
async function consulta(contenedor,usuario,base,sql){return JSON.parse(await docker(['exec',contenedor,'psql','-U',usuario,'-d',base,'-qAt','-v','ON_ERROR_STOP=1','-c',`BEGIN READ ONLY; SELECT coalesce(json_agg(x),'[]'::json) FROM (${sql}) x; ROLLBACK;`]));}
async function examinar(contenedor,usuario){
    const bases=await consulta(contenedor,usuario,'postgres',"SELECT datname AS nombre FROM pg_database WHERE NOT datistemplate AND has_database_privilege(current_user,oid,'CONNECT') ORDER BY datname");
    const resultados=[];
    for(const {nombre:base}of bases){
        const columnas=await consulta(contenedor,usuario,base,"SELECT table_schema AS esquema,table_name AS tabla,column_name AS campo FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_%' ORDER BY table_schema,table_name,ordinal_position");
        const referencias=await consulta(contenedor,usuario,base,"SELECT n.nspname AS esquema,r.relname AS tabla,pg_get_constraintdef(co.oid) AS definicion FROM pg_constraint co JOIN pg_class r ON r.oid=co.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE co.contype='f' AND pg_get_constraintdef(co.oid) ILIKE '%eps%' AND n.nspname NOT LIKE 'pg_%'");
        const candidatos=[...new Set(columnas.filter(c=>/(^|_)eps($|_)|entidad.*promotora|aseguradoras/i.test(c.tabla)).map(c=>c.esquema+'.'+c.tabla))];
        const catalogos=[];
        for(const tabla of candidatos){
            const cols=columnas.filter(c=>c.esquema+'.'+c.tabla===tabla),id=cols.find(c=>['id','eps_id','id_eps'].includes(c.campo)),nombre=cols.find(c=>['nombre','nombre_eps','razon_social','nombre_entidad','denominacion'].includes(c.campo));
            const entidad=id&&nombre?await consulta(contenedor,usuario,base,`SELECT ${q(id.campo)}::text AS id,${q(nombre.campo)}::text AS nombre FROM ${q(cols[0].esquema)}.${q(cols[0].tabla)} WHERE ${q(id.campo)}::text='1'`):[];
            catalogos.push({tabla,columnas:cols.map(c=>c.campo),eps1:entidad});
        }
        resultados.push({base,esquemas:[...new Set(columnas.map(c=>c.esquema))],tablas:[...new Set(columnas.map(c=>c.esquema+'.'+c.tabla))],referenciasEPS:referencias,catalogosEPS:catalogos});
    }
    return resultados;
}
async function main(){
    const fuentes=['saludclick-neon-preflight-20261111','saludclick-afiliados-validate-20261111','saludclick-postgres-roles-validate','saludclick-postgres-test-copy-20261110','saludclick-postgres-test'];
    const resultados=[];
    for(const fuente of fuentes){
        let copia,volumen;
        try{
            const info=JSON.parse(await docker(['inspect',fuente]))[0];
            const usuario=(info.Config.Env.find(v=>v.startsWith('POSTGRES_USER='))||'POSTGRES_USER=postgres').slice(14);
            let contenedor=fuente;
            if(!info.State.Running){
                const montaje=info.Mounts.find(m=>m.Type==='volume'&&m.Destination==='/var/lib/postgresql/data');
                if(!montaje||info.Config.Image!=='postgres:17')throw new Error('Volumen no reconocido.');
                const nonce=crypto.randomUUID().slice(0,8);copia='saludclick-eps-audit-'+nonce;volumen='saludclick_eps_audit_'+nonce;
                await docker(['volume','create',volumen]);
                await docker(['run','--rm','-v',`${montaje.Name}:/source:ro`,'-v',`${volumen}:/audit-copy`,'postgres:17','sh','-c','cp -a /source/. /audit-copy/']);
                await docker(['run','-d','--name',copia,'-v',`${volumen}:/var/lib/postgresql/data`,'postgres:17']);
                contenedor=copia;let listo=false;
                for(let i=0;i<25;i++){try{await docker(['exec',copia,'pg_isready','-U',usuario]);listo=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
                if(!listo)throw new Error('La copia no inició.');
            }
            resultados.push({fuente,modo:copia?'Copia temporal de volumen original montado solo lectura':'Consulta READ ONLY de contenedor activo',bases:await examinar(contenedor,usuario)});
        }catch(e){resultados.push({fuente,estado:'Auditoría no completada',codigo:typeof e.code==='string'?e.code:e.name});}
        finally{
            // Solo elimina recursos temporales creados por esta ejecución con nonce.
            if(copia&&/^saludclick-eps-audit-[0-9a-f]{8}$/.test(copia))await docker(['rm','-f',copia]).catch(()=>{});
            if(volumen&&/^saludclick_eps_audit_[0-9a-f]{8}$/.test(volumen))await docker(['volume','rm',volumen]).catch(()=>{});
        }
    }
    const informe={fecha:new Date().toISOString(),fuentes:resultados,volumenesOriginalesModificados:false,produccionModificada:false};
    fs.writeFileSync(path.resolve(__dirname,'../../docs/calidad/reportes/afiliados-eps-local.json'),JSON.stringify(informe,null,2)+'\n');console.log(JSON.stringify(informe));
}
main().catch(()=>{console.error('Auditoría local no completada; no se muestran datos personales ni credenciales.');process.exitCode=1;});
