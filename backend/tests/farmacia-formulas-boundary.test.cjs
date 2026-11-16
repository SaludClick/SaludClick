require('./support/isolate-database.cjs');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const Module = require('node:module');

// Characterization of the current closed boundary, NOT implementation of an
// authorization scope. No clinical documents, real sessions or database access.
let queries = [], documentOperations = 0;
const blockedFileOperation = async () => { documentOperations++; assert.fail('Se intentó acceder a un documento médico durante una prueba de denegación.'); };
require.cache[require.resolve('../src/config/database')].exports = {
    query: async (sql, values) => {
        assert.match(sql.trim(), /^SELECT\b/i, 'Esta suite no permite escrituras.');
        queries.push({ sql, values }); return { rows: [] };
    }
};
const originalLoad = Module._load;
let app;
try {
    Module._load = function(request, parent, isMain) {
        if (request === 'fs/promises' && /formula\.controller\.js$/.test(parent?.filename || '')) {
            return { access: blockedFileOperation, readFile: blockedFileOperation, mkdir: blockedFileOperation, writeFile: blockedFileOperation };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    app = require('../src/app');
} finally { Module._load = originalLoad; }
let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => {
    process.env.JWT_SECRET = 'isolated-formula-boundary-only';
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { queries = []; documentOperations = 0; });
after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
});
async function request(path, { method = 'GET', role = 3, id = 30, auth } = {}) {
    const headers = role === null ? {} : { Authorization: `Bearer ${auth || jwt.sign({ id, rol: role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
    return fetch(base + path, { method, headers });
}

test('Farmacia no accede al listado ni a documentos personales de pacientes, aunque altere IDs o filtros', async () => {
    for (const path of ['/api/formulas', '/api/formulas?usuario_id=200', '/api/formulas/1', '/api/formulas/200', '/api/formulas/2147483647']) {
        const response = await request(path);
        assert.equal(response.status, 403);
        const data = await response.json();
        assert.equal(data.ok, false); assert.equal(data.formulas, undefined);
    }
    assert.equal(queries.length, 0); assert.equal(documentOperations, 0);
});
test('JWT ausente, inválido o expirado no permite acceder a las rutas personales existentes', async () => {
    for (const options of [{ role: null }, { auth: 'invalid' }, { auth: jwt.sign({ id: 30, rol: 3 }, process.env.JWT_SECRET, { expiresIn: -1 }) }]) {
        for (const path of ['/api/formulas', '/api/formulas/1']) assert.equal((await request(path, options)).status, 401);
    }
    assert.equal(queries.length, 0); assert.equal(documentOperations, 0);
});
test('sin ámbito aprobado, las rutas propuestas de Farmacia siguen sin registrar y no exponen datos ni conteos', async () => {
    for (const path of ['/api/farmacia/formulas', '/api/farmacia/formulas?pagina=1&estado=PENDIENTE', '/api/farmacia/formulas/1', '/api/farmacia/formulas/200', '/api/farmacia/formulas/1/documento']) {
        const response = await request(path); assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { ok: false, mensaje: 'Ruta de API no encontrada.' });
    }
    assert.equal(queries.length, 0); assert.equal(documentOperations, 0);
});
test('no se habilitan creación, aprobación, rechazo o dispensación de fórmulas desde Farmacia', async () => {
    for (const [method, path] of [['POST', '/api/farmacia/formulas'], ['PATCH', '/api/farmacia/formulas/1'], ['POST', '/api/farmacia/formulas/1/aprobar'], ['POST', '/api/farmacia/formulas/1/rechazar'], ['POST', '/api/farmacia/formulas/1/dispensar']]) {
        assert.equal((await request(path, { method })).status, 404);
    }
    assert.equal((await request('/api/formulas', { method: 'POST' })).status, 403);
    assert.equal(queries.length, 0); assert.equal(documentOperations, 0);
});
test('la ruta personal de documentos conserva la propiedad del paciente desde JWT, no desde query', async () => {
    const response = await request('/api/formulas/999?usuario_id=999', { role: 2, id: 200 });
    assert.equal(response.status, 404);
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].values, [999, 200]);
    assert.match(queries[0].sql, /id\s*=\s*\$1\s+AND\s+usuario_id\s*=\s*\$2/i);
    assert.equal(documentOperations, 0);
});
test('los adjuntos no se sirven desde la raíz pública del backend', async () => {
    const response = await request('/private_uploads/documento-inexistente-prueba.pdf');
    assert.equal(response.status, 404);
    const body = await response.text();
    assert.equal(body.includes(process.cwd()), false);
    assert.equal(queries.length, 0); assert.equal(documentOperations, 0);
});
