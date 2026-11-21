require('./support/isolate-database.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');const {Prisma}=require('@prisma/client');
test('PostgreSQL: Usuarios usa fuente original, filtra EPS en SQL, pagina, cuenta y refleja cambios sin copiar',async()=>{
    const db=new PGlite();
    try{
        await db.exec(`CREATE SCHEMA eps_original;CREATE TABLE eps_original.afiliados(id text PRIMARY KEY,nombres text,apellidos text,estado text,eps_id text,documento text,tipo_documento text,correo text);
          INSERT INTO eps_original.afiliados VALUES('a','Ana','Alba','Activo','1','100','CC','ana@example.test'),('b','Beto','Bravo','ACTIVO','1','200','TI',NULL),('c','Otra','Persona','Activo','2','300','CC','ajena@example.test'),('d','No','Visible','Inactivo','1','400','CC',NULL);`);
        const wrap=tx=>({
            $executeRaw:async(strings,...values)=>{const q=Prisma.sql(strings,...values);return tx.query(q.text,q.values);},
            $queryRaw:async(strings,...values)=>{const q=Array.isArray(strings)?Prisma.sql(strings,...values):strings;return(await tx.query(q.text,q.values)).rows;}
        });
        const source=require('../src/repositories/afiliados-origen.repository').crearOrigen({obtenerConexion:()=>({esquema:'eps_original',prisma:{$transaction:fn=>db.transaction(tx=>fn(wrap(tx)))}})});
        let result=await source.leerAutorizados('1',{buscar:'',pagina:1,take:1});assert.equal(result.totalActivos,2);assert.equal(result.pacientes.length,1);assert.equal(result.pacientes[0].identificador,'a');
        result=await source.leerAutorizados('1',{buscar:'',pagina:2,take:1});assert.equal(result.pacientes[0].identificador,'b');
        result=await source.leerAutorizados('1',{buscar:'ANA',inicial:'A'});assert.equal(result.total,1);assert.equal(result.pacientes[0].nombres,'Ana');
        await db.query("UPDATE eps_original.afiliados SET nombres='Actualizada' WHERE id='a'");
        result=await source.leerAutorizados('1',{buscar:'Actualizada'});assert.equal(result.total,1);assert.equal(result.pacientes[0].nombres,'Actualizada');
        assert.deepEqual(Object.keys(result.pacientes[0]).sort(),['apellidos','correo','documento','estado','identificador','nombres','tipo_documento']);
        result=await source.leerAutorizados('1',{buscar:'ANA@EXAMPLE.TEST'});assert.equal(result.total,1);assert.equal(result.pacientes[0].identificador,'a');
        result=await source.leerAutorizados('1',{tipo_documento:'TI'});assert.equal(result.total,1);assert.equal(result.pacientes[0].correo,null);
        await db.query("UPDATE eps_original.afiliados SET correo='vigente@example.test' WHERE id='a'");
        assert.equal((await source.leerAutorizados('1',{buscar:'vigente@example.test'})).pacientes[0].correo,'vigente@example.test');
        assert.equal((await source.leerAutorizados('1',{buscar:'ajena@example.test'})).total,0);
        result=await source.leerAutorizados('1',{buscar:'100'});assert.equal(result.total,1);assert.equal(result.pacientes[0].documento,'100');
        assert.equal((await source.leerAutorizados('1',{buscar:'300'})).total,0);
        assert.equal(await source.cuentaAutorizada('1','a','100','CC'),true);
        assert.equal(await source.cuentaAutorizada('1','a','100','TI'),false);
        assert.equal(await source.cuentaAutorizada('1','a','0100','CC'),false);
        assert.equal(await source.cuentaAutorizada('1','a','100',null),false);
        await db.exec("INSERT INTO eps_original.afiliados VALUES('duplicado','Duplicado','Revisar','Activo','1','100','CC',NULL)");
        assert.equal(await source.cuentaAutorizada('1','a','100','CC'),false);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='afiliados'")).rows[0].n,0);
    }finally{await db.close();}
});
