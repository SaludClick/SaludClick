// Sin --execute solo presenta el plan. No ejecutar hasta confirmación expresa.
// Incluso con --execute rechaza un plan sin EPS validada y sin evidencia de respaldo.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { CAMPOS, leerCsv, importar } = require('../src/services/afiliados-import.service');
const MIGRACIONES = Object.freeze(['20261110230500_create_pacientes_autorizados','20261111160000_create_afiliados','20261111190000_normalize_paciente_role']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function validarPlan(plan, fuenteCsv, respaldo, pruebaEps, aprobacion) {
    if(plan.modo==='CONSULTA_ORIGEN_SIN_ESCRITURAS')throw new Error('El plan vigente requiere consulta del origen; no autoriza importaciones ni migraciones.');
    const expectedHost=process.env.AFILIADOS_EXPECTED_HOST;
    if(!expectedHost)throw new Error('Configura AFILIADOS_EXPECTED_HOST con el destino revisado antes de validar el plan.');
    if(plan.destino.servidor!==expectedHost||plan.destino.base!=='neondb'||plan.destino.esquema!=='public') throw new Error('Destino distinto al revisado.');
    if(!plan.respaldo.restauracionVerificada||sha(respaldo)!==plan.respaldo.sha256||sha(fuenteCsv)!==plan.csv.sha256) throw new Error('La fuente o el respaldo no coinciden con el plan.');
    if(plan.eps.validada!==true||!pruebaEps||sha(pruebaEps)!==plan.eps.sha256Fuente) throw new Error('Falta verificar la EPS con una fuente original.');
    const ids=JSON.parse(pruebaEps.toString('utf8')).map(e=>String(e.id));
    if(leerCsv(fuenteCsv.toString('utf8')).some(a=>!ids.includes(a.eps_id))) throw new Error('La fuente EPS no cubre todos los EPS ID originales.');
    if(plan.ejecucionProduccionAutorizada!==true||aprobacion!==sha(Buffer.from(JSON.stringify(plan)))) throw new Error('Falta confirmación del plan exacto.');
}
async function main() {
    require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
    const raiz=path.resolve(__dirname,'../..');
    const plan=JSON.parse(fs.readFileSync(path.join(raiz,'docs/calidad/reportes/afiliados-neon-plan.json')));
    if(plan.modo==='CONSULTA_ORIGEN_SIN_ESCRITURAS'){
        if(process.argv.includes('--execute'))throw new Error('Importaciones y migraciones deshabilitadas por el plan vigente.');
        console.log(JSON.stringify({modo:plan.modo,fuente:'EPS_DATABASE_URL',migraciones:[],importaciones:0,produccionModificada:false}));return;
    }
    if(!process.argv.includes('--execute')) {
        console.log(JSON.stringify({modo:'SOLO_PLAN',destino:plan.destino,existentes:plan.existentes,nuevos:plan.nuevos,migraciones:MIGRACIONES,eps:plan.eps,requiereConfirmacionFinal:true,produccionModificada:false}));return;
    }
    const fuente=fs.readFileSync(process.env.AFILIADOS_CSV);
    const backup=fs.readFileSync(path.resolve(raiz,plan.respaldo.archivo));
    const eps=process.env.AFILIADOS_EPS_SOURCE?fs.readFileSync(process.env.AFILIADOS_EPS_SOURCE):null;
    validarPlan(plan,fuente,backup,eps,process.env.AFILIADOS_CONFIRM_PLAN_SHA256);
    require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
    const url=new URL(process.env.DATABASE_URL);
    if(url.hostname!==plan.destino.servidor||url.pathname!=='/'+plan.destino.base||url.searchParams.has('host')||url.searchParams.has('options'))throw new Error('Conexión diferente al destino aprobado.');
    url.searchParams.set('sslmode','verify-full');
    const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:10000});
    const prisma=new PrismaClient({adapter:new PrismaPg(pool)});
    const cliente=await pool.connect();
    try {
        const id=(await cliente.query('SELECT current_database() AS base,current_schema() AS esquema')).rows[0];
        if(id.base!==plan.destino.base||id.esquema!=='public')throw new Error('Identidad efectiva incorrecta.');
        await cliente.query('BEGIN');
        try {
            await cliente.query("SELECT pg_advisory_xact_lock(hashtext('saludclick-afiliados-neon-plan'))");
            await cliente.query('LOCK TABLE public.usuarios,public.roles,public._prisma_migrations IN SHARE ROW EXCLUSIVE MODE');
            const {rows:[tablas]}=await cliente.query("SELECT to_regclass('public.afiliados') AS afiliados,to_regclass('public.pacientes_autorizados') AS pacientes,to_regclass('public.auditorias_pacientes_autorizados') AS auditorias");
            if(Object.values(tablas).some(Boolean))throw new Error('El esquema cambió: repetir preflight para evitar duplicados.');
            for(const m of MIGRACIONES) {
                const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/migrations',m,'migration.sql'),'utf8');
                if(sha(Buffer.from(sql))!==plan.migraciones.find(p=>p.nombre===m)?.sha256)throw new Error('Migración distinta a la revisada.');
                if((await cliente.query('SELECT 1 FROM public._prisma_migrations WHERE migration_name=$1',[m])).rowCount)throw new Error('Migración ya registrada; repetir preflight.');
                await cliente.query(sql);
                await cliente.query('INSERT INTO public._prisma_migrations (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),now(),1)',[crypto.randomUUID(),sha(Buffer.from(sql)),m]);
            }
            await cliente.query('COMMIT');
        } catch(e){await cliente.query('ROLLBACK');throw e;}
        const resultado=await importar(prisma,leerCsv(fuente.toString('utf8')));
        console.log(JSON.stringify({migraciones:MIGRACIONES,...resultado,cuentasCreadas:0}));
    } finally {cliente.release();await prisma.$disconnect();await pool.end();}
}
if(require.main===module)main().catch(()=>{console.error('Plan no ejecutado o incompleto. Revisar precondiciones y plan de reversión; no se muestran secretos ni datos personales.');process.exitCode=1;});
module.exports={validarPlan,MIGRACIONES};
