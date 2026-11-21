require('./support/isolate-database.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {randomUUID}=crypto;
const fixtures=path.join(__dirname,'fixtures/farmacia-preactivacion');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

test('Bloqueos: integridad de seis migraciones locales y equivalencia de cuatro variantes sintéticas',()=>{
    const {migraciones}=JSON.parse(fs.readFileSync(path.join(fixtures,'migraciones-locales.json'),'utf8'));
    assert.equal(migraciones.length,6);
    assert.equal(migraciones.filter(entry=>entry.sha256VarianteSintetica).length,4);
    const normalizar=bytes=>bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
    for(const entry of migraciones){
        const actual=fs.readFileSync(path.join(__dirname,'../prisma/migrations',entry.nombre,'migration.sql'));
        assert.equal(sha(actual),entry.sha256Local,entry.nombre);
        if(entry.sha256VarianteSintetica){
            const variante=Buffer.from('\uFEFF'+normalizar(actual).replace(/\n/g,'\r\n'));
            assert.equal(sha(variante),entry.sha256VarianteSintetica,entry.nombre);
            assert.notEqual(sha(variante),sha(actual),entry.nombre);
            assert.equal(normalizar(variante),normalizar(actual),entry.nombre);
        }
    }
});

test('Solicitudes: el DDL faltante crea solo estructuras vacías y preserva los datos',async()=>{
    const fixture=await require('./support/farmacia-postgres.cjs').preparar();
    try {
        const {db}=fixture;
        const names=['farmacia_asignaciones','farmacia_solicitud_eventos','farmacia_formulas_autorizadas',
            'farmacia_sesiones','afiliado_cuentas_origen','farmacia_rutas_eps'];
        await db.exec('DROP TABLE '+names.join(', '));
        const snapshot=async()=> (await db.query(`SELECT
           (SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text) FROM solicitudes s) AS solicitudes,
           (SELECT md5(jsonb_agg(to_jsonb(u) ORDER BY u.id)::text) FROM usuarios u) AS usuarios,
           (SELECT md5(jsonb_agg(to_jsonb(m) ORDER BY m.id)::text) FROM medicamentos m) AS medicamentos`)).rows[0];
        const before=await snapshot();
        const ddl=fs.readFileSync(path.resolve(__dirname,'../../docs/calidad/reportes/farmacia-solicitudes-ddl-faltante.sql'),'utf8');
        await db.exec(ddl);
        for(const name of names)assert.equal((await db.query('SELECT count(*)::int AS n FROM '+name)).rows[0].n,0);
        assert.deepEqual(await snapshot(),before);
    } finally { await fixture.db.close(); }
});

test('Bloqueos: identidad requiere pareja documental única; conserva ceros y no usa nombres o correo',()=>{
    const {clave,autorizados}=require('../src/services/farmacia-identidad.rules');
    assert.notEqual(clave('CC','00100'),clave('CC','100'));assert.notEqual(clave('TI','100'),clave('CC','100'));assert.equal(clave(null,'100'),null);assert.equal(clave('CC',' 100'),null);
    const p={identificador:'af-1',tipo_documento:'CC',documento:'00100'},a={afiliado_id:'af-1',tipo_documento:'CC',cedula:'00100'};
    assert.deepEqual(autorizados([p],[a]),['af-1']);
    for(const wrong of [{...a,cedula:'100'},{...a,tipo_documento:'TI'},{...a,afiliado_id:'af-2'}])assert.deepEqual(autorizados([p],[wrong]),[]);
    assert.deepEqual(autorizados([p,{...p,identificador:'af-2'}],[a]),[]);
    assert.deepEqual(autorizados([p],[a,{...a,afiliado_id:'af-2'}]),[]);
});

test('Bloqueos PostgreSQL: cambios documentales posteriores retiran acceso sin borrar asignación ni historial',async()=>{
    const f=await require('./support/farmacia-postgres.cjs').preparar();
    try{
        await f.repo.asignar(1,1,3);assert.equal((await f.repo.detalle(3,1)).pedido.id,1);
        await f.db.query("UPDATE usuarios SET tipo_documento='TI' WHERE id=2");await assert.rejects(f.repo.detalle(3,1),{status:404});await assert.rejects(f.repo.vincularIdentidad(1,3,2,'a'),{status:403});
        assert.equal((await f.repo.estadisticas(3,{desde:'2026-01-01',hasta:'2026-12-31'})).indicadores.solicitudesPendientes,0);
        await f.db.query("UPDATE usuarios SET tipo_documento='CC',cedula='0100' WHERE id=2");await assert.rejects(f.repo.detalle(3,1),{status:404});
        await f.db.query("UPDATE usuarios SET cedula='100' WHERE id=2");await f.db.query("UPDATE afiliados SET documento='101' WHERE id='a'");await assert.rejects(f.repo.detalle(3,1),{status:404});
        assert.equal((await f.db.query('SELECT count(*)::int AS n FROM farmacia_asignaciones WHERE solicitud_id=1')).rows[0].n,1);
        assert.equal((await f.db.query('SELECT count(*)::int AS n FROM afiliado_cuentas_origen WHERE usuario_id=2')).rows[0].n,1);
    }finally{await f.db.close();}
});

test('Bloqueos: carga offline exige manifiesto aprobado e íntegro, conserva clave y orden canónico',()=>{
    const {preparar}=require('../scripts/farmacia-preparar-carga-stock.cjs');
    const m={estado:'APROBADO',farmaciaId:4,actorAdminId:1,aprobacion:'ACTA-SOLO-FIXTURE',fechaConteo:'2026-11-17T15:00:00Z',referenciaDocumental:'RECEPCION-FIXTURE-001',claveIngresoUuidV4:randomUUID(),items:[{medicamentoId:2,cantidad:3},{medicamentoId:1,cantidad:2}]};
    const bytes=Buffer.from(JSON.stringify(m)),plan=preparar(bytes,sha(bytes));
    assert.equal(plan.modo,'SOLO_PREPARACION_NO_ENVIADO');assert.equal(plan.cuerpo.clave,m.claveIngresoUuidV4);assert.deepEqual(plan.cuerpo.items.map(i=>i.medicamentoId),[1,2]);
    assert.equal(plan.huellaServicio,sha(JSON.stringify({farmaciaId:4,...plan.cuerpo})));
    assert.equal(preparar(bytes,sha(bytes)).huellaServicio,plan.huellaServicio);
    assert.throws(()=>preparar(Buffer.from(JSON.stringify({...m,items:[{medicamentoId:1,cantidad:50}]})),sha(bytes)),/SHA256/);
    for(const change of [{estado:'PENDIENTE'},{items:[]},{claveIngresoUuidV4:null},{items:[{medicamentoId:1,cantidad:0}]},{items:[{medicamentoId:1,cantidad:2},{medicamentoId:1,cantidad:2}]}]){const b=Buffer.from(JSON.stringify({...m,...change}));assert.throws(()=>preparar(b,sha(b)));}
    const template=fs.readFileSync(path.join(fixtures,'existencias-pendientes.json'));
    assert.throws(()=>preparar(template,sha(template)),/Faltan conteo, actor, farmacia o aprobación documental/);
});

test('Bloqueos: solo un pago real aprobado permite pasar la condición económica; receta desconocida/requerida sigue cerrada',()=>{
    const {operacion}=require('../src/services/farmacia-operacion.rules');
    const pedido={estado:'APROBADA',detalles:[{medicamento:{requiere_formula:false}}]};
    for(const simulacion of [true,null,undefined,'false'])assert.ok(operacion({...pedido,pagos:[{estado:'APROBADO',simulacion}]}).bloqueos.includes('PAGO_REAL_NO_APROBADO'));
    assert.equal(operacion({...pedido,pagos:[{estado:'APROBADO',simulacion:false}]}).siguienteEstado,'PREPARANDO');
    for(const requiere_formula of [true,null])assert.equal(operacion({...pedido,detalles:[{medicamento:{requiere_formula}}],pagos:[{estado:'APROBADO',simulacion:false}]}).siguienteEstado,null);
});

test('Bloqueos: el importador INVIMA no deduce requisito de receta de nombres, categorías o una columna no autorizada',async()=>{
    const importer=require('../scripts/importar-catalogo-invima');
    const row={cum:'PRUEBA',consecutivo:'1',expediente:'fixture',producto:'Producto de prueba',principio_activo:'No clasificar',registro_sanitario:'REG-FIXTURE',estado_registro:'Vigente',estado_cum:'Activo',muestra_medica:'No',modalidad:'FABRICAR Y VENDER',titular:'Fixture',requiere_formula:false};
    let inserted;const prisma={categoria:{upsert:async()=>({id:1})},medicamento:{createMany:async({data})=>{inserted=data;return {count:data.length};},count:async()=>1}};
    await importer.importCatalog([row],prisma,1);assert.equal(inserted[0].requiere_formula,null);assert.equal(inserted[0].catalogo_verificado,false);
});
