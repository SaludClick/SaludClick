// Restaura y ensaya el plan exclusivamente en el clon local dedicado. Nunca acepta Neon.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Pool } = require('pg');
const { leerCsv, importar, CAMPOS } = require('../src/services/afiliados-import.service');
const MIGRACIONES = ['20261110230500_create_pacientes_autorizados','20261111160000_create_afiliados','20261111190000_normalize_paciente_role'];
const q = s => '"'+s.replaceAll('"','""')+'"';
async function huella(cliente,t) { return (await cliente.query(`SELECT count(*)::int AS total,md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) AS huella FROM ${q(t.esquema)}.${q(t.tabla)} t`)).rows[0]; }
async function main() {
    const url = new URL(process.env.AFILIADOS_PREFLIGHT_DATABASE_URL);
    if(url.hostname!=='127.0.0.1'||url.port!=='55435'||url.pathname!=='/saludclick_neon_preflight'||url.search||!url.username||!url.password) throw new Error('Destino aislado rechazado.');
    const baseInforme = path.resolve(__dirname,'../../docs/calidad/reportes');
    const preflight = JSON.parse(fs.readFileSync(path.join(baseInforme,'afiliados-neon-preflight.json')));
    const originales = leerCsv(fs.readFileSync(process.env.AFILIADOS_CSV,'utf8'));
    const bytes = fs.readFileSync(process.env.AFILIADOS_BACKUP_FILE);
    assert.equal(bytes.subarray(0,5).toString(),'PGDMP');
    const pool = new Pool({connectionString:url.toString(),connectionTimeoutMillis:2000});
    let prisma, appPool, server;
    const cliente = await pool.connect();
    try {
        assert.equal((await cliente.query('SELECT current_database() AS nombre')).rows[0].nombre,'saludclick_neon_preflight');
        assert.equal((await cliente.query("SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].total,0,'El clon debe estar vacío antes de restaurar.');
        const restaurar = spawn('docker',['exec','-i','saludclick-neon-preflight-20261111','pg_restore','-U','postgres','-d','saludclick_neon_preflight','--no-owner','--no-acl','--exit-on-error'],{windowsHide:true,stdio:['pipe','ignore','pipe']});
        // Nunca imprimir errores de pg_restore: pueden incluir contenidos del respaldo.
        restaurar.stderr.resume(); restaurar.stdin.on('error',()=>{}); restaurar.stdin.end(bytes);
        const [codigo] = await once(restaurar,'close'); assert.equal(codigo,0,'Restauración no completada.');
        for(const t of preflight.inventario) assert.deepEqual(await huella(cliente,t),{total:t.total,huella:t.huella},'La restauración no coincide con el inventario de origen.');
        const tablasRecuperadas = preflight.inventario.length;
        const filasRecuperadas = preflight.inventario.reduce((n,t)=>n+t.total,0);
        const rolesAntes = (await cliente.query('SELECT id,nombre FROM roles ORDER BY id')).rows;
        const cambios = MIGRACIONES.map(nombre=>({nombre,sql:fs.readFileSync(path.resolve(__dirname,'../prisma/migrations',nombre,'migration.sql'),'utf8')}));
        await cliente.query('BEGIN');
        try {
            for(const m of cambios) {
                await cliente.query(m.sql);
                await cliente.query('INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),now(),1)',[crypto.randomUUID(),crypto.createHash('sha256').update(m.sql).digest('hex'),m.nombre]);
            }
            await cliente.query('COMMIT');
        } catch(e) { await cliente.query('ROLLBACK'); throw e; }
        process.env.DATABASE_URL=url.toString(); process.env.JWT_SECRET='afiliados-clon-preflight-only';
        prisma=require('../src/config/prisma'); appPool=require('../src/config/database');
        const primera=await importar(prisma,originales), segunda=await importar(prisma,originales);
        assert.deepEqual(primera,{nuevos:50,validados:50}); assert.deepEqual(segunda,{nuevos:0,validados:50});
        const almacenados=await prisma.afiliado.findMany(); assert.equal(almacenados.length,50);
        for(const a of originales) { const b=almacenados.find(r=>r.id===a.id); assert.ok(b); for(const c of CAMPOS) assert.equal(b[c],a[c],'Un valor original no coincide.'); assert.equal(b.usuario_id,null); }
        for(const t of preflight.inventario.filter(t=>!['roles','_prisma_migrations'].includes(t.tabla))) assert.deepEqual(await huella(cliente,t),{total:t.total,huella:t.huella},'Se alteró una tabla fuera del plan.');
        const rolesDespues=(await cliente.query('SELECT id,nombre FROM roles ORDER BY id')).rows;
        assert.deepEqual(rolesDespues,rolesAntes.map(r=>r.id===2?{...r,nombre:'PACIENTE'}:r));
        const express=require('express'), jwt=require('jsonwebtoken'); const app=express();
        app.use(express.json()); app.use('/api/admin/afiliados',require('../src/routes/afiliados.routes'));
        server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
        const admin=await prisma.usuario.findFirst({where:{rol_id:1},select:{id:true}}); assert.ok(admin,'El respaldo no contiene administrador.');
        const base=`http://127.0.0.1:${server.address().port}/api/admin/afiliados`;
        const headers={Authorization:`Bearer ${jwt.sign({id:admin.id,rol_id:1},process.env.JWT_SECRET,{expiresIn:'2m'})}`};
        const ids=new Set();
        for(let pagina=1;pagina<=5;pagina++) { const r=await fetch(base+`?pagina=${pagina}`,{headers}); assert.equal(r.status,200);const data=await r.json();assert.equal(data.total,50);assert.equal(data.afiliados.length,10);data.afiliados.forEach(a=>ids.add(a.id)); }
        assert.equal(ids.size,50);
        for(const a of originales) { const r=await fetch(base+'/'+encodeURIComponent(a.id),{headers});assert.equal(r.status,200);const d=await r.json();for(const c of CAMPOS) assert.equal(d.afiliado[c],a[c]);assert.equal(d.puedeCrearCuenta,false); }
        // No se crean cuentas ni autorizaciones. El ensayo conserva los usuarios del respaldo.
        const informe={fecha:new Date().toISOString(),destinoProduccion:preflight.destino,clon:{servidor:url.hostname,puerto:url.port,base:'saludclick_neon_preflight',version:'PostgreSQL 18'},respaldo:{archivo:path.relative(path.resolve(__dirname,'../..'),process.env.AFILIADOS_BACKUP_FILE).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),restauracionVerificada:true,tablasRecuperadas,filasRecuperadas,huellasCoinciden:true},migracionesEnsayadas:cambios.map(m=>m.nombre),importacion:{primera,segunda,camposVerificados:650,cuentasCreadas:0},api:{http:200,paginas:5,detalles:50},integridad:{tablasExistentesSinCambios:true,unicoCambioDeDatosPrevios:'roles.id=2: usuario → PACIENTE'},eps:{validada:false,motivo:'No hay maestro ni relación EPS en el destino. Se requiere una fuente original validada.'},produccionModificada:false};
        fs.writeFileSync(path.join(baseInforme,'afiliados-neon-ensayo.json'),JSON.stringify(informe,null,2)+'\n');console.log(JSON.stringify(informe));
    } finally { if(server) await new Promise(r=>server.close(r));if(prisma)await prisma.$disconnect();if(appPool)await appPool.end();cliente.release();await pool.end(); }
}
main().catch(e=>{console.error(JSON.stringify({error:'Ensayo aislado no completado; no se publican datos personales ni credenciales.',codigo:e.code||e.name}));process.exitCode=1;});
