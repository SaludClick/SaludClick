require('./support/isolate-database.cjs');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const http = require('node:http');
let records, calls, failure;
const users = [{ id: 30, rol_id: 3, estado: 'ACTIVO' }, { id: 31, rol_id: 3, estado: 'INACTIVO' }, { id: 32, rol_id: 4, estado: 'ACTIVO' }];
function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
        if (key === 'AND') return value.every(condition => matches(row, condition));
        if (key === 'OR') return value.some(condition => matches(row, condition));
        if (value && typeof value === 'object') {
            if ('in' in value) return value.in.includes(row[key]);
            if ('lte' in value) return row[key] > value.gt && row[key] <= value.lte;
            if ('gt' in value) return row[key] > value.gt;
            if ('gte' in value) return row[key] >= value.gte;
            if ('lt' in value) return row[key] < value.lt;
            if ('contains' in value) return typeof row[key] === 'string' && row[key].toLowerCase().includes(value.contains.toLowerCase());
        }
        return row[key] === value;
    });
}
function project(row, select) {
    return row ? Object.fromEntries(Object.entries(select).map(([key, spec]) => [key, spec === true ? row[key] : project(row[key], spec.select)])) : null;
}
const db = {
    usuario: { findUnique: async ({ where }) => users.find(user => user.id === where.id) || null },
    medicamento: {
        async findMany(options) { calls.push({ operation: 'list', options }); if (failure) throw failure;
            return records.filter(row => matches(row, options.where)).sort((a,b) => a.nombre.localeCompare(b.nombre) || a.id-b.id).slice(options.skip, options.skip+options.take).map(row => project(row, options.select)); },
        async count({ where } = {}) { if (failure) throw failure; return records.filter(row => matches(row, where)).length; },
        async findUnique({ where, select }) { calls.push({ operation: 'detail', where }); if (failure) throw failure; return project(records.find(row => row.id === where.id), select); }
    },
    solicitud: { findMany: async () => [], count: async () => 0, groupBy: async () => [] },
    $transaction: operation => operation(db)
};
for (const method of ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany']) db.medicamento[method] = () => assert.fail('Una consulta intentó escribir existencias.');
require.cache[require.resolve('../src/config/prisma')].exports = db;
require.cache[require.resolve('../src/config/database')].exports = { query: async () => ({ rows: [] }) };
const origins = new Set(); require('../src/config/cors').getAllowedOrigins = () => origins;
const app = require('../src/app');
let server, origin;
const oldSecret = process.env.JWT_SECRET, oldFlag = process.env.FARMACIA_NOTIFICACIONES_ENABLED;
before(async () => {
    process.env.JWT_SECRET = 'pharmacy-stock-isolated-only'; process.env.FARMACIA_NOTIFICACIONES_ENABLED = 'false';
    server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`; origins.add(origin);
});
after(async () => {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of [['JWT_SECRET', oldSecret], ['FARMACIA_NOTIFICACIONES_ENABLED', oldFlag]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function medication(id, overrides = {}) {
    return { id, nombre: `Medicamento ${String(id).padStart(3,'0')}`, presentacion: 'Caja de prueba', estado: 'DISPONIBLE', stock: 10,
        categoria: { nombre: 'Categoría de prueba' }, requiere_formula: id % 3 === 0 ? null : id % 3 === 1,
        descripcion: 'Descripción de prueba aislada', nombre_generico: 'Genérico de prueba', principio_activo: 'Sustancia de prueba',
        concentracion: '10 mg', forma_farmaceutica: 'Tableta', via_administracion: 'Oral', registro_sanitario: `TEST-${id}`,
        estado_registro_invima: 'Sin verificar', catalogo_verificado: false, cum: `CUM-${id}`, ium: null,
        titular_registro: null, modalidad_comercializacion: null, created_at: new Date(), updated_at: new Date(),
        precio: 100, codigo_fuente: 'interno-no-expuesto', ...overrides };
}
beforeEach(() => {
    records = Array.from({ length: 55 }, (_, i) => medication(i+1));
    records.push(medication(56, { stock: 0 }), medication(57, { stock: 0, estado: 'AGOTADO' }), medication(58, { estado: 'INACTIVO' }),
        medication(59, { stock: -2 }), medication(60, { estado: 'AGOTADO', stock: 5 }), medication(61, { estado: null }));
    calls = []; failure = null;
});
const token = (id = 30, role = 3, expiresIn = '1h') => jwt.sign({ id, rol: role }, process.env.JWT_SECRET, { expiresIn });
async function request(path, { id = 30, role = 3, auth, method = 'GET' } = {}) {
    const response = await fetch(`${origin}/api/farmacia${path}`, { method, headers: role === null ? {} : { Authorization: `Bearer ${auth || token(id,role)}` } });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
}
test('JWT, cuenta activa y rol actual 3 protegen inventario, catálogo, detalles y dashboard', async () => {
    for (const path of ['/inventario','/inventario/1','/medicamentos','/medicamentos/1','/dashboard']) {
        for (const role of [null,1,2,4,99]) assert.equal((await request(path,{role})).status,role === null ? 401 : 403);
        for (const id of [31,32,999]) assert.equal((await request(path,{id})).status,403);
        assert.equal((await request(path,{auth:token(30,3,-1)})).status,401);
    }
    assert.equal(calls.length,0);
});
test('paginación estable y resumen global: disponibles requieren stock positivo y estado disponible', async () => {
    for (const path of ['/inventario','/medicamentos']) {
        const first = await request(path), second = await request(`${path}?pagina=2`);
        assert.equal(first.status,200); assert.equal(first.cache,'no-store'); assert.equal(first.data.medicamentos.length,25);
        assert.deepEqual(first.data.resumen,{total:61,disponibles:55,agotados:2,inactivos:1,inconsistentes:2,desconocidos:1,bajos:0});
        assert.equal(first.data.medicamentos.some(a=>second.data.medicamentos.some(b=>a.id===b.id)),false);
        assert.equal((await request(`${path}?tamano=50`)).data.medicamentos.length,50);
        assert.deepEqual((await request(`${path}?pagina=100`)).data.medicamentos,[]);
    }
});
test('búsqueda por nombre, principio activo, presentación y registro, combinada con disponibilidad y fórmula', async () => {
    assert.equal((await request('/medicamentos?buscar=medicamento%20001')).data.paginacion.total,1);
    assert.equal((await request('/medicamentos?buscar=TEST-55')).data.paginacion.total,1);
    assert.equal((await request('/medicamentos?buscar=sustancia')).data.paginacion.total,61);
    assert.equal((await request('/inventario?buscar=CAJA&disponibilidad=agotados')).data.paginacion.total,2);
    const result=await request('/medicamentos?disponibilidad=disponibles&formula=desconocido');
    assert.ok(result.data.medicamentos.length); assert.ok(result.data.medicamentos.every(m=>m.stock>0&&m.requiere_formula===null));
    assert.equal(result.data.resumen.total,61);
});
test('estados contradictorios y saldo negativo se señalan sin ocultarlos, corregirlos ni usarlos como disponibilidad', async () => {
    const before=structuredClone(records);
    const result=await request('/inventario?disponibilidad=inconsistentes');
    assert.deepEqual(result.data.medicamentos.map(m=>m.id),[59,60]);
    assert.equal(result.data.medicamentos[0].stock,-2); assert.equal(result.data.medicamentos[0].disponibilidad,'INCONSISTENTE');
    assert.equal((await request('/inventario?disponibilidad=desconocidos')).data.paginacion.total,1);
    assert.equal((await request('/inventario?disponibilidad=inactivos')).data.paginacion.total,1);
    assert.deepEqual(records,before);
});
test('detalle farmacéutico existente y fórmula desconocida explícita; sin inventar lotes ni exponer campos internos', async () => {
    for(const path of ['/inventario/3','/medicamentos/3']) {
        const result=await request(path); assert.equal(result.status,200);
        assert.equal(result.data.medicamento.requisitoFormula,'DESCONOCIDO');
        assert.equal(result.data.medicamento.presentacion,'Caja de prueba');
        for(const field of ['precio','codigo_fuente','lotes','vencimientos','stock_minimo']) assert.equal(result.data.medicamento[field],undefined);
    }
    assert.equal((await request('/medicamentos/1')).data.medicamento.requisitoFormula,'REQUIERE');
    assert.equal((await request('/medicamentos/2')).data.medicamento.requisitoFormula,'NO_REQUIERE');
    assert.equal((await request('/inventario/999')).status,404);
});
test('validación de filtros, IDs y máximo de página antes de consultar medicamentos', async () => {
    for(const query of ['?pagina=0','?pagina=100001','?tamano=51','?disponibilidad=libre','?formula=true','?buscar='+ 'x'.repeat(151),'?buscar=%00','?usuario_id=30','?pagina=1&pagina=2']) assert.equal((await request('/inventario'+query)).status,400,query);
    for(const path of ['/inventario/0','/medicamentos/2147483648','/inventario/1?extra=1']) assert.equal((await request(path)).status,400);
    assert.equal(calls.length,0);
});
test('sin escrituras en consultas; las rutas nuevas no ofrecen POST/PATCH/DELETE', async () => {
    const before=structuredClone(records);
    for(const path of ['/inventario','/medicamentos','/inventario/1','/medicamentos/1']) {
        assert.equal((await request(path)).status,200);
        for(const method of ['POST','PATCH','DELETE']) assert.equal((await request(path,{method})).status,404);
    }
    assert.deepEqual(records,before); assert.equal(process.env.FARMACIA_NOTIFICACIONES_ENABLED,'false');
});
test('error de proveedor se sanitiza y vacío real conserva conteos cero', async () => {
    failure=new Error('private provider secret');
    for(const path of ['/inventario','/medicamentos','/inventario/1']) { const result=await request(path); assert.equal(result.status,500); assert.equal(JSON.stringify(result.data).includes('secret'),false); }
    failure=null;records=[];const result=await request('/inventario');
    assert.deepEqual(result.data.medicamentos,[]);assert.equal(result.data.resumen.total,0);
});
test('navegador: búsquedas, filtros, paginación, detalle, requisitos, recarga, errores y responsive', {timeout:60000},async t=>{
    const fs=require('node:fs');if(!fs.existsSync(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')) {t.skip('Edge no disponible');return;}
    records[0].nombre='<img src=x> Prueba';
    const browser=await require('./support/afiliados-edge.cjs').abrirEdge();const {evaluate,send,until}=browser;
    const sel=tipo=>`[data-existencias="${tipo}"]`;
    const click=async selector=>until(()=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)return false;b.click();return true;})()`));
    const filter=async(tipo,key,value)=>{
        await evaluate(`document.querySelector(${JSON.stringify(sel(tipo)+` [data-existencias-part="${key}"]`)}).value=${JSON.stringify(value)};document.querySelector(${JSON.stringify(sel(tipo)+' form')}).requestSubmit();`);
        await until(()=>evaluate(`document.querySelector(${JSON.stringify(sel(tipo)+' tbody')}).getAttribute('aria-busy')==='false'`));
    };
    try{
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.SALUDCLICK_API_URL=location.origin;sessionStorage.setItem('saludclick_token',${JSON.stringify(token())});sessionStorage.setItem('saludclick_user',JSON.stringify({id:30,rol:3,nombre:'Prueba aislada'}));`});
        await send('Page.navigate',{url:`${origin}/pages/farmacia-inventario.html`});
        await until(()=>evaluate(`document.querySelectorAll('#farmaciaInventory tr').length===25`));
        assert.equal(await evaluate(`document.querySelectorAll('.farmacia-existencias img').length`),0);
        records[1].stock = 1; records[2].stock = 5;
        await filter('inventario','disponibilidad','bajos');
        await until(()=>evaluate(`document.querySelectorAll('#farmaciaInventory tr').length===2`));
        assert.ok(await evaluate(`document.querySelector('[data-existencias-part="alerta-bajo"]').textContent.includes('2 medicamentos')`));
        assert.ok(await evaluate(`document.querySelector('#farmaciaInventory').textContent.includes('Stock bajo')`));
        await send('Page.reload');
        await until(()=>evaluate(`document.querySelector('[data-existencias-part="disponibilidad"]').value==='bajos' && document.querySelectorAll('#farmaciaInventory tr').length===2`));
        await click(sel('inventario')+' [data-existencias-part="limpiar"]');
        await until(()=>evaluate(`document.querySelectorAll('#farmaciaInventory tr').length===25`));
        await click(sel('inventario')+' [data-existencias-part="siguiente"]');
        await until(()=>evaluate(`document.querySelector('#inventoryPage').textContent.includes('Página 2')`));
        await filter('inventario','disponibilidad','agotados');
        await until(()=>evaluate(`document.querySelectorAll('#farmaciaInventory tr').length===2`));
        await click(sel('inventario')+' [data-medication-id="56"]');
        await until(()=>evaluate(`document.querySelector(${JSON.stringify(sel('inventario')+' [data-existencias-part="contenido"]')}).textContent.includes('Registro sanitario')`));
        await click(sel('inventario')+' [data-existencias-part="cerrar"]');
        await send('Page.navigate',{url:`${origin}/pages/farmacia-medicamentos.html`});
        await until(()=>evaluate(`document.querySelectorAll('#farmaciaMedicamentos tr').length===25`));
        await filter('catalogo','formula','desconocido');
        assert.ok(await evaluate(`document.querySelector('#farmaciaMedicamentos').textContent.includes('Requisito desconocido')`));
        await click(sel('catalogo')+' [data-existencias-part="limpiar"]');
        await filter('catalogo','buscar','TEST-3');
        assert.ok(await evaluate(`document.querySelector('#farmaciaMedicamentos').textContent.includes('Medicamento')`));
        for(const width of [1440,820,390]){
            await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
            assert.ok(await evaluate(`Array.from(document.querySelectorAll('.farmacia-existencias')).every(p=>p.getBoundingClientRect().right<=innerWidth+1&&p.scrollWidth<=p.clientWidth+1)`));
        }
        await send('Page.navigate',{url:`${origin}/pages/farmacia-inventario.html`});
        await until(()=>evaluate(`document.querySelectorAll('#farmaciaInventory tr').length===25`));
        await filter('inventario','buscar','SIN_COINCIDENCIA');
        await until(()=>evaluate(`document.querySelector('#inventoryEmpty').textContent.includes('No se encontraron')`));
        failure=new Error('private isolated error');await click(sel('inventario')+' [data-existencias-part="actualizar"]');
        await until(()=>evaluate(`document.querySelector('#inventoryEmpty').getAttribute('role')==='alert'`));
        assert.equal(await evaluate(`document.querySelector(${JSON.stringify(sel('inventario')+' [data-existencias-count="total"]')}).textContent`),'—');
        failure=null;await send('Page.reload');
        await until(()=>evaluate(`document.querySelector('#buscarFarmacia').value==='SIN_COINCIDENCIA' && document.querySelector('#inventoryEmpty').textContent.includes('No se encontraron')`));
        await click(sel('inventario')+' [data-existencias-part="limpiar"]');
        await until(()=>evaluate(`document.querySelectorAll('#farmaciaInventory tr').length===25`));
        assert.deepEqual(browser.errores,[]);
    }finally{await browser.cerrar();}
});

 test('stock bajo: límites, filtros, resumen global y aviso sin modificar saldos', async () => {
    records = [medication(1,{stock:0}), medication(2,{stock:1}), medication(3,{stock:5}),
        medication(4,{stock:6}), medication(5,{stock:-1}), medication(6,{stock:2,estado:'INACTIVO'}),
        medication(7,{stock:2,estado:null}), medication(8,{stock:2,estado:'AGOTADO'})];
    const before = structuredClone(records);
    const result = await request('/inventario?disponibilidad=bajos');
    assert.equal(result.status,200);
    assert.deepEqual(result.data.medicamentos.map(m=>m.id),[2,3]);
    assert.ok(result.data.medicamentos.every(m=>m.stockBajo));
    assert.equal(result.data.resumen.bajos,2);
    assert.equal(result.data.alcance.titularidadVerificada,false);
    assert.equal(result.data.alcance.movimientosHabilitados,false);
    assert.equal(result.data.alcance.umbralOrientativo,5);
    for (const id of [1,4,5,6,7,8]) assert.equal((await request('/inventario/'+id)).data.medicamento.stockBajo,false);
    assert.equal((await request('/inventario?disponibilidad=bajos&buscar=003')).data.paginacion.total,1);
    for (const query of ['?umbral=10','?farmacia_id=4','?disponibilidad=bajos&disponibilidad=todas'])
        assert.equal((await request('/inventario'+query)).status,400);
    assert.deepEqual(records,before);
});
