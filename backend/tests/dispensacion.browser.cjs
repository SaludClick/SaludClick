const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const { resolve } = require("node:path");
const { test } = require("node:test");
const express = require("express");
const { abrirEdge } = require("./support/afiliados-edge.cjs");

test("el domiciliario inicia su visita y el paciente confirma la constancia en móvil", { timeout: 45000 }, async () => {
    const visita_id = randomUUID();
    const calls = [];
    let start = false;
    let confirmed = false;
    let done = false;
    const app = express();
    app.use(express.json());
    app.get("/api/dispensacion/mis-visitas", (req, res) => {
        assert.equal(req.headers.authorization, "Bearer courier-test");
        res.json({ ok: true, datos: done ? [] : [{
            solicitud_id: 10, visita_id, iniciada: start, direccion: "Dirección ficticia",
            vence_at: "2027-01-01T12:00:00Z", adjuntos: 0
        }] });
    });
    app.get("/api/dispensacion/solicitudes/10/adjuntos", (_req, res) => {
        res.json({ ok: true, datos: [] });
    });
    app.get("/api/dispensacion/solicitudes/10/documentos", (_req, res) => {
        res.json({ ok: true, datos: { version: "BORRADOR-0.1", visita_id, titular: true,
            cantidades: { 23: 4 }, textos: { TRATAMIENTO: "Tratamiento de prueba", RECEPCION: "Recepción de prueba" } } });
    });
    app.get("/api/dispensacion/solicitudes/10/constancias", (_req, res) => {
        const documento = JSON.stringify({ visita_id });
        res.json({ ok: true, datos: confirmed ? [{ tipo: "RECEPCION", version: "BORRADOR-0.1", documento }] : [] });
    });
    app.post("/api/dispensacion/solicitudes/10/etapas/:action", (req, res) => {
        const action = req.params.action;
        calls.push({ action, key: req.get("Idempotency-Key"), visita: req.body.visita_id, token: req.headers.authorization });
        if (action === "INICIAR_VISITA") start = true;
        if (action === "FIRMAR") confirmed = req.body.tratamiento === true && req.body.recepcion === true;
        if (action === "RESULTADO_VISITA") done = req.body.resultado === "ENTREGADA";
        res.json({ ok: true, datos: {} });
    });
    app.use(express.static(resolve(__dirname, "../../frontend/dist")));
    const server = app.listen(0, "127.0.0.1");
    let browser;
    try {
        await once(server, "listening");
        browser = await abrirEdge();
        const { send, evaluate, until } = browser;
        const origin = `http://127.0.0.1:${server.address().port}`;
        await send("Network.setBlockedURLs", { urls: ["https://*"] });
        await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await send("Page.addScriptToEvaluateOnNewDocument", { source: `
            const courier = location.pathname === '/pages/domiciliario.html';
            sessionStorage.setItem('saludclick_token', courier ? 'courier-test' : 'patient-test');
            sessionStorage.setItem('saludclick_user', JSON.stringify({ id: courier ? 5 : 2, rol: courier ? 5 : 2 }));
        ` });
        const open = path => send("Page.navigate", { url: origin + path });
        await open("/pages/domiciliario.html");
        await until(() => evaluate("!!document.querySelector('#visitas button')"));
        assert.equal(await evaluate("document.querySelector('#visitas article p').textContent"), "Dirección ficticia");
        await evaluate("document.querySelector('#visitas button').click()");
        await until(() => evaluate("!!document.querySelector('#visitas select')"));
        await open("/pages/constancia-entrega.html?solicitud=10");
        await until(() => evaluate("document.querySelector('#confirmarEntrega')?.hidden === false"));
        await evaluate(`document.querySelectorAll('#confirmarEntrega input').forEach(input => { input.checked = true; });
            document.querySelector('#confirmarEntrega').requestSubmit();`);
        await until(() => evaluate("document.querySelector('#copiasEntrega')?.hidden === false"));
        await open("/pages/domiciliario.html");
        await until(() => evaluate("!!document.querySelector('#visitas select')"));
        await evaluate(`const resultado = document.querySelector('#visitas select');
            resultado.value = 'ENTREGADA';
            resultado.form.requestSubmit();`);
        await until(() => evaluate("document.querySelector('#visitasEstado').textContent.includes('No tienes')"));
        assert.deepEqual(calls.map(({ action, token }) => [action, token]), [
            ["INICIAR_VISITA", "Bearer courier-test"], ["FIRMAR", "Bearer patient-test"], ["RESULTADO_VISITA", "Bearer courier-test"]
        ]);
        assert.ok(calls.every(call => call.visita === visita_id && call.key?.length === 36));
    } finally {
        await browser?.cerrar();
        await new Promise(resolve => server.close(resolve));
    }
});
