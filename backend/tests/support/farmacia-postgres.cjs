const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {createRepository}=require('../../src/repositories/farmacia-operacion.repository');
const {createCatalogoRepository}=require('../../src/repositories/farmacia-catalogo.repository');
async function preparar(){
let db,pool,repo,catalogo;
    db=new PGlite();
    for(const name of ['20261016220827_init','20261106190000_catalogo_medicamentos','20261025170000_add_formulas_medicas','20261107215000_add_order_idempotency','20261111160000_create_afiliados','20261114120000_farmacia_notificaciones','20261116170000_eps_dependencias_lectura','20261116180000_farmacia_operacion_autorizada'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../../prisma/migrations',name,'migration.sql'),'utf8'));
    // Fixtures mínimas de EPS: NO son una reconstrucción de migraciones faltantes.
    await db.exec(`CREATE TABLE eps_entidades(id text PRIMARY KEY,nombre text,activa boolean);
      CREATE TABLE eps_farmacias(id serial PRIMARY KEY,eps_id text REFERENCES eps_entidades(id),farmacia_id int REFERENCES usuarios(id),activa boolean,version int DEFAULT 1);
      INSERT INTO roles(id,nombre) VALUES(1,'ADMINISTRADOR'),(2,'PACIENTE'),(3,'FARMACIA'),(4,'EPS');
      INSERT INTO usuarios(id,nombre,apellido,correo,password,rol_id) VALUES(1,'Admin','Prueba','a@test','hash',1),(2,'Ana','Uno','p@test','hash',2),(3,'Farma','Uno','f@test','hash',3),(4,'Farma','Dos','f2@test','hash',3),(5,'Beto','Dos','p2@test','hash',2),(6,'Farma','Sin vinculo','f3@test','hash',3);
      UPDATE usuarios SET estado='ACTIVO';
      UPDATE usuarios SET cedula='100',tipo_documento='CC' WHERE id=2;UPDATE usuarios SET cedula='200',tipo_documento='CC' WHERE id=5;
      INSERT INTO eps_entidades VALUES('A','EPS A',true),('B','EPS B',true);
      INSERT INTO eps_farmacias(eps_id,farmacia_id,activa) VALUES('A',3,true),('B',4,true);
      INSERT INTO afiliados VALUES('a','Ana','Uno','CC','100','2000-01-01','','','','','C','Activo','A',2,1,now()),('b','Beto','Dos','CC','200','2000-01-01','','','','','C','Activo','B',5,1,now());
      INSERT INTO afiliado_cuentas_origen(usuario_id,afiliado_id,eps_id,verificado_por) VALUES(2,'a','A',1),(5,'b','B',1);
      INSERT INTO categorias(id,nombre) VALUES(1,'General');
      INSERT INTO medicamentos(id,nombre,descripcion,presentacion,categoria_id,precio,stock,requiere_formula) VALUES(1,'Medicamento A','Prueba','Caja',1,10,10,false),(2,'Medicamento B','Prueba','Caja',1,10,9,true);
      SELECT setval('medicamentos_id_seq',2);
      INSERT INTO solicitudes(id,usuario_id,estado) VALUES(1,2,'APROBADA'),(2,5,'APROBADA'),(3,2,'APROBADA'),(4,2,'APROBADA');
      INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(1,1,3,10,30),(2,1,2,10,20),(3,2,1,10,10),(4,1,1,10,10);
      INSERT INTO pagos(solicitud_id,usuario_id,referencia,metodo,marca,ultimos_digitos,monto,estado,simulacion) VALUES(1,2,'real-1','TARJETA','test','0000',30,'APROBADO',false),(2,5,'real-2','TARJETA','test','0000',20,'APROBADO',false),(3,2,'real-3','TARJETA','test','0000',10,'APROBADO',false),(4,2,'sim-4','TARJETA','test','0000',10,'APROBADO',true);`);
    let lock=Promise.resolve();
    pool={async connect(){let unlock;const previous=lock;lock=new Promise(r=>unlock=r);await previous;return{query:(...args)=>db.query(...args),release:()=>unlock()};}};
    const origen={leerAutorizados:async eps=>{const rows=(await db.query('SELECT id AS identificador,documento,tipo_documento FROM afiliados WHERE eps_id=$1 AND estado=$2',[eps,'Activo'])).rows;return{pacientes:rows,total:rows.length};},cuentaAutorizada:async(eps,id,documento,tipo)=>(await db.query('SELECT id FROM afiliados WHERE id=$1 AND eps_id=$2 AND documento=$3 AND tipo_documento=$4',[id,eps,documento,tipo])).rows.length===1};
    pool.query=(...args)=>db.query(...args);
    repo=createRepository(pool,()=>true,origen);catalogo=createCatalogoRepository(pool);
    return {db,pool,repo,catalogo,origen};

}
module.exports={preparar};
