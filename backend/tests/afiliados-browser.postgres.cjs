const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { getTestDatabaseUrl } = require('./support/postgres-test-safety.cjs');
const { CAMPOS, leerCsv } = require('../src/services/afiliados-import.service');
const { abrirEdge } = require('./support/afiliados-edge.cjs');

test('Navegador con API y 50 afiliados reales en PostgreSQL aislado', { timeout:90000 }, async () => {
    process.env.DATABASE_URL = getTestDatabaseUrl();
    const fuente = new URL(process.env.DATABASE_URL); fuente.searchParams.set('sslmode','disable');
    process.env.EPS_DATABASE_URL = fuente.toString();
    if (process.env.AFILIADOS_CUENTAS_TEST_DATABASE_URL) {
        const cuentas = new URL(process.env.AFILIADOS_CUENTAS_TEST_DATABASE_URL);
        assert.equal(cuentas.hostname,'127.0.0.1'); assert.equal(cuentas.port,'55435'); assert.equal(cuentas.pathname,'/saludclick_neon_preflight'); assert.equal(cuentas.search,'');
        process.env.DATABASE_URL = cuentas.toString();
    }
    process.env.JWT_SECRET = 'afiliados-browser-local-test';
    const originales = leerCsv(fs.readFileSync(process.env.AFILIADOS_CSV,'utf8'));
    const prisma = require('../src/config/prisma'); const pool = require('../src/config/database');
    const express = require('express'), jwt = require('jsonwebtoken');
    let server, browser;
    try {
        const repositorio = require('../src/repositories/afiliados-origen.repository');
        const antes = await repositorio.leer(); assert.equal(antes.afiliados.length,50); assert.equal(antes.conexion.base,'saludclick_test');
        for (const a of originales) { const b = antes.afiliados.find(b=>b.documento===a.documento); assert.ok(b); for(const c of CAMPOS) assert.equal(b[c],a[c]); }
        const cuentasAntes = await prisma.usuario.count();
        const app = express(); app.use(express.json()); app.use('/api/admin/afiliados', require('../src/routes/afiliados.routes')); app.use(express.static(path.resolve(__dirname,'../../frontend/dist')));
        server = app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r));
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await abrirEdge(); const { send,evaluate,until } = browser;
        const token = jwt.sign({ id:-1,rol_id:1 }, process.env.JWT_SECRET,{expiresIn:'5m'});
        await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('saludclick_token',${JSON.stringify(token)});localStorage.setItem('saludclick_user',JSON.stringify({rol_id:1,nombre:'Diagnóstico administrativo'}))`});
        await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
        await send('Page.navigate',{url:origin + '/pages/admin-afiliados.html'});
        await until(() => evaluate('document.querySelectorAll("#filas tr").length===10'));
        assert.equal(await evaluate('document.querySelector("#total").textContent'),'50');
        await until(() => evaluate('document.querySelector("#sinCuenta").getAttribute("aria-busy")==="false"'));
        assert.equal(await evaluate('document.querySelector("#conCuenta").textContent'),'0');
        assert.equal(await evaluate('document.querySelector("#sinCuenta").textContent'),'50');
        assert.equal(await evaluate('document.querySelector("#adminMain h1").textContent'),'Gestión de afiliados');
        assert.equal(await evaluate('document.querySelectorAll("#cabecera th").length'),6);
        const filas = await evaluate('[...document.querySelectorAll("#filas tr")].map(r=>({nombre:r.querySelector(".af-person strong").textContent,documento:r.querySelector(".af-document strong").textContent}))');
        for (const f of filas) assert.ok(originales.some(a => `${a.nombres} ${a.apellidos}`===f.nombre && a.documento===f.documento));
        // Capturas privadas en TEMP; nunca se sirven desde el frontend público.
        const captura = async nombre => { const r = await send('Page.captureScreenshot',{format:'png'}); fs.writeFileSync(path.join(os.tmpdir(),nombre),Buffer.from(r.data,'base64')); };
        await captura('saludclick-afiliados-desktop.png');
        const ids = new Set();
        for(let pagina=1;pagina<=5;pagina++) {
            await until(() => evaluate(`document.querySelector('#pagina').textContent==='Página ${pagina} de 5' && document.querySelector('#registro').getAttribute('aria-busy')==='false'`));
            (await evaluate('[...document.querySelectorAll(".af-document strong")].map(n=>n.textContent)')).forEach(id=>ids.add(id));
            if (pagina<5) await evaluate('document.querySelector("#siguiente").click()');
        }
        assert.equal(ids.size,50);
        const cambiar = async (id, valor, evento) => evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(valor)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(evento)}))`);
        await cambiar('buscar',originales[0].documento,'input');
        await until(() => evaluate('document.querySelectorAll("#filas tr").length===1 && document.querySelector("#registro").getAttribute("aria-busy")==="false"'));
        await evaluate('document.querySelector("#filas button").click()');
        await until(() => evaluate('document.querySelector("#detalle").open'));
        const detalle = await evaluate('[...document.querySelectorAll("#campos .af-field")].map(n=>({campo:n.dataset.field,valor:n.querySelector("dd").textContent}))');
        assert.equal(detalle.length,13);
        for (const c of CAMPOS) assert.equal(detalle.find(d=>d.campo===c).valor,originales[0][c]);
        assert.equal(await evaluate('document.querySelector("#estadoCuenta").textContent'),'Sin cuenta');
        assert.equal(await evaluate('document.querySelectorAll("#campos .af-field-section").length'),4);
        assert.equal(await evaluate('document.querySelector("#crearCuenta").hidden'),true);
        await captura('saludclick-afiliados-detalle.png');
        await evaluate('document.querySelector("#cerrar").click();document.querySelector("#limpiar").click()');
        await until(() => evaluate('document.querySelectorAll("#filas tr").length===10'));
        await cambiar('filtroEps',originales[0].eps_id,'change');
        await until(() => evaluate('document.querySelector("#registro").getAttribute("aria-busy")==="false"'));
        assert.ok((await evaluate('[...document.querySelectorAll(".af-eps")].map(n=>n.textContent)')).every(v=>v===`EPS ID ${originales[0].eps_id}`));
        await cambiar('filtroCuenta','ACTIVO','change');
        await until(() => evaluate('document.querySelector("#estadoTitulo").textContent==="No encontramos coincidencias"'));
        assert.equal(await evaluate('document.querySelector("#total").textContent'),'50');
        await evaluate('document.querySelector("#limpiar").click()');
        await until(() => evaluate('document.querySelectorAll("#filas tr").length===10'));
        for (const width of [1440,1024,768,390,320]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
            assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`Sin desbordamiento a ${width}px`);
            assert.equal(await evaluate('getComputedStyle(document.querySelector(".af-pagination nav")).position'),'static');
            await evaluate('window.scrollTo(0,0)');
            if(width===390) await captura('saludclick-afiliados-mobile.png');
            if(width===768) await captura('saludclick-afiliados-tablet.png');
        }
        assert.deepEqual(browser.errores,[]);
        assert.ok(browser.respuestas.length>=10 && browser.respuestas.every(s=>s===200));
        assert.deepEqual(await repositorio.leer(),antes); assert.equal(await prisma.usuario.count(),cuentasAntes);
        console.log('API real HTTP 200: fuente EPS dedicada, 50 afiliados y 650 valores originales; 5 páginas, filtros y ficha verificados. Fuente y cuentas sin modificaciones. Cero excepciones JavaScript.');
    } finally {
        await browser?.cerrar(); if(server) await new Promise(r=>server.close(r)); await require('../src/config/eps-prisma').cerrarConexionEPS(); await prisma.$disconnect(); await pool.end();
    }
});
