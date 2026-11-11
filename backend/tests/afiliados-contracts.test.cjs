const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const jwt=require('jsonwebtoken');
const bcrypt=require('bcrypt');
const {CAMPOS}=require('../src/services/afiliados-import.service');
const {crearServicio}=require('../src/services/afiliados-consulta.service');
const {crearRouter}=require('../src/routes/afiliados.routes');
// Fixtures exclusivos de contratos HTTP: nunca se importan en PostgreSQL.
const originales=Array.from({length:50},(_,i)=>({id:String(i+1),nombres:`Persona ${i+1}`,apellidos:`Apellido ${i+1}`,tipo_documento:'CC',documento:`D${String(i+1).padStart(4,'0')}`,fecha_nacimiento:'1990-01-01',telefono:'0000000000',correo:`fixture${i+1}@example.test`,direccion:'Dirección de prueba',ciudad:'Ciudad de prueba',regimen:'Régimen de prueba',estado:i%2?'Inactivo':'Activo',eps_id:i<25?'1':'2',eps:i<25?{id:'1',nombre:'Entidad original de prueba'}:null}));
let cuentas=[],autorizado=true,rol='PACIENTE',errorOrigen,errorAutorizacion,lecturas=0,cambio=false,version=0;
const origen={leer:async()=>{lecturas++;if(errorOrigen)throw errorOrigen;return{afiliados:structuredClone(originales).map(a=>version?{...a,estado:'CAMBIO SIMULADO'}:a),conexion:{servidor:'eps-source.test',puerto:'5432',base:'eps_original_test',esquema:'public',tabla:'public.afiliados',catalogoEps:true}};}};
const prisma={
    usuario:{
        findMany:async()=>structuredClone(cuentas),
        findFirst:async({where})=>cuentas.find(u=>where.OR.some(w=>w.cedula===u.cedula||w.correo?.equals.toLowerCase()===u.correo.toLowerCase()))||null,
        create:async({data})=>{const u={id:101,...data};cuentas.push(u);if(cambio)version++;return{id:u.id,estado:u.estado};}
    },
    pacienteAutorizado:{findUnique:async({where})=>{if(errorAutorizacion)throw errorAutorizacion;const a=originales.find(a=>a.documento===where.cedula);return autorizado&&a?{...a,id:1,cedula:a.documento,estado:'AUTORIZADO'}:null;}},
    rol:{findUnique:async()=>({id:2,nombre:rol})},
    $transaction:async(fn,opciones)=>{assert.equal(opciones.isolationLevel,'Serializable');const antes=structuredClone(cuentas);try{return await fn(prisma);}catch(e){cuentas=antes;throw e;}}
};
let server,origin;
const secretoAnterior=process.env.JWT_SECRET;
before(async()=>{
    process.env.JWT_SECRET='afiliados-source-contract-test';
    const app=express();app.use(express.json());app.use('/afiliados',crearRouter({servicio:crearServicio({origen,prisma})}));
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin=`http://127.0.0.1:${server.address().port}/afiliados`;
});
after(async()=>{await new Promise(r=>server.close(r));if(secretoAnterior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secretoAnterior;});
beforeEach(()=>{cuentas=[];autorizado=true;rol='PACIENTE';errorOrigen=undefined;errorAutorizacion=undefined;lecturas=0;cambio=false;version=0;});
async function pedir(ruta='',role=1,body){const headers={};if(role)headers.Authorization=`Bearer ${jwt.sign({id:17,rol_id:role},process.env.JWT_SECRET)}`;if(body)headers['Content-Type']='application/json';const r=await fetch(origin+ruta,{headers,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});return{status:r.status,headers:r.headers,data:await r.json()};}
function cuentaDe(a,extras={}){return{id:100,nombre:a.nombres,apellido:a.apellidos,cedula:a.documento,tipo_documento:a.tipo_documento,correo:a.correo,estado:'ACTIVO',rol_id:2,...extras};}
test('JWT y rol administrador protegen lista, ficha, diagnóstico y creación antes de leer el origen',async()=>{
    for(const role of [null,2,3,4])for(const [ruta,body]of [['',undefined],['/1',undefined],['/diagnostico/conexion',undefined],['/1/cuenta',{verificado:true,password:'password-test'}]])assert.equal((await pedir(ruta,role,body)).status,role?403:401);
    assert.equal(lecturas,0);
});
test('diagnóstico identifica la conexión EPS original sin credenciales',async()=>{
    const r=await pedir('/diagnostico/conexion');assert.equal(r.status,200);assert.equal(r.data.conexion.base,'eps_original_test');assert.equal(r.data.conexion.servidor,'eps-source.test');assert.ok(!JSON.stringify(r.data).includes('password'));
});
test('fuente PostgreSQL: 50 registros, cinco páginas, total real y 13 valores originales en ficha',async()=>{
    const ids=new Set();for(let p=1;p<=5;p++){const r=await pedir('?pagina='+p);assert.equal(r.status,200);assert.equal(r.data.total,50);assert.equal(r.data.afiliados.length,10);assert.equal(r.headers.get('cache-control'),'no-store');r.data.afiliados.forEach(a=>ids.add(a.id));}
    assert.equal(ids.size,50);
    const d=await pedir('/1');for(const c of CAMPOS)assert.equal(d.data.afiliado[c],originales[0][c]);assert.deepEqual(d.data.afiliado.eps,originales[0].eps);assert.equal(d.data.puedeCrearCuenta,true);
    assert.equal((await pedir('/ausente')).status,404);
});
test('búsqueda por documento, correo y nombre completo; filtros EPS y estados combinados',async()=>{
    for(const buscar of ['D0001','fixture1@example.test','Persona 1 Apellido 1']){const r=await pedir('?buscar='+encodeURIComponent(buscar));assert.equal(r.status,200);assert.ok(r.data.afiliados.some(a=>a.id==='1'));}
    const r=await pedir('?eps=1&estado=Activo&cuenta=SIN_CUENTA');assert.equal(r.data.coincidencias,13);assert.deepEqual(r.data.filtros.eps,['1','2']);assert.deepEqual(r.data.filtros.epsConfirmadas,[originales[0].eps]);
    assert.equal((await pedir('?cuenta=OTRO')).status,400);assert.equal((await pedir('?pagina=-1')).status,400);assert.equal((await pedir('?eps=1&eps=2')).status,400);
});
test('vínculo por documento único exige identidad completa y rol paciente; no escribe en el origen',async()=>{
    cuentas=[cuentaDe(originales[0])];const d=await pedir('/1');assert.equal(d.data.afiliado.usuario.id,100);assert.equal(d.data.puedeCrearCuenta,false);
    assert.equal((await pedir('?cuenta=ACTIVO')).data.coincidencias,1);
    cuentas=[cuentaDe(originales[0],{rol_id:3})];const conflicto=await pedir('/1');assert.equal(conflicto.data.afiliado.usuario,null);assert.equal(conflicto.data.afiliado.cuenta_conflicto,true);assert.equal(conflicto.data.puedeCrearCuenta,false);
    assert.equal((await pedir('?cuenta=SIN_CUENTA')).data.coincidencias,49);
});
test('sin fuente configurada o con conexión fallida responde 503 y no inventa total cero',async()=>{
    errorOrigen={status:503,codigo:'EPS_SOURCE_NOT_CONFIGURED',message:'Falta configurar EPS_DATABASE_URL en el entorno del backend.'};const r=await pedir('');assert.equal(r.status,503);assert.equal(r.data.codigo,'EPS_SOURCE_NOT_CONFIGURED');assert.equal(r.data.total,undefined);assert.equal(r.data.afiliados,undefined);
    errorOrigen={code:'P1001'};assert.equal((await pedir('')).status,503);
});
test('ausencia del registro de autorización no impide consultar fichas y bloquea crear cuentas',async()=>{
    errorAutorizacion={code:'P2021'};const r=await pedir('/1');assert.equal(r.status,200);assert.equal(r.data.puedeCrearCuenta,false);assert.match(r.data.motivoCuenta,/autorizaciones/);assert.equal(r.data.afiliado.documento,originales[0].documento);
});
test('creación exige revisión y autorización; conserva los 13 campos y evita documentos/correos duplicados',async()=>{
    const body={verificado:true,password:'password-test'};assert.equal((await pedir('/1/cuenta',1,{...body,verificado:false})).status,400);
    autorizado=false;assert.equal((await pedir('/1/cuenta',1,body)).status,403);autorizado=true;
    rol='usuario';assert.equal((await pedir('/1/cuenta',1,body)).status,403);rol='PACIENTE';
    cuentas=[cuentaDe(originales[1],{correo:originales[0].correo})];assert.equal((await pedir('/1/cuenta',1,body)).status,409);cuentas=[];
    const antes=structuredClone(originales);const r=await pedir('/1/cuenta',1,body);assert.equal(r.status,201);assert.equal(cuentas[0].rol_id,2);assert.equal(cuentas[0].cedula,originales[0].documento);assert.equal(cuentas[0].correo,originales[0].correo);assert.ok(await bcrypt.compare(body.password,cuentas[0].password));assert.equal(JSON.stringify(r.data).includes('password'),false);assert.deepEqual(originales,antes);
    assert.equal((await pedir('/1')).data.afiliado.usuario.id,101);assert.equal((await pedir('/1/cuenta',1,body)).status,409);assert.equal(cuentas.length,1);
});
test('cambio de datos de origen durante la revisión revierte la cuenta y exige reabrir la ficha',async()=>{
    cambio=true;const r=await pedir('/1/cuenta',1,{verificado:true,password:'password-test'});assert.equal(r.status,409);assert.equal(cuentas.length,0);
});
