// Solo SELECT a la fuente original y GET al backend; nunca importa o migra datos.
const fs=require('node:fs');
const path=require('node:path');
const {CAMPOS,leerCsv}=require('../src/services/afiliados-import.service');
async function main(){
    require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
    const origen=require('../src/repositories/afiliados-origen.repository');
    const {afiliados,conexion}=await origen.leer();
    let coincidenciasCsv=null,camposCoincidentes=null;
    if(process.env.AFILIADOS_CSV){const originales=leerCsv(fs.readFileSync(process.env.AFILIADOS_CSV,'utf8'));coincidenciasCsv=0;camposCoincidentes=0;for(const a of originales){const b=afiliados.find(b=>b.documento===a.documento);if(b){camposCoincidentes+=CAMPOS.filter(c=>a[c]===b[c]).length;if(CAMPOS.every(c=>a[c]===b[c]))coincidenciasCsv++;}}}
    console.log(JSON.stringify({conexion,registrosOrigen:afiliados.length,registrosCsvIdenticos:coincidenciasCsv,camposCsvIdenticos:camposCoincidentes,registrosConEpsConfirmada:afiliados.filter(a=>a.eps).length}));
    if(process.env.AFILIADOS_CHECK_ORIGIN){
        const prisma=require('../src/config/prisma');
        try{
            const admin=await prisma.usuario.findFirst({where:{rol_id:1},select:{id:true}});
            if(!admin)throw new Error('No hay administrador registrado para la comprobación GET.');
            const token=require('jsonwebtoken').sign({id:admin.id,rol_id:1},process.env.JWT_SECRET,{expiresIn:'2m'});
            const url=new URL('/api/admin/afiliados?pagina=1',process.env.AFILIADOS_CHECK_ORIGIN);
            if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('La comprobación GET se limita al backend local.');
            const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});const d=await r.json();
            console.log(JSON.stringify({backendHttp:r.status,totalBackend:d.total??null,primeraPagina:Array.isArray(d.afiliados)?d.afiliados.length:null,codigo:d.codigo,mensaje:d.ok===false?d.mensaje:undefined}));
        }finally{await prisma.$disconnect();await require('../src/config/database').end();}
    }
}
main().catch(e=>{console.error(JSON.stringify({codigo:e.codigo||'EPS_SOURCE_UNAVAILABLE',mensaje:e.status?e.message:'No fue posible verificar la fuente autorizada. No se muestran credenciales ni datos personales.',registrosOrigen:null,totalBackend:null}));process.exitCode=1;}).finally(()=>require('../src/config/eps-prisma').cerrarConexionEPS());
