const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {validarPlan,MIGRACIONES}=require('../scripts/ejecutar-plan-afiliados-neon.cjs');
const previousHost=process.env.AFILIADOS_EXPECTED_HOST;
before(()=>{process.env.AFILIADOS_EXPECTED_HOST='db.example.com';});
after(()=>{if(previousHost===undefined)delete process.env.AFILIADOS_EXPECTED_HOST;else process.env.AFILIADOS_EXPECTED_HOST=previousHost;});
test('plan Neon limita las migraciones al módulo Afiliados, autorización y rol paciente',()=>{
    assert.equal(MIGRACIONES.length,3);
    assert.ok(MIGRACIONES.every(m=>!/(add_chat|catalogo|order_idempotency|eps_role)/.test(m)));
});
test('el plan vigente de consulta de origen prohíbe importar incluso con una antigua aprobación',()=>{
    assert.throws(()=>validarPlan({modo:'CONSULTA_ORIGEN_SIN_ESCRITURAS'},null,null,null,'aprobación-antigua'),/no autoriza importaciones ni migraciones/);
});
test('plan bloquea producción cuando falta validación EPS o confirmación exacta',()=>{
    const bytes=Buffer.from('archivo de prueba'),huella=crypto.createHash('sha256').update(bytes).digest('hex');
    const plan={destino:{servidor:'db.example.com',base:'neondb',esquema:'public'},respaldo:{restauracionVerificada:true,sha256:huella},csv:{sha256:huella},eps:{validada:false}};
    assert.throws(()=>validarPlan(plan,bytes,bytes,null,undefined),/Falta verificar la EPS/);
    assert.throws(()=>validarPlan({...plan,destino:{...plan.destino,base:'otra'}},bytes,bytes,null,undefined),/Destino distinto/);
    assert.throws(()=>validarPlan(plan,Buffer.from('cambiado'),bytes,null,undefined),/no coinciden/);
});
test('migración del rol modifica solo el nombre del rol 2 y no crea cuentas',()=>{
    const sql=fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261111190000_normalize_paciente_role/migration.sql'),'utf8');
    assert.match(sql,/UPDATE "roles" SET "nombre" = 'PACIENTE' WHERE "id" = 2/);
    assert.doesNotMatch(sql,/INSERT INTO "usuarios"|UPDATE "usuarios"|DELETE/i);
});
test('plan con fuente válida exige hash de aprobación exacto y cobertura de cada EPS ID',()=>{
    const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
    const campos='id,nombres,apellidos,tipo_documento,documento,fecha_nacimiento,telefono,correo,direccion,ciudad,regimen,estado,eps_id'.split(',');
    const fuente=Buffer.from([campos.join(','),...Array.from({length:50},(_,i)=>campos.map(c=>c==='eps_id'?'1':String(i+1)).join(','))].join('\n'));
    const backup=Buffer.from('respaldo-prueba'),eps=Buffer.from(JSON.stringify([{id:'1'}]));
    const plan={destino:{servidor:'db.example.com',base:'neondb',esquema:'public'},respaldo:{restauracionVerificada:true,sha256:hash(backup)},csv:{sha256:hash(fuente)},eps:{validada:true,sha256Fuente:hash(eps)},ejecucionProduccionAutorizada:true};
    const aprobado=hash(Buffer.from(JSON.stringify(plan)));
    assert.doesNotThrow(()=>validarPlan(plan,fuente,backup,eps,aprobado));
    assert.throws(()=>validarPlan(plan,fuente,backup,eps,'otro-plan'),/confirmación del plan exacto/);
    const incompleta=Buffer.from(JSON.stringify([{id:'2'}]));
    const cambiado={...plan,eps:{validada:true,sha256Fuente:hash(incompleta)}};
    assert.throws(()=>validarPlan(cambiado,fuente,backup,incompleta,hash(Buffer.from(JSON.stringify(cambiado)))),/no cubre todos/);
});
