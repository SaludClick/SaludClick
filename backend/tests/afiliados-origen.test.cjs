const {test}=require('node:test');
const assert=require('node:assert/strict');
const {configuracionEPS}=require('../src/config/eps-prisma');
const {crearOrigen}=require('../src/repositories/afiliados-origen.repository');
const {CAMPOS}=require('../src/services/afiliados-import.service');
test('la fuente exige EPS_DATABASE_URL: no utiliza DATABASE_URL como sustituto',()=>{
    assert.throws(()=>configuracionEPS({DATABASE_URL:'postgresql://fixture:clave@primary.test/app'}),e=>e.codigo==='EPS_SOURCE_NOT_CONFIGURED'&&e.status===503);
    const c=configuracionEPS({EPS_DATABASE_URL:'postgresql://fixture:secreto@source.test/original?sslmode=disable'});assert.equal(c.servidor,'source.test');assert.equal(new URL(c.url).searchParams.get('sslmode'),'verify-full');
    const local=configuracionEPS({EPS_DATABASE_URL:'postgresql://fixture:clave@127.0.0.1:55434/test?sslmode=disable'});assert.equal(new URL(local.url).searchParams.get('sslmode'),'disable');
});
test('rechaza esquemas y opciones que podrían alterar el destino sin revelar credenciales',()=>{
    for(const env of [{EPS_DATABASE_URL:'no-es-url'},{EPS_DATABASE_URL:'postgresql://fixture:secreto@source.test/original?host=otra'},{EPS_DATABASE_URL:'postgresql://fixture:secreto@source.test/original',EPS_DATABASE_SCHEMA:'public"; DROP TABLE usuarios;'}])assert.throws(()=>configuracionEPS(env),e=>e.codigo==='EPS_SOURCE_INVALID'&&!e.message.includes('secreto'));
});
function origenSimulado({catalogo=true,duplicado=false,incompleto=false}={}){
    const llamadas=[];const original=Object.fromEntries(CAMPOS.map(c=>[c,c==='id'?'1':c==='documento'?'0001':c==='eps_id'?'1':`${c}-fixture`]));
    const tx={$executeRaw:async sql=>{llamadas.push(sql.join(''));},$queryRaw:async sql=>{const texto=sql.sql||sql.join('');llamadas.push(texto);if(texto.includes('current_database'))return[{base:'origen_test'}];if(texto.includes('information_schema'))return [...CAMPOS.filter(c=>!incompleto||c!=='correo').map(column_name=>({table_name:'afiliados',column_name})),...(catalogo?['id','nombre'].map(column_name=>({table_name:'eps',column_name})):[])];const r={...original,_eps_id:catalogo?'1':null,_eps_nombre:catalogo?'EPS del catálogo original de prueba':null};return duplicado?[r,r]:[r];}};
    const prisma={$transaction:async(fn,opciones)=>{assert.equal(opciones.isolationLevel,'RepeatableRead');return fn(tx);}};
    return {origen:crearOrigen({obtenerConexion:()=>({prisma,esquema:'public',servidor:'source.test',puerto:'5432'})}),llamadas,original};
}
test('consulta los 13 campos con transacción READ ONLY y nombre solo desde eps.id original',async()=>{
    const s=origenSimulado();const r=await s.origen.leer();assert.equal(s.llamadas[0],'SET TRANSACTION READ ONLY');for(const c of CAMPOS)assert.equal(r.afiliados[0][c],s.original[c]);assert.equal(r.afiliados[0].eps.nombre,'EPS del catálogo original de prueba');assert.match(s.llamadas.at(-1),/LEFT JOIN "public"\."eps"/);assert.ok(!s.llamadas.some(l=>/UPDATE |INSERT |DELETE |CREATE |ALTER /i.test(l)));
});
test('sin catálogo EPS no inventa nombre y sin campos o con duplicados rechaza la fuente',async()=>{
    const s=origenSimulado({catalogo:false});assert.equal((await s.origen.leer()).afiliados[0].eps,null);assert.doesNotMatch(s.llamadas.at(-1),/LEFT JOIN/);
    for(const opciones of [{duplicado:true},{incompleto:true}])await assert.rejects(origenSimulado(opciones).origen.leer(),e=>e.status===503&&e.codigo==='EPS_SOURCE_SCHEMA_INVALID');
});
