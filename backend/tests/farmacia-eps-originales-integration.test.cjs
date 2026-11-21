// Ensayo aislado: ejecuta los ORIGINALES recuperados en PGlite, nunca en Neon.
require('./support/isolate-database.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),{Prisma}=require('@prisma/client');
test('EPS originales exactos: solo índice/vínculo habilitan 50 afiliados originales sin copiar ni dar acceso a otra farmacia',async()=>{
 const db=new PGlite(),sourceDb=new PGlite();
 try{
  for(const name of ['20261016220827_init','20261112120000_administrative_workspace','20261114090000_eps_workspace','20261115090000_eps_role_integration'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations',name,'migration.sql'),'utf8'));
  await db.exec(`INSERT INTO roles(id,nombre) VALUES(1,'ADMINISTRADOR'),(2,'PACIENTE'),(3,'FARMACIA'),(4,'EPS');
   INSERT INTO usuarios(id,nombre,apellido,correo,password,rol_id,estado) VALUES(1,'Admin','Fixture','a@test','hash',1,'ACTIVO'),(4,'Farmacia','Fixture','f@test','hash',3,'ACTIVO'),(5,'Otra','Farmacia','o@test','hash',3,'ACTIVO'),(6,'EPS','Fixture','e@test','hash',4,'ACTIVO');
   INSERT INTO eps_entidades(id,nombre,nit,correo,telefono,direccion,ciudad) VALUES('1','EPS VidaPlena','nit1','eps@test','1','d','c'),('2','Otra EPS','nit2','otra@test','2','d','c');`);
  await sourceDb.exec(`CREATE TABLE afiliados(id text PRIMARY KEY,nombres text,apellidos text,tipo_documento text,documento text,correo text,estado text,eps_id text);
   INSERT INTO afiliados SELECT 'vp-'||i,'Paciente '||lpad(i::text,2,'0'),'Prueba','CC','00'||i,'vp'||i||'@example.test','Activo','1' FROM generate_series(1,50) i;
   INSERT INTO afiliados VALUES('otra','Otra','EPS','CC','otra','otra@example.test','Activo','2'),('inactiva','No','Vigente','CC','no',NULL,'Inactivo','1');`);
  const source=require('../src/repositories/afiliados-origen.repository').crearOrigen({obtenerConexion:()=>({esquema:'public',prisma:{$transaction:fn=>sourceDb.transaction(tx=>fn({
   $executeRaw:async(strings,...values)=>{const q=Prisma.sql(strings,...values);return tx.query(q.text,q.values);},
   $queryRaw:async(strings,...values)=>{const q=Array.isArray(strings)?Prisma.sql(strings,...values):strings;return(await tx.query(q.text,q.values)).rows;}
  }))}})});
  const pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const repo=require('../src/repositories/farmacia-eps.repository').createRepository(pool,source);
  assert.equal((await repo.consultar(4,{pagina:1,take:25})).vinculacion.estado,'SIN_VINCULO');
  assert.equal((await repo.administrar(1,4)).escrituraHabilitada,false);
  await assert.rejects(repo.vincular(1,4,{epsId:'1',vinculoActual:null}),e=>e.codigo==='FARMACIA_EPS_SCHEMA_PENDING');
  const protectedTables=['usuarios','roles','eps_entidades','afiliados','solicitudes','pagos','medicamentos','eps_eventos','eps_notificaciones_compartidas'];
  const before={};for(const t of protectedTables)before[t]=(await db.query(`SELECT * FROM "${t}" ORDER BY 1`)).rows;
  const sourceBefore=(await sourceDb.query('SELECT * FROM afiliados ORDER BY id')).rows;
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261115120000_farmacia_eps_unica/migration.sql'),'utf8'));
  assert.equal((await repo.administrar(1,4)).escrituraHabilitada,true);
  const saved=await repo.vincular(1,4,{epsId:'1',vinculoActual:null});assert.equal(saved.vinculoActual.epsId,'1');
  const a=await repo.consultar(4,{pagina:1,take:25}),b=await repo.consultar(4,{pagina:2,take:25});
  assert.equal(a.totalActivos,50);assert.equal(a.pacientes.length,25);assert.equal(b.pacientes.length,25);
  const all=[...a.pacientes,...b.pacientes];assert.equal(new Set(all.map(p=>p.identificador)).size,50);
  for(const p of all){const original=sourceBefore.find(x=>x.id===p.identificador);assert.ok(original);for(const field of ['nombres','apellidos','tipo_documento','documento','correo','estado'])assert.equal(p[field],original[field]);}
  assert.equal((await repo.consultar(5,{pagina:1,take:25})).vinculacion.estado,'SIN_VINCULO');
  await assert.rejects(repo.consultar(6,{pagina:1,take:25}),e=>e.status===403);
  for(const t of protectedTables)assert.deepEqual((await db.query(`SELECT * FROM "${t}" ORDER BY 1`)).rows,before[t],t);
  assert.deepEqual((await sourceDb.query('SELECT * FROM afiliados ORDER BY id')).rows,sourceBefore);
  assert.equal((await db.query('SELECT * FROM administrative_audit')).rows.length,1);
  assert.equal((await db.query('SELECT * FROM eps_farmacias')).rows.length,1);
 }finally{await db.close();await sourceDb.close();}
});
