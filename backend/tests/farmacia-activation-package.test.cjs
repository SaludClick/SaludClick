// Ensayo exclusivo en PGlite. No usa .env, red ni conexiones reales.
require('./support/isolate-database.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {preparar,tables,names}=require('../scripts/prepare-farmacia-activation.cjs');
const pack=path.join(__dirname,'fixtures/farmacia-activacion');
const audit=JSON.parse(fs.readFileSync(path.join(pack,'auditoria.json'),'utf8'));
const leerMigracion=name=>fs.readFileSync(path.join(__dirname,'../prisma/migrations',name,'migration.sql'));
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const entry of audit.destino.historial)entry.checksum=sha256(leerMigracion(entry.migration_name));
const auditoria=Buffer.from(JSON.stringify(audit));
const {sql,manifest}=preparar(auditoria);
test('El paquete omite las dependencias EPS ya aplicadas y registradas', () => {
    const nombre='20261116170000_eps_dependencias_lectura';
    const historial=[...audit.destino.historial,{
        migration_name:nombre,checksum:sha256(leerMigracion(nombre)),finished_at:'2026-11-21'
    }];
    const actual={...audit,destino:{...audit.destino,historial}};
    const paquete=preparar(Buffer.from(JSON.stringify(actual)));
    assert.equal(paquete.manifest.migraciones.some(m=>m.nombre===nombre),false);
    assert.equal(paquete.manifest.tablasNuevas.includes('afiliado_cuentas_origen'),false);
    assert.equal(paquete.manifest.hashesHistoricosDiferentes.length,0);
});
const [actor,farmacia]=audit.destino.identidad;
const eps=audit.destino.eps;
let db;
before(async()=>{
    db=new PGlite();
    for(const name of ['20261016220827_init','20261106190000_catalogo_medicamentos','20261025170000_add_formulas_medicas','20261107215000_add_order_idempotency','20261111160000_create_afiliados'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations',name,'migration.sql'),'utf8'));
    // Fixture de dependencias revisadas; NO reconstruye migraciones históricas EPS.
    await db.exec(`CREATE TABLE eps_entidades(id varchar(80) PRIMARY KEY,nombre varchar(150),activa boolean);
     CREATE TABLE eps_farmacias(id serial PRIMARY KEY,eps_id varchar(80) NOT NULL REFERENCES eps_entidades(id),farmacia_id integer NOT NULL REFERENCES usuarios(id),activa boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,vinculada_at timestamptz NOT NULL DEFAULT now(),UNIQUE(eps_id,farmacia_id));
     CREATE TABLE administrative_audit(id serial PRIMARY KEY,actor_id integer REFERENCES usuarios(id),accion varchar(60),entidad varchar(30),registro_id varchar(80),resultado varchar(20),campos text[],created_at timestamptz DEFAULT now());
     CREATE TABLE _prisma_migrations(migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz,started_at timestamptz DEFAULT now(),applied_steps_count integer DEFAULT 1);
     INSERT INTO roles(id,nombre) VALUES(1,'ADMINISTRADOR'),(2,'PACIENTE'),(3,'farmacia');`);
    for(const persona of audit.destino.identidad){
        await db.query("INSERT INTO usuarios(id,nombre,apellido,correo,cedula,password,rol_id,estado) VALUES($1,$2,$3,$4,$5,'hash',$6,'ACTIVO')",
            [persona.id,persona.nombre,persona.apellido,persona.correo,persona.documento,persona.rol_id]);
    }
    await db.query('INSERT INTO eps_entidades VALUES($1,$2,$3)',[eps.id,eps.nombre,eps.activa]);
});
after(async()=>{await db?.close();});
test('Preparación: seis migraciones coinciden con sus archivos y el historial sintético se reconcilia',()=>{
    assert.equal(names.length,6);assert.equal(manifest.tablasNuevas.length,14);assert.equal(manifest.secuenciasNuevas.length,5);assert.equal(manifest.hashesHistoricosDiferentes.length,0);assert.equal(manifest.archivosPendientesHistoricos.length,0);
    assert.equal(manifest.auditoria,sha256(auditoria));
    assert.deepEqual(manifest.migraciones,names.map(nombre=>({nombre,sha256:sha256(leerMigracion(nombre))})));
    for(const name of names)assert.ok(sql.includes(leerMigracion(name).toString('utf8')));
});
test('Preparación: sin autorización se detiene antes de crear objetos',async()=>{
    await assert.rejects(db.exec(sql),/Falta aprobación/);await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('public.notificaciones_farmacia') AS objeto")).rows[0].objeto,null);
});
test('Preparación: una divergencia nueva del historial sigue impidiendo el DDL',async()=>{
    for(const h of audit.destino.historial)await db.query('INSERT INTO _prisma_migrations(migration_name,checksum,finished_at,rolled_back_at) VALUES($1,$2,$3,$4)',[h.migration_name,h.checksum,h.finished_at,h.rolled_back_at]);
    await db.query("SELECT set_config('saludclick.aprobacion_esquema','AUTORIZACION_SOLO_FIXTURE',false)");
    await db.query("INSERT INTO _prisma_migrations(migration_name,checksum,finished_at) VALUES('HISTORICO_DESCONOCIDO_SOLO_FIXTURE','no-es-un-original',now())");
    await assert.rejects(db.exec(sql),/Historial no reconciliado/);await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('public.farmacia_existencias') AS objeto")).rows[0].objeto,null);
});
test('Preparación: DDL crea 14 tablas, 29 índices y cinco secuencias sin alterar tablas compartidas',async()=>{
    // Retira solo la divergencia sintética; conserva TODO el historial auditado.
    await db.query("DELETE FROM _prisma_migrations WHERE migration_name='HISTORICO_DESCONOCIDO_SOLO_FIXTURE'");
    const protegidas=['usuarios','roles','eps_entidades','eps_farmacias','afiliados','solicitudes','detalle_solicitud','pagos','medicamentos','categorias','administrative_audit'];
    const before={};for(const t of protegidas)before[t]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') AS filas FROM "${t}" r`)).rows[0].filas;
    await db.exec(sql);
    for(const t of protegidas)assert.deepEqual((await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') AS filas FROM "${t}" r`)).rows[0].filas,before[t],t);
    const indices=(await db.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND (tablename=ANY($1::text[]) OR indexname='eps_farmacias_una_eps_activa_key') ORDER BY tablename,indexname",[tables])).rows;
    assert.equal(indices.length,29);
    const secuencias=(await db.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' AND sequencename=ANY($1::text[]) ORDER BY sequencename",[manifest.secuenciasNuevas])).rows;assert.equal(secuencias.length,5);
    for(const t of tables)assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n,0);
    const restricciones=(await db.query("SELECT t.relname AS tabla,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definicion FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=ANY($1::text[]) ORDER BY t.relname,c.conname",[tables])).rows;
    assert.ok(restricciones.length>0 && restricciones.every(r=>r.convalidated));
    await assert.rejects(db.exec(sql),/no está vacío/);await db.exec('ROLLBACK');
});
test('Preparación: vínculo exige actor/aprobación, audita y no sobrescribe el estado previo',async()=>{
    const link=fs.readFileSync(path.join(pack,'vincular-eps.sql'),'utf8');
    await assert.rejects(db.exec(link),/Falta aprobación/);await db.exec('ROLLBACK');
    await db.query("SELECT set_config('saludclick.actor_admin',$1,false),set_config('saludclick.aprobacion_vinculo','SOLO_FIXTURE',false),set_config('saludclick.identidad_farmacia_confirmada',$2,false)",[String(farmacia.id),`${farmacia.id}:${eps.id}`]);
    await assert.rejects(db.exec(link),/no vigentes/);await db.exec('ROLLBACK');
    await db.query("SELECT set_config('saludclick.actor_admin',$1,false)",[String(actor.id)]);await db.exec(link);
    assert.deepEqual((await db.query('SELECT eps_id,farmacia_id,activa,version FROM eps_farmacias')).rows,[{eps_id:eps.id,farmacia_id:farmacia.id,activa:true,version:1}]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM administrative_audit')).rows[0].n,1);
    await assert.rejects(db.exec(link),/estado inicial cambió/);await db.exec('ROLLBACK');
});
test('Preparación: suspensión protege versión, conserva fila e historial y registra auditoría',async()=>{
    const suspend=fs.readFileSync(path.join(pack,'suspender-vinculo.sql'),'utf8');
    await db.query("SELECT set_config('saludclick.vinculo_id',(SELECT id::text FROM eps_farmacias WHERE farmacia_id=$1),false),set_config('saludclick.vinculo_version','2',false),set_config('saludclick.aprobacion_suspension','SOLO_FIXTURE',false)",[farmacia.id]);
    await assert.rejects(db.exec(suspend),/cambió/);await db.exec('ROLLBACK');
    await db.exec("SELECT set_config('saludclick.vinculo_version','1',false)");await db.exec(suspend);
    assert.deepEqual((await db.query('SELECT activa,version FROM eps_farmacias')).rows,[{activa:false,version:2}]);assert.equal((await db.query('SELECT count(*)::int AS n FROM administrative_audit')).rows[0].n,2);
});
test('Preparación: postcheck es lectura, requiere parámetros y no inventa métricas',async()=>{
    const post=fs.readFileSync(path.join(pack,'postcheck.sql'),'utf8');
    await assert.rejects(db.exec(post),/Falta periodo/);await db.exec('ROLLBACK');
    await db.exec("SELECT set_config('saludclick.desde','2026-11-01',false),set_config('saludclick.hasta','2026-11-30',false),set_config('saludclick.afiliados_activos_json','[]',false)");
    await db.exec(post);assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_stock_eventos')).rows[0].n,0);
});
test('Preparación: rol EPS separado sin privilegios de escritura, solo en fixture',async()=>{
    await db.exec('CREATE TABLE eps(id integer PRIMARY KEY,nombre text,estado text)');
    await db.query('INSERT INTO eps VALUES($1,$2,$3)',[Number(eps.id),eps.nombre,'ACTIVA']);
    const source=fs.readFileSync(path.join(pack,'rol-lectura-eps.sql'),'utf8');
    await assert.rejects(db.exec(source),/Falta autorización/);await db.exec('ROLLBACK');
    await db.exec("SELECT set_config('saludclick.aprobacion_rol_eps','SOLO_FIXTURE',false)");
    try{await db.exec(source);}catch(e){throw new Error(`${e.code}: ${e.message}; contexto=${e.where||''}; detalle=${e.detail||''}; rutina=${e.routine||''}`);}
    const p=(await db.query("SELECT has_table_privilege('saludclick_eps_lectura','public.afiliados','SELECT') AS leer,has_table_privilege('saludclick_eps_lectura','public.afiliados','UPDATE') AS escribir")).rows[0];assert.deepEqual(p,{leer:true,escribir:false});
});
test('Preparación: ambos prechecks completos se ejecutan como lectura en las fixtures',async()=>{
    for(const name of ['destino-precheck.sql','fuente-eps-precheck.sql'])await db.exec(fs.readFileSync(path.join(pack,name),'utf8'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_existencias')).rows[0].n,0);
});
