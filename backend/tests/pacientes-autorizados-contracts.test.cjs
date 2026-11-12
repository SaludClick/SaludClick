const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");
const Module = require("node:module");

const TEST_SECRET = "saludclick-pacientes-contract-test-secret";
const previousSecret = process.env.JWT_SECRET;
const originalLoad = Module._load;
const originalConsoleError = console.error;
const registros = [];
let siguienteId = 1;
let server;
let origin;

const pacientesRepository = {
    async listar({ busqueda, page, limit }) {
        const termino = busqueda.toLocaleLowerCase("es");
        const coincidencias = registros.filter((paciente) =>
            `${paciente.nombres} ${paciente.apellidos} ${paciente.cedula}`
                .toLocaleLowerCase("es")
                .includes(termino)
        );
        const inicio = (page - 1) * limit;
        return {
            pacientes: coincidencias.slice(inicio, inicio + limit),
            paginacion: {
                pagina: page,
                limite: limit,
                total: coincidencias.length,
                totalPaginas: Math.ceil(coincidencias.length / limit)
            }
        };
    },
    async buscarPorId(id) {
        return registros.find((paciente) => paciente.id === id) || null;
    },
    async crear(datos, administradorId) {
        if (registros.some((paciente) => paciente.cedula === datos.cedula)) {
            throw Object.assign(new Error("unique constraint"), { code: "P2002" });
        }
        const paciente = {
            id: siguienteId++,
            ...datos,
            estado: "AUTORIZADO",
            created_at: new Date("2026-11-10T12:00:00.000Z"),
            updated_at: new Date("2026-11-10T12:00:00.000Z")
        };
        registros.push(paciente);
        assert.equal(administradorId, 17);
        return paciente;
    },
    async actualizar(id, datos, administradorId) {
        const paciente = registros.find((registro) => registro.id === id);
        if (!paciente) return null;
        assert.equal(administradorId, 17);
        Object.assign(paciente, datos);
        paciente.updated_at = new Date("2026-11-11T12:00:00.000Z");
        return paciente;
    }
};

function auth(role) {
    return `Bearer ${jwt.sign(
        { id: 17, correo: "admin-test@example.test", rol_id: role },
        TEST_SECRET,
        { expiresIn: "1h" }
    )}`;
}

async function request(path, { method = "GET", role = 1, body } = {}) {
    const headers = {};
    if (role !== null) headers.Authorization = auth(role);
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${origin}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { response, data: await response.json() };
}

before(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    console.error = () => {};
    Module._load = function(request, parent, isMain) {
        if(request.endsWith('/administrative-session.middleware'))return require('./support/administrative-session-fixture.cjs');
        if (
            request === "../repositories/pacientes-autorizados.repository" &&
            /pacientes-autorizados\.service\.js$/.test(parent?.filename || "")
        ) {
            return pacientesRepository;
        }
        if (
            request === "../repositories/admin.repository" &&
            /admin\.service\.js$/.test(parent?.filename || "")
        ) {
            return {};
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    const adminRoutes = require("../src/routes/admin.routes");
    Module._load = originalLoad;

    const app = express();
    app.use(express.json());
    app.use("/api/admin", adminRoutes);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    Module._load = originalLoad;
    console.error = originalConsoleError;
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    registros.length = 0;
    siguienteId = 1;
});

test("endpoints de pacientes autorizados requieren JWT y rol administrador", async () => {
    for (const [path, method, body] of [
        ["/api/admin/pacientes", "GET"],
        ["/api/admin/pacientes", "POST", {
            nombres: "Ana",
            apellidos: "Pérez",
            tipo_documento: "CC",
            cedula: "1001"
        }],
        ["/api/admin/pacientes/1", "GET"],
        ["/api/admin/pacientes/1", "PATCH", { estado: "REVOCADO" }]
    ]) {
        for (const role of [null, 2, 3, 4]) {
            const { response } = await request(path, { method, role, body });
            assert.equal(response.status, role === null ? 401 : 403);
        }
    }
    assert.equal(registros.length, 0);
});

test("administrador crea, busca y pagina pacientes autorizados", async () => {
    const creado = await request("/api/admin/pacientes", {
        method: "POST",
        body: {
            nombres: "  Ana   María ",
            apellidos: " Pérez Gómez ",
            tipo_documento: "cc",
            cedula: "001234"
        }
    });
    assert.equal(creado.response.status, 201);
    assert.equal(creado.data.paciente.nombres, "Ana María");
    assert.equal(creado.data.paciente.tipo_documento, "CC");
    assert.equal(creado.data.paciente.estado, "AUTORIZADO");

    const pagina = await request("/api/admin/pacientes?busqueda=001234&page=1&limit=1");
    assert.equal(pagina.response.status, 200);
    assert.equal(pagina.data.paginacion.total, 1);
    assert.equal(pagina.data.pacientes[0].cedula, "001234");

    const vacia = await request("/api/admin/pacientes?busqueda=ausente");
    assert.equal(vacia.response.status, 200);
    assert.equal(vacia.data.paginacion.total, 0);
    assert.deepEqual(vacia.data.pacientes, []);
});

test("rechaza datos fuera del esquema, cédulas duplicadas y paginación inválida", async () => {
    const paciente = {
        nombres: "Luis",
        apellidos: "Díaz",
        tipo_documento: "CC",
        cedula: "002222"
    };
    const primero = await request("/api/admin/pacientes", {
        method: "POST",
        body: paciente
    });
    assert.equal(primero.response.status, 201);

    const duplicado = await request("/api/admin/pacientes", {
        method: "POST",
        body: paciente
    });
    assert.equal(duplicado.response.status, 409);

    const campoNoPermitido = await request("/api/admin/pacientes", {
        method: "POST",
        body: { ...paciente, id: 987, estado: "REVOCADO" }
    });
    assert.equal(campoNoPermitido.response.status, 400);

    const controlNoPermitido = await request("/api/admin/pacientes", {
        method: "POST",
        body: { ...paciente, cedula: "002223", nombres: "Lu\u0000is" }
    });
    assert.equal(controlNoPermitido.response.status, 400);

    const paginacionInvalida = await request("/api/admin/pacientes?page=0");
    assert.equal(paginacionInvalida.response.status, 400);
});

test("consultar y actualizar un paciente audita el actor enviado por JWT", async () => {
    const creado = await request("/api/admin/pacientes", {
        method: "POST",
        body: {
            nombres: "Sara",
            apellidos: "Ruiz",
            tipo_documento: "CC",
            cedula: "003333"
        }
    });
    const id = creado.data.paciente.id;

    const consultado = await request(`/api/admin/pacientes/${id}`);
    assert.equal(consultado.response.status, 200);
    assert.equal(consultado.data.paciente.cedula, "003333");

    const actualizado = await request(`/api/admin/pacientes/${id}`, {
        method: "PATCH",
        body: { apellidos: "Ruiz León", estado: "REVOCADO" }
    });
    assert.equal(actualizado.response.status, 200);
    assert.equal(actualizado.data.paciente.apellidos, "Ruiz León");
    assert.equal(actualizado.data.paciente.estado, "REVOCADO");

    const inexistente = await request("/api/admin/pacientes/9999", {
        method: "PATCH",
        body: { estado: "REVOCADO" }
    });
    assert.equal(inexistente.response.status, 404);
});
