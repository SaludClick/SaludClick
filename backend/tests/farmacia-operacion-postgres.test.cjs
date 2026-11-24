// PostgreSQL real embebido, sin .env, red ni conexiones a Neon.
require('./support/isolate-database.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {createRepository}=require('../src/repositories/farmacia-operacion.repository');
const {createCatalogoRepository}=require('../src/repositories/farmacia-catalogo.repository');
const v=require('../src/validators/farmacia-operacion.validator');
let db,repo,catalogo,pool;
before(async()=>{({db,pool,repo,catalogo}=await require('./support/farmacia-postgres.cjs').preparar());});
after(async()=>{await db?.close();});
test('PostgreSQL: migración nueva aplica sin asignar solicitudes ni conceder permisos',async()=>{
    assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_asignaciones')).rows[0].n,0);
    assert.equal((await catalogo.permisos(3)).puedeCrear,false);
    assert.equal((await repo.listar(3,v.listado({}))).pedidos.length,0);
});
test('PostgreSQL: identidad verificada usa metadatos mínimos y comparación privada con documento original',async()=>{
    await assert.rejects(repo.vincularIdentidad(2,3,2,'a'),{status:403});
    await assert.rejects(repo.vincularIdentidad(1,3,5,'a'),{status:403});
    await repo.vincularIdentidad(1,3,2,'a');
    const data=(await db.query('SELECT * FROM afiliado_cuentas_origen WHERE usuario_id=2')).rows[0];
    assert.equal(data.afiliado_id,'a');assert.equal(data.documento,undefined);assert.equal(data.nombres,undefined);
});
test('PostgreSQL: asignación explícita valida actor, EPS, afiliación y farmacia, sin cola global',async()=>{
    await assert.rejects(repo.asignar(2,1,3),{status:403});
    await assert.rejects(repo.asignar(1,2,3),{status:403});
    await assert.rejects(repo.asignar(1,1,6),{status:403});
    await repo.asignar(1,1,3);await repo.asignar(1,2,4);await repo.asignar(1,3,3);await repo.asignar(1,4,3);
    await repo.asignar(1,1,3);
    const result=await repo.listar(3,v.listado({paciente:'Ana',tamano:'1'}));
    assert.equal(result.paginacion.total,3);assert.equal(result.pedidos.length,1);
    assert.equal(result.pedidos[0].usuario.nombre,'Ana');assert.equal(result.pedidos[0].eps,'EPS A');assert.equal(result.pedidos[0].detalles[0].cantidad,3);
    await assert.rejects(repo.detalle(3,2),{status:404});
    assert.equal((await db.query("SELECT count(*)::int AS n FROM notificaciones_farmacia WHERE referencia_evento='solicitud:1:asignada'")).rows[0].n,1);
});
test('PostgreSQL: transiciones, pago real, evidencia, historial, idempotencia y cantidades confirmadas',async()=>{
    const input=(estadoActual,estado,version)=>v.transicion({estadoActual,estado,version,clave:randomUUID(),recepcion:estado==='ENTREGADA'?'Recibido por paciente':''});
    await assert.rejects(repo.avanzar(3,3,input('APROBADA','PREPARANDO',1)),{status:409});
    await assert.rejects(repo.avanzar(3,4,input('APROBADA','PREPARANDO',1)),{status:409});
    const first=input('APROBADA','PREPARANDO',1);
    await repo.avanzar(3,1,first);assert.equal((await repo.avanzar(3,1,first)).repetido,true);
    await assert.rejects(repo.avanzar(3,1,{...first,observaciones:'otra'}),{status:409});
    await repo.avanzar(3,1,input('PREPARANDO','LISTA',2));await repo.avanzar(3,1,input('LISTA','ENTREGADA',3));
    const p=(await repo.detalle(3,1)).pedido;assert.equal(p.historial.length,3);assert.equal(p.historial[2].responsable,'Farma Uno');
    assert.equal((await db.query('SELECT stock FROM medicamentos WHERE id=1')).rows[0].stock,10);
    const stats=await repo.estadisticas(3,v.periodo({}));
    assert.deepEqual(stats.indicadores,{solicitudesRecibidas:3,pacientesAtendidos:1,solicitudesPendientes:2,solicitudesPreparadas:1,solicitudesCompletadas:1,medicamentosEntregados:3,medicamentosDisponibles:null});
    assert.equal(stats.graficos.medicamentos[0].total,4);assert.equal(stats.actividad.length,3);
    const otherPharmacy = await repo.estadisticas(4,v.periodo({}));
    assert.equal(otherPharmacy.indicadores.medicamentosEntregados,0);
    assert.equal(otherPharmacy.indicadores.solicitudesPreparadas,0);
    const past = await repo.estadisticas(3,{desde:'2026-01-01',hasta:'2026-01-31'});
    assert.equal(past.indicadores.solicitudesPreparadas,0);
});
test('PostgreSQL: fórmula exige vínculo al pedido del mismo paciente y autorización de farmacia',async()=>{
    await db.exec(`INSERT INTO formulas_medicas(id,usuario_id,nombre_archivo,nombre_original,tipo_mime,ruta_archivo,tamano) VALUES(1,2,'00000000-0000-4000-8000-000000000000.pdf','formula.pdf','application/pdf','private',10);`);
    await assert.rejects(repo.autorizarFormula(5,1,1),{status:404});
    await repo.autorizarFormula(2,1,1);assert.equal((await repo.formula(3,1,1)).permite_descarga,false);
    await assert.rejects(repo.formula(4,1,1),{status:404});
    await db.query('UPDATE farmacia_formulas_autorizadas SET activa=false');await assert.rejects(repo.formula(3,1,1),{status:404});
});
test('PostgreSQL: catálogo deniega escritura global; alta/edición autorizada, duplicados, auditoría y stock intacto',async()=>{
    const med=v.medicamento({nombre:'Nuevo producto',descripcion:'Descripción permitida',presentacion:'Caja 10',imagen:'https://images.example.com/a.png',categoria_id:1,precio:10,estado:'INACTIVO'});
    await assert.rejects(catalogo.guardar(3,med),{status:403});
    await assert.rejects(catalogo.autorizar(2,3,{puedeCrear:true,medicamentos:[]}),{status:403});
    await catalogo.autorizar(1,3,{puedeCrear:true,medicamentos:[]});
    const {medicamento}=await catalogo.guardar(3,med);assert.equal(medicamento.stock,0);
    await assert.rejects(catalogo.guardar(3,med),{status:409});
    await assert.rejects(catalogo.guardar(4,{...med,version:1},medicamento.id),{status:403});
    await catalogo.guardar(3,{...med,nombre:'Producto actualizado',version:1},medicamento.id);
    await assert.rejects(catalogo.guardar(3,{...med,version:1},medicamento.id),{status:409});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_catalogo_auditoria')).rows[0].n,2);
    assert.equal((await db.query('SELECT stock FROM medicamentos WHERE id=$1',[medicamento.id])).rows[0].stock,0);
    await catalogo.autorizar(1,3,{puedeCrear:false,medicamentos:[]});
    assert.deepEqual((await catalogo.permisos(3)).ambitos,[]);
    await assert.rejects(catalogo.guardar(3,{...med,nombre:'No autorizado',version:2},medicamento.id),{status:404});
    await assert.rejects(catalogo.guardar(3,{...med,nombre:'Alta revocada'}),{status:403});
});
test('PostgreSQL: política explícita enruta nuevas solicitudes y un fallo de aviso revierte la transición',async()=>{
    await assert.rejects(repo.configurarRuta(2,'A',3),{status:403});
    await repo.configurarRuta(1,'A',3);
    await db.exec(`INSERT INTO solicitudes(id,usuario_id,estado) VALUES(5,2,'APROBADA');
      INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(5,1,1,10,10);
      INSERT INTO pagos(solicitud_id,usuario_id,referencia,metodo,marca,ultimos_digitos,monto,estado,simulacion) VALUES(5,2,'real-5','TARJETA','test','0000',10,'APROBADO',false);`);
    const assigned=await repo.tx(1,1,true,c=>repo.asignarNuevaEn(c,5,2));assert.equal(assigned.asignacionPendiente,false);assert.deepEqual(assigned.destinatarios,[3]);
    const n=(await db.query("SELECT destinatario_id FROM notificaciones_farmacia WHERE referencia_evento='solicitud:5:asignada'")).rows;assert.deepEqual(n,[{destinatario_id:3}]);
    await db.exec(`CREATE FUNCTION rechazar_aviso_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tipo='SOLICITUD_ESTADO' THEN RAISE EXCEPTION 'Fallo aislado'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fallo_aviso_test BEFORE INSERT ON notificaciones_farmacia FOR EACH ROW EXECUTE FUNCTION rechazar_aviso_test();`);
    await assert.rejects(repo.avanzar(3,5,v.transicion({estadoActual:'APROBADA',estado:'PREPARANDO',version:1,clave:randomUUID()})));
    assert.equal((await db.query('SELECT estado FROM solicitudes WHERE id=5')).rows[0].estado,'APROBADA');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_solicitud_eventos WHERE solicitud_id=5')).rows[0].n,0);
    await db.exec('DROP TRIGGER fallo_aviso_test ON notificaciones_farmacia; DROP FUNCTION rechazar_aviso_test();');
});
test('PostgreSQL: contraseña exige la actual, guarda hash y revoca sesiones de la cuenta',async()=>{
    const bcrypt=require('bcrypt'),service=require('../src/services/farmacia-password.service').createService(pool,()=>{});
    const actual='InicialSegura123';await db.query('UPDATE usuarios SET password=$2 WHERE id=$1',[3,await bcrypt.hash(actual,4)]);
    await assert.rejects(service.cambiar({id:3},{actual:'Incorrecta123',nueva:'NuevaSegura1234'}),{status:403});
    await service.cambiar({id:3},{actual,nueva:'NuevaSegura1234'});
    const row=(await db.query('SELECT password FROM usuarios WHERE id=3')).rows[0];assert.ok(await bcrypt.compare('NuevaSegura1234',row.password));assert.notEqual(row.password,'NuevaSegura1234');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_sesiones WHERE usuario_id=3')).rows[0].n,1);
    const {createAuthorize}=require('../src/middlewares/farmacia-notificaciones.middleware');
    const authorize=createAuthorize({lookup:async()=>({id:3,rol_id:3,estado:'ACTIVO'}),verify:()=>({id:3,rol:3,iat:100,exp:Date.now()/1000+300}),revocation:async()=>new Date(200000)});
    await assert.rejects(authorize('token-aislado'),{status:401});
});
test('PostgreSQL: revocar vínculo o cuenta retira acceso sin borrar históricos',async()=>{
    await db.query('UPDATE eps_farmacias SET activa=false WHERE farmacia_id=3');await assert.rejects(repo.listar(3,v.listado({})),{status:403});
    await db.query('UPDATE usuarios SET estado=$1 WHERE id=4',['INACTIVO']);await assert.rejects(repo.detalle(4,2),{status:403});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM farmacia_solicitud_eventos')).rows[0].n,3);
});
test('PostgreSQL: filtros de periodo y tendencias comparan intervalos de igual duración sin incluir otra farmacia',async()=>{
    await db.query('UPDATE eps_farmacias SET activa=true WHERE farmacia_id=3');
    await db.query("UPDATE solicitudes SET fecha='2026-11-10' WHERE id IN (1,5)");
    await db.query("UPDATE solicitudes SET fecha='2026-10-15' WHERE id IN (3,4)");
    const result=await repo.estadisticas(3,{desde:'2026-11-01',hasta:'2026-11-30'});
    assert.equal(result.indicadores.solicitudesRecibidas,2);
    assert.deepEqual(result.graficos.evolucion.filter(r=>r.mes==='2026-10'||r.mes==='2026-11'),
        [{mes:'2026-10',total:2},{mes:'2026-11',total:2}]);
    assert.equal(result.destacados,null);
    assert.deepEqual(result.tendencia,{metrica:'SOLICITUDES_RECIBIDAS',actual:2,anterior:2,variacionPorcentual:0});
    assert.equal(result.graficos.meses[0].mes,'2026-11');assert.equal(result.graficos.meses[0].total,2);
    assert.ok(result.actividad.every(a=>[1,5].includes(a.id)));
    const vacio=await repo.estadisticas(3,{desde:'2026-12-01',hasta:'2026-12-30'});
    assert.deepEqual(vacio.tendencia,{metrica:'SOLICITUDES_RECIBIDAS',actual:0,anterior:2,variacionPorcentual:-100});
    assert.equal(vacio.indicadores.solicitudesPendientes,0);
    assert.equal(vacio.graficos.meses.length,0);
    const sinBase=await repo.estadisticas(3,{desde:'2027-02-01',hasta:'2027-02-28'});
    assert.equal(sinBase.tendencia,null);
    await db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261117180000_farmacia_inventario_propio/migration.sql'),'utf8'));
    await db.query('INSERT INTO farmacia_existencias(farmacia_id,medicamento_id,cantidad,reservado) VALUES(3,1,5,2),(4,2,50,0)');
    const flags=['FARMACIA_OPERACION_ENABLED','FARMACIA_INVENTARIO_PROPIO_ENABLED'];
    const previous=flags.map(flag=>process.env[flag]);
    for(const flag of flags)process.env[flag]='true';
    try {
        const dashboard=await repo.estadisticas(3,{desde:'2026-11-01',hasta:'2026-11-30'});
        assert.deepEqual(dashboard.destacados.map(m=>[m.id,m.stock,m.disponibles]),[[1,5,3]]);
    } finally {
        for(const [i,flag] of flags.entries())if(previous[i]===undefined)delete process.env[flag];else process.env[flag]=previous[i];
    }
});
