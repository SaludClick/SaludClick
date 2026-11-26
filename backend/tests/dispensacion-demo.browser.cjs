const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { abrirEdge } = require("./support/afiliados-edge.cjs");

test("demo PostgreSQL: acceso por rol, entrega, conciliación y flujo operativo en navegador",
    { skip: process.env.SALUDCLICK_DEMO_E2E !== "1", timeout: 60000 }, async () => {
    const base = "http://127.0.0.1:4324";
    const password = process.env.SALUDCLICK_DEMO_PASSWORD;
    assert.ok(password);
    const post = async (route, body, token, key, method = "POST") => {
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (key) headers["Idempotency-Key"] = key;
        const res = await fetch(base + route, { method, headers, body: JSON.stringify(body) });
        const data = await res.json();
        assert.ok(res.ok, `${route}: ${res.status} ${data.mensaje || ""}`);
        return data;
    };
    const login = async correo => (await post("/demo/login", { correo, password })).token;
    const get = async (route, token) => {
        const res = await fetch(base + route, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        assert.ok(res.ok, `${route}: ${res.status} ${data.mensaje || ""}`);
        return data.datos;
    };
    const step = (id, action, body, token, key = randomUUID()) =>
        post(`/api/dispensacion/solicitudes/${id}/etapas/${action}`, body, token, key);
    const admin = await login("admin@example.test");
    const pharmacy = await login("farmacia@example.test");
    const patient = await login("paciente@example.test");
    const courier = await login("domiciliario@gmail.com");
    const browser = await abrirEdge();
    try {
        const { send, evaluate, until } = browser;
        await send("Network.setBlockedURLs", { urls: ["https://*"] });
        const open = route => send("Page.navigate", { url: base + route });
        const signIn = async (correo, route) => {
            await open("/demo-login.html");
            await until(() => evaluate("location.pathname === '/demo-login.html' && document.readyState === 'complete' && !!document.querySelector('#demoLogin')"));
            await evaluate(`(() => {
                const form = document.querySelector('#demoLogin');
                form.elements.correo.value = ${JSON.stringify(correo)};
                form.elements.password.value = ${JSON.stringify(password)};
                form.requestSubmit();
            })()`);
            try { await until(() => evaluate(`location.pathname === ${JSON.stringify(route)}`)); }
            catch (error) {
                const status = await evaluate("({ ruta: location.pathname, aviso: document.querySelector('#loginEstado')?.textContent })");
                throw new Error(`Inicio en ${route}: ${JSON.stringify(status)}`, { cause: error });
            }
        };
        const width = async pixels => {
            await send("Emulation.setDeviceMetricsOverride", { width: pixels, height: 900, deviceScaleFactor: 1, mobile: pixels < 600 });
            assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
        };

        await signIn("domiciliario@gmail.com", "/pages/domiciliario.html");
        await until(() => evaluate("document.querySelectorAll('#visitas article').length >= 2"));
        await width(390);
        await evaluate("document.querySelector('#visitas article button').click()");
        await until(() => evaluate("!!document.querySelector('#visitas article select')"));

        const visits = await get("/api/dispensacion/mis-visitas", courier);
        const normal = visits.find(visit => visit.solicitud_id === 1);
        const reviewed = visits.find(visit => visit.solicitud_id === 2);
        assert.ok(normal.iniciada && reviewed);
        const docs = await get("/api/dispensacion/solicitudes/1/documentos", patient);
        await signIn("paciente@example.test", "/pages/dashboard.html");
        await open("/pages/constancia-entrega.html?solicitud=1");
        await until(() => evaluate("document.querySelector('#confirmarEntrega')?.hidden === false"));
        await evaluate(`document.querySelectorAll('#confirmarEntrega input').forEach(input=>input.checked=true);
            document.querySelector('#confirmarEntrega').requestSubmit();`);
        await until(() => evaluate("document.querySelector('#copiasEntrega')?.hidden === false"));
        assert.equal((await get("/api/dispensacion/solicitudes/1/constancias", patient)).length, 2);
        assert.equal(docs.visita_id, normal.visita_id);
        const delivery = { visita_id: normal.visita_id, resultado: "ENTREGADA" };
        const key = randomUUID();
        const closed = await step(1, "RESULTADO_VISITA", delivery, courier, key);
        assert.deepEqual(await step(1, "RESULTADO_VISITA", delivery, courier, key), closed);
        assert.equal(closed.datos.estado, "PARCIAL");

        await step(2, "INICIAR_VISITA", { visita_id: reviewed.visita_id }, courier);
        const second = await get("/api/dispensacion/solicitudes/2/documentos", patient);
        await step(2, "FIRMAR", { visita_id: second.visita_id, version: second.version, tratamiento: true, recepcion: true }, patient);
        await post("/api/dispensacion/farmacia/personal/6", { perfil: "DOMICILIARIO", activo: false }, pharmacy, undefined, "PUT");
        const revoked = await fetch(base + "/api/dispensacion/mis-visitas", { headers: { Authorization: `Bearer ${courier}` } });
        assert.equal(revoked.status, 401);
        const reconciliation = { visita_id: reviewed.visita_id, referencia: "Revisión ficticia de recepción" };
        const reconciliationKey = randomUUID();
        const recon = await step(2, "CONCILIAR_VISITA", reconciliation, pharmacy, reconciliationKey);
        assert.deepEqual(await step(2, "CONCILIAR_VISITA", reconciliation, pharmacy, reconciliationKey), recon);
        assert.deepEqual(recon.datos.saldo, { 1: 2 });
        await post("/api/dispensacion/farmacia/personal/6", { perfil: "DOMICILIARIO", activo: true }, pharmacy, undefined, "PUT");

        await signIn("ips@example.test", "/pages/ips.html");
        await until(() => evaluate("document.querySelector('#ipsEntidad')?.hidden === false"));
        await evaluate("document.querySelector('#ipsEntidad a').click()");
        await until(() => evaluate("!!document.querySelector('#buscarDispensacion')"));
        await width(1280);
        const search = async id => {
            await until(() => evaluate("location.pathname === '/pages/dispensacion.html' && document.readyState === 'complete' && !!document.querySelector('#buscarDispensacion')"));
            await evaluate(`document.querySelector('[name=solicitud]').value=${JSON.stringify(id)};
                document.querySelector('#buscarDispensacion').requestSubmit();`);
            try { await until(() => evaluate("document.querySelector('#dispensacionAccion')?.hidden === false")); }
            catch (error) {
                const status = await evaluate("({ ruta: location.pathname, aviso: document.querySelector('#dispensacionAviso')?.textContent })");
                throw new Error(`Solicitud ${id}: ${JSON.stringify(status)}`, { cause: error });
            }
        };
        await search(3);
        const fill = async (name, value) => evaluate(`document.querySelector('#dispensacionAccion [name=${name}]').value=${JSON.stringify(value)}`);
        const submit = () => evaluate("document.querySelector('#dispensacionAccion').requestSubmit()");
        const saved = () => until(() => evaluate("document.querySelector('#dispensacionAviso').textContent.includes('Acción guardada')"));
        await fill("medicamento", 1);
        await fill("cantidad", 10);
        await fill("vence_at", new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 16));
        await submit();
        await until(() => evaluate("document.querySelector('#dispensacionAviso').textContent.includes('supera')"));
        assert.equal(await evaluate("document.querySelector('#dispensacionAccion [name=cantidad]').value"), "10");
        await fill("cantidad", 4);
        await submit(); await saved();

        await signIn("admin@example.test", "/pages/admin.html");
        await open("/pages/dispensacion.html");
        await until(() => evaluate("!!document.querySelector('#buscarDispensacion')"));
        await search(3); await fill("farmacia_id", 3); await submit(); await saved();
        assert.equal((await get("/api/dispensacion/solicitudes/3", admin)).estado, "ASIGNADA");

        await signIn("farmacia@example.test", "/pages/farmacia.html");
        await open("/pages/dispensacion.html");
        await until(() => evaluate("!!document.querySelector('#buscarDispensacion')"));
        await search(3); await fill("medicamento", 1); await fill("cantidad", 4); await submit(); await saved();
        await evaluate(`const action = document.querySelector('[name=accion]'); action.value='ASIGNAR_VISITA'; action.dispatchEvent(new Event('change'));`);
        await fill("domiciliario_id", 6); await submit(); await saved();
        assert.equal((await get("/api/dispensacion/solicitudes/3", pharmacy)).estado, "EN_REPARTO");
        await signIn("domiciliario@gmail.com", "/pages/domiciliario.html");
        await until(() => evaluate("document.querySelector('#visitas').textContent.includes('Solicitud 3')"));
    } finally {
        await browser.cerrar();
    }
});
