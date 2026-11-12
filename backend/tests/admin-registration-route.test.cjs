const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const Module = require("node:module");

const TEST_SECRET = "saludclick-admin-registration-route-test-secret";
const previousSecret = process.env.JWT_SECRET;
const originalLoad = Module._load;
let registerCalls = 0;
let server;
let origin;

const authController = {
    register: async (_req, res) => {
        registerCalls += 1;
        res.status(201).json({
            ok: true,
            mensaje: "Usuario registrado correctamente",
            id: 61
        });
    },
    login: (_req, res) => res.json({ ok: true }),
    googleLogin: (_req, res) => res.json({ ok: true }),
    solicitarRecuperacion: (_req, res) => res.json({ ok: true }),
    restablecerPassword: (_req, res) => res.json({ ok: true }),
    profile: (_req, res) => res.json({ ok: true }),
    updateProfile: (_req, res) => res.json({ ok: true })
};

before(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    Module._load = function(request, parent, isMain) {
        if(request.endsWith('/administrative-session.middleware'))return require('./support/administrative-session-fixture.cjs');
        if(request==='../controllers/administrative.controller')return {createController:()=>({createUser:authController.register})};
        if (
            request === "../controllers/auth.controller" &&
            /auth\.routes\.js$/.test(parent?.filename || "")
        ) {
            return authController;
        }
        if (
            request === "../middlewares/recaptcha.middleware" &&
            /auth\.routes\.js$/.test(parent?.filename || "")
        ) {
            return { verificarRecaptcha: (_req, _res, next) => next() };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    const authRoutes = require("../src/routes/auth.routes");
    Module._load = originalLoad;

    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    Module._load = originalLoad;
    if (server) await new Promise(resolve => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
});

async function postRegistro(role) {
    const headers = { "Content-Type": "application/json" };
    if (role !== null) {
        headers.Authorization = `Bearer ${jwt.sign(
            { id: 17, rol: role },
            TEST_SECRET,
            { expiresIn: "1h" }
        )}`;
    }

    const response = await fetch(`${origin}/api/auth/register`, {
        method: "POST",
        headers,
        body: JSON.stringify({})
    });
    return { response, data: await response.json() };
}

test("POST /api/auth/register bloquea el público y solo permite al administrador", async t => {
    registerCalls = 0;
    const { response: anonymous } = await postRegistro(null);
    assert.equal(anonymous.status, 401);

    for (const role of [2, 3, 4]) {
        await t.test(`rechaza rol ${role}`, async () => {
            const { response } = await postRegistro(role);
            assert.equal(response.status, 403);
        });
    }

    assert.equal(registerCalls, 0);
    const admin = await postRegistro(1);
    assert.equal(admin.response.status, 201);
    assert.equal(admin.data.id, 61);
    assert.equal(registerCalls, 1);
});
