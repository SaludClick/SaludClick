// Comprobación explícita de solo lectura del backend activo; no forma parte de npm test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { abrirEdge } = require('./support/afiliados-edge.cjs');
test('Backend activo: aviso de conexión EPS pendiente visible y sin errores JavaScript', { timeout:45000 }, async () => {
    require('dotenv').config({path:path.resolve(__dirname,'../.env')});
    const origin = process.env.DIAGNOSTICO_ORIGIN || 'http://127.0.0.1:3000';
    const token = require('jsonwebtoken').sign({id:-1,rol_id:1},process.env.JWT_SECRET,{expiresIn:'2m'});
    const browser = await abrirEdge();
    try {
        await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('saludclick_token',${JSON.stringify(token)});localStorage.setItem('saludclick_user',JSON.stringify({rol_id:1,nombre:'Diagnóstico administrativo'}))`});
        await browser.send('Page.navigate',{url:origin+'/pages/admin-afiliados.html'});
        await browser.until(() => browser.evaluate('document.querySelector("#registro")?.getAttribute("aria-busy")==="false"'));
        assert.equal(await browser.evaluate('document.querySelector("#filas").children.length'),0);
        assert.equal(await browser.evaluate('document.querySelector("#total").textContent'),'—');
        assert.match(await browser.evaluate('document.querySelector("#mensaje").textContent'),/EPS_DATABASE_URL/);
        assert.ok(browser.respuestas.includes(503)); assert.deepEqual(browser.errores,[]);
        console.log('Backend activo HTTP 503: aviso visible de EPS_DATABASE_URL pendiente; total no disponible, no lista vacía ni excepciones JavaScript.');
    } finally { await browser.cerrar(); }
});
