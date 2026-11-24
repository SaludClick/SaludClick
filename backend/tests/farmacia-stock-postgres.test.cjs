// Solo PostgreSQL embebido efímero; preload rechaza las conexiones reales.
require('./support/isolate-database.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),ExcelJS=require('exceljs');
const v=require('../src/validators/farmacia-operacion.validator');
const {ingreso}=require('../src/services/farmacia-stock.service');
let f,stock,service;
const old={operation:process.env.FARMACIA_OPERACION_ENABLED,stock:process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED};
before(async()=>{
    f=await require('./support/farmacia-postgres.cjs').preparar();
    await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261117180000_farmacia_inventario_propio/migration.sql'),'utf8'));
    await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261117200000_farmacia_ingreso_referencia_unica/migration.sql'),'utf8'));
    await f.db.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261123190000_farmacia_movimientos_manuales/migration.sql'),'utf8'));
    process.env.FARMACIA_OPERACION_ENABLED='true';process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED='true';
    stock=require('../src/repositories/farmacia-stock.repository').createRepository(f.pool,f.origen);
    service=require('../src/services/farmacia-stock.service').createService(stock);
    await f.db.exec(`INSERT INTO medicamentos(id,nombre,descripcion,presentacion,categoria_id,precio,stock,requiere_formula,estado) VALUES(3,'Medicamento C','Otro medicamento','Caja',1,10,20,false,'DISPONIBLE');
      UPDATE medicamentos SET estado='DISPONIBLE' WHERE id IN(1,2);
      INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(1,1,2,10,20),(1,3,1,10,10);
      UPDATE pagos SET monto=60 WHERE solicitud_id=1;`);
});
after(async()=>{await f?.db.close();for(const [key,value] of [['FARMACIA_OPERACION_ENABLED',old.operation],['FARMACIA_INVENTARIO_PROPIO_ENABLED',old.stock]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
const supply=(items,referencia='Recepción autorizada de prueba '+randomUUID(),clave=randomUUID())=>ingreso({items,referencia,clave});
const next=(estadoActual,estado,version)=>v.transicion({estadoActual,estado,version,clave:randomUUID(),recepcion:estado==='ENTREGADA'?'Recibió el paciente autorizado':''});
const row=async(id=1)=>(await f.db.query('SELECT cantidad,reservado FROM farmacia_existencias WHERE farmacia_id=3 AND medicamento_id=$1',[id])).rows[0];

test('Stock: migración vacía, sin copiar el saldo global ni habilitar edición manual',async()=>{
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM farmacia_existencias')).rows[0].n,0);
    assert.equal((await service.listar({id:3},{})).paginacion.total,0);
    await assert.rejects(service.listar({id:3},{farmaciaId:'4'}),{status:400});
    process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED='false';await assert.rejects(service.listar({id:3},{}),{status:503});process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED='true';
});
test('Stock: ingreso solo por administrador, idempotencia, auditoría y rollback de varios medicamentos',async()=>{
    const input=supply([{medicamentoId:1,cantidad:7},{medicamentoId:3,cantidad:2}]);
    for(const id of [2,3,4])await assert.rejects(stock.ingresar(id,3,input),{status:403});
    await stock.ingresar(1,3,input);assert.equal((await stock.ingresar(1,3,input)).repetido,true);
    await assert.rejects(stock.ingresar(1,3,{...input,clave:randomUUID()}),{codigo:'INGRESO_REFERENCIA_EXISTENTE'});
    await assert.rejects(stock.ingresar(1,3,{...input,clave:randomUUID(),referencia:' '+input.referencia.toUpperCase()+' '}),{codigo:'INGRESO_REFERENCIA_EXISTENTE'});
    await assert.rejects(stock.ingresar(1,3,{...input,referencia:'Otra'}),{status:409});
    await assert.rejects(stock.ingresar(1,3,supply([{medicamentoId:1,cantidad:5},{medicamentoId:999,cantidad:2}])),{status:404});
    assert.deepEqual(await row(),{cantidad:7,reservado:0});
    await stock.ingresar(1,4,supply([{medicamentoId:1,cantidad:11}]));
    assert.equal((await service.listar({id:3},{})).medicamentos.length,2);
    await assert.rejects(service.detalle({id:4},'3',{}),{status:404});
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM farmacia_stock_eventos WHERE farmacia_id=3 AND tipo='INGRESO'")).rows[0].n,2);
    for(const body of [{items:[],referencia:'x',clave:randomUUID()},{items:[{medicamentoId:1,cantidad:-1}],referencia:'x',clave:randomUUID()},{items:[{medicamentoId:1,cantidad:1},{medicamentoId:1,cantidad:1}],referencia:'x',clave:randomUUID()}])assert.throws(()=>ingreso(body),{status:400});
});
test('Stock: referencia duplicada tampoco permite sumar cantidades mediante SQL ni con una clave nueva',async()=>{
    const event=(await f.db.query("SELECT * FROM farmacia_stock_eventos WHERE farmacia_id=3 AND tipo='INGRESO' AND medicamento_id=1 LIMIT 1")).rows[0];
    await assert.rejects(f.db.query("INSERT INTO farmacia_stock_eventos(farmacia_id,medicamento_id,actor_id,tipo,cantidad,clave,huella,referencia) VALUES(3,1,1,'INGRESO',7,$1,$2,$3)",[randomUUID(),event.huella,event.referencia.toUpperCase()]),{code:'23505'});
    assert.deepEqual(await row(),{cantidad:7,reservado:0});
});
test('Stock: preparación agrupa líneas repetidas y reserva todos los medicamentos una sola vez',async()=>{
    await f.repo.asignar(1,1,3);
    const input=next('APROBADA','PREPARANDO',1);
    await f.repo.avanzar(3,1,input);assert.equal((await f.repo.avanzar(3,1,input)).repetido,true);
    assert.deepEqual(await row(),{cantidad:7,reservado:5});assert.deepEqual(await row(3),{cantidad:2,reservado:1});
    const list=await service.listar({id:3},{});assert.equal(list.medicamentos.find(m=>m.id===1).stock,2);assert.equal(list.resumen.bajos,2);
    assert.equal((await f.db.query('SELECT stock FROM medicamentos WHERE id=1')).rows[0].stock,10);
});
test('Stock: entrega atómica libera reserva, descuenta físico, audita y rechaza duplicados',async()=>{
    await f.repo.avanzar(3,1,next('PREPARANDO','LISTA',2));
    const input=next('LISTA','ENTREGADA',3);await f.repo.avanzar(3,1,input);await f.repo.avanzar(3,1,input);
    await assert.rejects(f.repo.avanzar(3,1,next('LISTA','ENTREGADA',3)),{status:409});
    assert.deepEqual(await row(),{cantidad:2,reservado:0});
    const list=await service.listar({id:3},{});assert.equal(list.medicamentos.find(m=>m.id===1).entregados,5);assert.equal(list.medicamentos.find(m=>m.id===3).entregados,1);
    const other=await service.listar({id:4},{});assert.equal(other.medicamentos[0].stock,11);assert.equal(other.medicamentos[0].entregados,0);
    const stats=await f.repo.estadisticas(3,v.periodo({}));
    assert.equal(stats.indicadores.medicamentosDisponibles,2);assert.equal(stats.indicadores.medicamentosEntregados,6);assert.equal(stats.indicadores.pacientesAtendidos,1);assert.equal(stats.indicadores.solicitudesCompletadas,1);
    assert.equal(stats.graficos.completadasMes.reduce((n,m)=>n+m.total,0),1);assert.equal(stats.alertasStock.length,2);
    assert.equal((await f.db.query('SELECT stock FROM medicamentos WHERE id=1')).rows[0].stock,10);
});
test('Stock: insuficiencia en el segundo medicamento revierte la primera reserva y el estado',async()=>{
    await f.db.exec(`INSERT INTO solicitudes(id,usuario_id,estado) VALUES(5,2,'APROBADA');INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(5,1,1,10,10),(5,3,2,10,20);INSERT INTO pagos(solicitud_id,usuario_id,referencia,metodo,marca,ultimos_digitos,monto,estado,simulacion) VALUES(5,2,'r5','TARJETA','test','0000',30,'APROBADO',false);`);
    await f.repo.asignar(1,5,3);await assert.rejects(f.repo.avanzar(3,5,next('APROBADA','PREPARANDO',1)),{codigo:'STOCK_PROPIO_INSUFICIENTE'});
    assert.deepEqual(await row(),{cantidad:2,reservado:0});assert.equal((await f.repo.detalle(3,5)).pedido.estado,'APROBADA');
    assert.equal((await f.db.query('SELECT count(*)::int AS n FROM farmacia_stock_eventos WHERE solicitud_id=5')).rows[0].n,0);
});
test('Stock: fallo al notificar revierte movimiento, evento y estado juntos',async()=>{
    await f.db.query('UPDATE detalle_solicitud SET cantidad=1,subtotal=10 WHERE solicitud_id=5 AND medicamento_id=3');
    await f.db.exec(`CREATE FUNCTION fallo_stock_aviso() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo de prueba'; END $$;CREATE TRIGGER fallo_stock_aviso BEFORE INSERT ON notificaciones_farmacia FOR EACH ROW EXECUTE FUNCTION fallo_stock_aviso();`);
    await assert.rejects(f.repo.avanzar(3,5,next('APROBADA','PREPARANDO',1)));assert.deepEqual(await row(),{cantidad:2,reservado:0});
    assert.equal((await f.repo.detalle(3,5)).pedido.version,1);
    await f.db.exec('DROP TRIGGER fallo_stock_aviso ON notificaciones_farmacia; DROP FUNCTION fallo_stock_aviso();');
});
test('Stock: Excel propio reabre con saldos, entregados y alcance; filtros no exportan otra farmacia',async()=>{
    const buffer=await service.exportar({id:3},{buscar:'Medicamento A',pagina:'3'}),book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
    assert.deepEqual(book.worksheets.map(w=>w.name),['Inventario','Resumen']);const sheet=book.getWorksheet('Inventario');assert.equal(sheet.rowCount,2);assert.equal(sheet.getCell('E2').value,2);assert.equal(sheet.getCell('H2').value,5);assert.equal(sheet.getCell('I2').value,0);assert.equal(sheet.getCell('J2').value,2);
    assert.match(book.getWorksheet('Resumen').getCell('B2').value,/Farmacia #3/);assert.equal((await service.listar({id:3},{disponibilidad:'bajos'})).paginacion.total,2);
});
test('Stock: dos reintentos simultáneos reservan una vez y dos entregas al mismo paciente lo cuentan una sola vez',async()=>{
    const input=next('APROBADA','PREPARANDO',1);
    const results=await Promise.all([f.repo.avanzar(3,5,input),f.repo.avanzar(3,5,input)]);
    assert.deepEqual(results.map(r=>r.repetido).sort(),[false,true]);
    assert.deepEqual(await row(),{cantidad:2,reservado:1});
    await f.repo.avanzar(3,5,next('PREPARANDO','LISTA',2));await f.repo.avanzar(3,5,next('LISTA','ENTREGADA',3));
    const stats=await f.repo.estadisticas(3,v.periodo({}));assert.equal(stats.indicadores.pacientesAtendidos,1);assert.equal(stats.indicadores.solicitudesCompletadas,2);assert.equal(stats.indicadores.medicamentosEntregados,8);
    assert.deepEqual(await row(),{cantidad:1,reservado:0});
});
test('Stock: estado desconocido no inventa disponibilidad; restricciones impiden saldos inválidos',async()=>{
    await stock.ingresar(1,3,supply([{medicamentoId:2,cantidad:4}]));await f.db.query('UPDATE medicamentos SET estado=NULL WHERE id=2');
    const list=await service.listar({id:3},{disponibilidad:'desconocidos'});assert.equal(list.paginacion.total,1);assert.equal(list.medicamentos[0].disponibilidad,'DESCONOCIDA');assert.equal(list.resumen.desconocidos,1);
    assert.equal((await f.repo.estadisticas(3,v.periodo({}))).indicadores.medicamentosDisponibles,1);
    await assert.rejects(f.db.query('UPDATE farmacia_existencias SET cantidad=-1 WHERE farmacia_id=3 AND medicamento_id=1'));
    await assert.rejects(f.db.query('UPDATE farmacia_existencias SET reservado=5 WHERE farmacia_id=3 AND medicamento_id=1'));
});
test('Stock propio: reserva agota, ingreso repone y el reintento no duplica avisos',async()=>{
    const enabled=process.env.FARMACIA_NOTIFICACIONES_ENABLED;
    process.env.FARMACIA_NOTIFICACIONES_ENABLED='true';
    try {
        await f.db.exec(`INSERT INTO solicitudes(id,usuario_id,estado) VALUES(6,2,'APROBADA');
            INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(6,1,1,10,10);
            INSERT INTO pagos(solicitud_id,usuario_id,referencia,metodo,marca,ultimos_digitos,monto,estado,simulacion)
            VALUES(6,2,'r6','TARJETA','test','0000',10,'APROBADO',false);`);
        await f.repo.asignar(1,6,3);
        await f.repo.avanzar(3,6,next('APROBADA','PREPARANDO',1));
        const input=supply([{medicamentoId:1,cantidad:10}]);
        assert.deepEqual((await stock.ingresar(1,3,input)).destinatarios,[3]);
        assert.deepEqual(await stock.ingresar(1,3,input),{repetido:true});
        const {rows}=await f.db.query(`SELECT tipo,destinatario_id FROM notificaciones_farmacia
          WHERE referencia_evento LIKE 'stock:inventario:1:%' ORDER BY id`);
        assert.deepEqual(rows,[{tipo:'STOCK_AGOTADO',destinatario_id:3},{tipo:'STOCK_REPUESTO',destinatario_id:3}]);
        assert.equal((await f.db.query('SELECT stock FROM medicamentos WHERE id=1')).rows[0].stock,10);
    }finally{
        if(enabled===undefined)delete process.env.FARMACIA_NOTIFICACIONES_ENABLED;
        else process.env.FARMACIA_NOTIFICACIONES_ENABLED=enabled;
    }
});
test('Stock: revocación retira lectura y no destruye historial',async()=>{
    await f.db.query('UPDATE eps_farmacias SET activa=false WHERE farmacia_id=3');await assert.rejects(service.listar({id:3},{}),{status:403});
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM farmacia_stock_eventos WHERE farmacia_id=3 AND tipo='ENTREGA'")).rows[0].n,4);
});

test('EPS and pharmacy share authorization, order history and stock transitions',async()=>{
    await f.db.query('UPDATE eps_farmacias SET activa=true WHERE farmacia_id=3');
    const ops=require('../src/services/farmacia-operacion.service').createService(f.repo,f.catalogo);
    const integration=require('../src/services/eps-integration.service').createService({
        epsAutorizacion:{findFirst:async({where})=>where.farmacia_vinculo.farmacia_id===3?{id:50}:null}
    },{advanceOrder:(id,input,notify,actorId)=>ops.avanzarEps({id:actorId},id,input,notify)});
    const advance=(id,input)=>integration.avanzarFarmacia({id,rol:3},21,input);
    await f.db.exec(`
        INSERT INTO solicitudes(id,usuario_id,estado) VALUES(21,2,'APROBADA');
        INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES(21,1,1,10,10);
        INSERT INTO pagos(solicitud_id,usuario_id,referencia,metodo,marca,ultimos_digitos,monto,estado,simulacion)
        VALUES(21,2,'r21','TARJETA','test','0000',10,'APROBADO',false);
        INSERT INTO eps_autorizaciones(id,solicitud_id,estado,eps_id,responsable_id,afiliado_id,farmacia_vinculo_id)
        VALUES(50,21,'PENDIENTE','A',1,'a',1);`);
    await stock.ingresar(1,3,supply([{medicamentoId:1,cantidad:2}]));
    const preparando={estadoActual:'APROBADA',estado:'PREPARANDO'};
    await assert.rejects(advance(4,preparando),{status:404});
    await assert.rejects(advance(3,preparando),{codigo:'AUTORIZACION_EPS_NO_VIGENTE'});
    assert.equal((await f.db.query('SELECT * FROM farmacia_asignaciones WHERE solicitud_id=21')).rows.length,0);
    await f.db.query("UPDATE eps_autorizaciones SET estado='APROBADA' WHERE id=50");
    const [first,retry]=await Promise.all([advance(3,preparando),advance(3,preparando)]);
    assert.deepEqual(first,retry);
    await assert.rejects(f.repo.detalle(4,21),{status:404});
    await f.db.query("UPDATE eps_autorizaciones SET estado='RECHAZADA' WHERE id=50");
    await assert.rejects(f.repo.avanzar(3,21,next('PREPARANDO','LISTA',2)),{codigo:'AUTORIZACION_EPS_NO_VIGENTE'});
    await f.db.query("UPDATE eps_autorizaciones SET estado='APROBADA' WHERE id=50");
    await f.repo.avanzar(3,21,next('PREPARANDO','LISTA',2));
    const entrega={estadoActual:'LISTA',estado:'ENTREGADA'};
    await assert.rejects(advance(3,entrega),{status:400});
    const confirmada={...entrega,recepcion:'Paciente autorizado'};
    await advance(3,confirmada);
    await advance(3,confirmada);
    const {pedido}=await f.repo.detalle(3,21);
    assert.deepEqual(pedido.historial.map(e=>e.estado),['PREPARANDO','LISTA','ENTREGADA']);
    const {rows}=await f.db.query('SELECT tipo FROM farmacia_stock_eventos WHERE solicitud_id=21 ORDER BY id');
    assert.deepEqual(rows.map(e=>e.tipo),['RESERVA','ENTREGA']);
});

test('Manual stock operations preserve reserves, audit the reason and reject duplicate documents',async()=>{
    const original=await row();
    await f.db.query('UPDATE farmacia_existencias SET reservado=cantidad WHERE farmacia_id=3 AND medicamento_id=1');
    const input={tipo:'SALIDA',medicamentoId:1,cantidad:1,clave:randomUUID(),referencia:'Acta de prueba',motivo:'Retiro documentado'};
    await assert.rejects(service.movimientoManual({id:3},3,{},input),{status:403});
    await assert.rejects(service.movimientoManual({id:1},3,{},input),{codigo:'MOVIMIENTO_SALDO_INVALIDO'});
    await f.db.query('UPDATE farmacia_existencias SET reservado=$1 WHERE farmacia_id=3 AND medicamento_id=1',[original.reservado]);
    const add={...input,tipo:'AJUSTE_MAS',clave:randomUUID(),referencia:'Acta de conteo'};
    await service.movimientoManual({id:1},3,{},add);
    await service.movimientoManual({id:1},3,{},input);
    assert.equal((await service.movimientoManual({id:1},3,{},input)).repetido,true);
    await assert.rejects(service.movimientoManual({id:1},3,{}, {...input,clave:randomUUID(),referencia:input.referencia.toUpperCase()}),{status:409});
    assert.deepEqual(await row(),original);
    const audit=(await f.db.query("SELECT actor_id,motivo,tipo FROM farmacia_stock_eventos WHERE referencia='Acta de prueba'")).rows;
    assert.deepEqual(audit,[{actor_id:1,motivo:input.motivo,tipo:'SALIDA'}]);
});

test('Two assigned requests cannot reserve the same last free unit',async()=>{
    await f.db.exec(`
        INSERT INTO medicamentos(id,nombre,categoria_id,precio,stock,requiere_formula,estado)
        VALUES(22,'Last free unit',1,10,30,false,'DISPONIBLE');
        INSERT INTO solicitudes(id,usuario_id,estado) VALUES(22,2,'APROBADA'),(23,2,'APROBADA');
        INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal)
        VALUES(22,22,1,10,10),(23,22,1,10,10);
        INSERT INTO pagos(solicitud_id,usuario_id,referencia,metodo,marca,ultimos_digitos,monto,estado,simulacion)
        VALUES(22,2,'r22','TARJETA','test','0000',10,'APROBADO',false),
              (23,2,'r23','TARJETA','test','0000',10,'APROBADO',false);`);
    await stock.ingresar(1,3,supply([{medicamentoId:22,cantidad:1}]));
    await f.repo.asignar(1,22,3);
    await f.repo.asignar(1,23,3);
    const results=await Promise.allSettled([22,23].map(id=>f.repo.avanzar(3,id,next('APROBADA','PREPARANDO',1))));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.find(result=>result.status==='rejected').reason.codigo,'STOCK_PROPIO_INSUFICIENTE');
    assert.deepEqual(await row(22),{cantidad:1,reservado:1});
    const events=(await f.db.query("SELECT solicitud_id FROM farmacia_stock_eventos WHERE medicamento_id=22 AND tipo='RESERVA'")).rows;
    assert.equal(events.length,1);
});
