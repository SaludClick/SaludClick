require('./support/isolate-database.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
test('Usuarios: índice mínimo y reversión exacta conservan otras farmacias, cuentas, afiliados e historial',async()=>{
    const db=new PGlite();
    try{
        await db.exec(`CREATE TABLE usuarios(id integer PRIMARY KEY,rol_id integer,estado text);
          INSERT INTO usuarios VALUES(901,1,'ACTIVO'),(904,3,'ACTIVO'),(905,3,'ACTIVO'),(908,2,'ACTIVO');
          CREATE TABLE eps_farmacias(id serial PRIMARY KEY,eps_id text,farmacia_id integer,activa boolean,version integer);
          INSERT INTO eps_farmacias(id,eps_id,farmacia_id,activa,version)
          VALUES(951,'EPS-FIXTURE-901',904,true,1),(952,'EPS-FIXTURE-902',905,true,7);
          CREATE TABLE afiliados(id text PRIMARY KEY,documento text);
          INSERT INTO afiliados VALUES('AFILIADO-FIXTURE','DOC-FIXTURE-908');
          CREATE TABLE administrative_audit(actor_id integer,accion text,entidad text,registro_id text,resultado text,campos text[]);`);
        const indice=fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261115120000_farmacia_eps_unica/migration.sql'),'utf8');
        const sql=fs.readFileSync(path.join(__dirname,'fixtures/farmacia-usuarios-reversion/revertir-vinculo.sql'),'utf8');
        await db.exec(indice);
        await assert.rejects(db.query("INSERT INTO eps_farmacias(eps_id,farmacia_id,activa,version) VALUES('EPS-FIXTURE-902',904,true,1)"),e=>e.code==='23505' && e.constraint==='eps_farmacias_una_eps_activa_key');
        const beforeUsers=(await db.query('SELECT * FROM usuarios ORDER BY id')).rows;
        const beforeAffiliates=(await db.query('SELECT * FROM afiliados ORDER BY id')).rows;
        await assert.rejects(db.exec(sql),/Faltan/);await db.exec('ROLLBACK');
        for(const [name,value] of Object.entries({actor_admin:'904',vinculo_id:'951',vinculo_version:'1',aprobacion_reversion:'ACTA-LOCAL-SINTETICA'}))await db.query('SELECT set_config($1,$2,false)',['saludclick.'+name,value]);
        await assert.rejects(db.exec(sql),/Administrador no vigente/);await db.exec('ROLLBACK');
        await db.exec("SELECT set_config('saludclick.actor_admin','901',false),set_config('saludclick.vinculo_id','952',false),set_config('saludclick.vinculo_version','7',false)");
        await assert.rejects(db.exec(sql),/El vínculo cambió/);await db.exec('ROLLBACK');
        await db.exec("SELECT set_config('saludclick.vinculo_id','951',false),set_config('saludclick.vinculo_version','99',false)");
        await assert.rejects(db.exec(sql),/El vínculo cambió/);await db.exec('ROLLBACK');
        await db.query("SELECT set_config('saludclick.vinculo_version','1',false)");
        await db.exec(sql);
        assert.deepEqual((await db.query('SELECT * FROM eps_farmacias ORDER BY id')).rows,[
            {id:951,eps_id:'EPS-FIXTURE-901',farmacia_id:904,activa:false,version:2},
            {id:952,eps_id:'EPS-FIXTURE-902',farmacia_id:905,activa:true,version:7}
        ]);
        assert.deepEqual((await db.query('SELECT * FROM administrative_audit')).rows,[
            {actor_id:901,accion:'DESVINCULAR_EPS',entidad:'FARMACIA',registro_id:'904',resultado:'EXITO',campos:['eps_id','activa']}
        ]);
        assert.deepEqual((await db.query('SELECT * FROM usuarios ORDER BY id')).rows,beforeUsers);
        assert.deepEqual((await db.query('SELECT * FROM afiliados ORDER BY id')).rows,beforeAffiliates);
        await assert.rejects(db.exec(sql),/El vínculo cambió/);await db.exec('ROLLBACK');
        assert.equal((await db.query('SELECT * FROM administrative_audit')).rows.length,1);
    }finally{await db.close();}
});
