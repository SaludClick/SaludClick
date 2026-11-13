// Solo lectura. No modifica .env ni imprime conexiones completas o datos de afiliados.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const dotenv=require('dotenv');
const {Pool}=require('pg');
const raiz=path.resolve(__dirname,'../..');
const q=s=>'"'+s.replaceAll('"','""')+'"';
function leerArchivoHistorico() {
    const script=fs.readFileSync(path.join(__dirname,'support/auditar-archivo-eps.ps1'),'utf8');
    // stdout del subproceso se consume exclusivamente en memoria, nunca se registra.
    return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024}));
}
async function inspeccionar(urlOriginal) {
    const url=new URL(urlOriginal);
    if([...url.searchParams.keys()].some(k=>['host','hostaddr','port','dbname','database','user','password','service','options'].includes(k.toLowerCase())))throw new Error('Enrutamiento no permitido.');
    url.searchParams.set('sslmode','verify-full');
    const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:8000,statement_timeout:10000});
    let c;
    try {
        c=await pool.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const identidad=(await c.query('SELECT current_database() AS base,current_schema() AS esquema')).rows[0];
        const bases=(await c.query("SELECT datname AS nombre FROM pg_database WHERE NOT datistemplate AND has_database_privilege(current_user,oid,'CONNECT') ORDER BY datname")).rows;
        const columnas=(await c.query("SELECT table_schema AS esquema,table_name AS tabla,column_name AS campo,data_type AS tipo FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg_%' ORDER BY table_schema,table_name,ordinal_position")).rows;
        const relaciones=(await c.query("SELECT n.nspname AS esquema,r.relname AS tabla,pg_get_constraintdef(co.oid) AS definicion FROM pg_constraint co JOIN pg_class r ON r.oid=co.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE co.contype='f' AND pg_get_constraintdef(co.oid) ILIKE '%eps%' AND n.nspname NOT LIKE 'pg_%'")).rows;
        const candidatos=[...new Set(columnas.filter(x=>/(^|_)eps($|_)|entidad.*promotora|aseguradoras/i.test(x.tabla)).map(x=>x.esquema+'.'+x.tabla))];
        const catalogos=[];
        for(const candidato of candidatos) {
            const cols=columnas.filter(x=>x.esquema+'.'+x.tabla===candidato);
            const id=cols.find(x=>['id','eps_id','id_eps'].includes(x.campo));
            const nombre=cols.find(x=>['nombre','nombre_eps','razon_social','nombre_entidad','denominacion'].includes(x.campo));
            const tabla=q(cols[0].esquema)+'.'+q(cols[0].tabla);
            const total=(await c.query(`SELECT count(*)::int AS total FROM ${tabla}`)).rows[0].total;
            // Solo se consulta una entidad EPS; nunca se extraen personas ni cuentas.
            const registro=id&&nombre?(await c.query(`SELECT ${q(id.campo)}::text AS id,${q(nombre.campo)}::text AS nombre FROM ${tabla} WHERE ${q(id.campo)}::text=$1`,['1'])).rows:[];
            catalogos.push({tabla:candidato,total,columnas:cols.map(x=>x.campo),eps1:registro});
        }
        await c.query('ROLLBACK');
        return {servidor:url.hostname,puerto:url.port||'5432',...identidad,basesAccesibles:bases.map(b=>b.nombre),esquemas:[...new Set(columnas.map(x=>x.esquema))],tablas:[...new Set(columnas.map(x=>x.esquema+'.'+x.tabla))],relacionesEPS:relaciones,catalogosEPS:catalogos};
    }finally{if(c)c.release();await pool.end();}
}
async function main() {
    const historico=leerArchivoHistorico();
    const entornos=[...historico.entornos],historial=[];
    const variablesSesion=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(?:[A-Z_]+_)?DATABASE_URL$|^DIRECT_URL$/.test(k)));
    entornos.push({fuente:'entorno de proceso',texto:Object.entries(variablesSesion).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')});
    for(const archivo of ['backend/src/config/epsDatabase.js','backend/src/routes/eps.routes.js']){
        const texto=execFileSync('git',['show','ec95360:'+archivo],{cwd:raiz,encoding:'utf8',windowsHide:true});
        const urls=texto.match(/postgres(?:ql)?:\/\/[^\s'"`]+/g)||[];
        historial.push({commit:'ec95360',archivo,variables:[...new Set([...texto.matchAll(/process\.env\.([A-Z_0-9]+)/g)].map(m=>m[1]))],tablas:[...new Set([...texto.matchAll(/(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z_0-9]*)/gi)].map(m=>m[1]))],conexionesEncontradas:urls.length,referenciaNominal:texto.includes('EPS VidaPlena')?'EPS VidaPlena':null,mapeoId1DemostradoPorCodigo:false});
        urls.forEach(valor=>entornos.push({fuente:'git:ec95360:'+archivo,texto:'DATABASE_URL='+JSON.stringify(valor)}));
    }
    for(const archivo of ['backend/.env','frontend/.env','frontend/.env.local']) {const p=path.join(raiz,archivo);if(fs.existsSync(p))entornos.push({fuente:archivo,texto:fs.readFileSync(p,'utf8')});}
    const conexiones=new Map();
    for(const e of entornos)for(const [clave,valor]of Object.entries(dotenv.parse(e.texto))){if(!/^(?:[A-Z_]+_)?DATABASE_URL$|^DIRECT_URL$/.test(clave)||!/^postgres(?:ql)?:\/\//.test(valor))continue;const u=new URL(valor),key=u.hostname+':'+(u.port||'5432')+u.pathname;if(!conexiones.has(key))conexiones.set(key,{valor,fuentes:[]});conexiones.get(key).fuentes.push(e.fuente+':'+clave);}
    const destinos=[];
    for(const {valor,fuentes}of conexiones.values()) {
        try {
            const resultado=await inspeccionar(valor);destinos.push({fuentes,...resultado});
            // Las bases adicionales del mismo servicio solo se consultan si PostgreSQL
            // concede CONNECT; no se buscan hosts ajenos al proyecto.
            const original=new URL(valor);
            for(const base of resultado.basesAccesibles.filter(b=>b!==resultado.base)){
                const otra=new URL(original);otra.pathname='/'+encodeURIComponent(base);
                try{destinos.push({fuentes:[...fuentes,'base accesible del mismo servidor'],...await inspeccionar(otra.toString())});}catch(e){destinos.push({fuentes,servidor:original.hostname,base,estado:'No accesible en modo de lectura',codigo:e.code||e.name});}
            }
        }catch(e){const u=new URL(valor);destinos.push({fuentes,servidor:u.hostname,base:decodeURIComponent(u.pathname.slice(1)),estado:'No accesible en modo de lectura',codigo:e.code||e.name});}
    }
    const informe={fecha:new Date().toISOString(),archivoHistorico:{nombre:'SaludClick.zip',archivos:historico.archivos},historialGit:historial,conexionEpsHistoricaDisponible:entornos.some(e=>Boolean(dotenv.parse(e.texto).EPS_DATABASE_URL)),destinos,produccionModificada:false};
    fs.writeFileSync(path.join(raiz,'docs/calidad/reportes/afiliados-eps-origen.json'),JSON.stringify(informe,null,2)+'\n');
    console.log(JSON.stringify(informe));
}
if(require.main===module)main().catch(()=>{console.error('Auditoría EPS no completada; no se muestran secretos ni datos personales.');process.exitCode=1;});
