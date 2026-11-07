const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
const app = require("../src/app");
const { getAllowedOrigins } = require("../src/config/cors");
let server;
let base;

before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
});

for (const origin of ["http://localhost:4321", "http://127.0.0.1:4321"]) {
    test(`CORS preflight permite ${origin}`, async () => {
        const response = await fetch(`${base}/api/auth/login`, {
            method: "OPTIONS",
            headers: {
                Origin: origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type"
            }
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get("access-control-allow-origin"), origin);
        assert.match(response.headers.get("access-control-allow-methods"), /POST/);
        assert.match(response.headers.get("access-control-allow-headers"), /Content-Type/i);
    });
}

test("la solicitud de login desde Astro llega a la validación reCAPTCHA", async () => {
    const response = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:4321", "Content-Type": "application/json" },
        body: JSON.stringify({ correo: "test@example.invalid", password: "test-only" })
    });
    const data = await response.json();
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:4321");
    assert.match(data.mensaje, /captcha|seguridad/i);
});

test("un origen externo sigue rechazado y no recibe permiso CORS", async () => {
    const response = await fetch(`${base}/api/auth/login`, {
        method: "OPTIONS",
        headers: {
            Origin: "https://cors-rejected.invalid",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"
        }
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await response.json(), { ok: false, mensaje: "Origen no autorizado por CORS." });
});

test("producción solo recibe los orígenes explícitos y nunca el comodín", () => {
    const allowed = getAllowedOrigins({
        nodeEnv: "production",
        configuredOrigins: "https://saludclick.example, *"
    });
    assert.deepEqual([...allowed], ["https://saludclick.example"]);
    assert.equal(allowed.has("http://127.0.0.1:4321"), false);
});

test("el origen exacto del backend se permite para cargar módulos ES en desarrollo", () => {
    const allowed = getAllowedOrigins({
        nodeEnv: "development",
        configuredOrigins: "https://saludclick.example",
        backendPort: 3100
    });
    assert.equal(allowed.has("http://localhost:3100"), true);
    assert.equal(allowed.has("http://127.0.0.1:3100"), true);
    assert.equal(allowed.has("http://localhost:3001"), false);
});
