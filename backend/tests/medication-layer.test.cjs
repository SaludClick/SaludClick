const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const rows = [{ id: 3, nombre: 'Medicamento simulado', estado: 'DISPONIBLE' }];
let shouldFail = false;
let sqlReceived;
const fakePool = {
    query: async sql => {
        sqlReceived = sql;
        if (shouldFail) throw new Error('db unavailable');
        return [rows];
    }
};
let repository;
let service;
let controller;

before(() => {
    Module._load = function(request, parent, isMain) {
        if (request === '../config/database' && /medication\.repository\.js$/.test(parent?.filename || '')) return fakePool;
        if (request === '../repositories/medication.repository' && /medication\.service\.js$/.test(parent?.filename || '')) return repository;
        if (request === '../services/medication.service' && /medication\.controller\.js$/.test(parent?.filename || '')) return service;
        return originalLoad.call(this, request, parent, isMain);
    };
    repository = require('../src/repositories/medication.repository');
    service = require('../src/services/medication.service');
    controller = require('../src/controllers/medication.controller');
});

after(() => { Module._load = originalLoad; });

test('catálogo sigue pasando controlador → servicio → repositorio con SQL y resultado intactos', async () => {
    shouldFail = false;
    sqlReceived = undefined;
    let body;
    const response = { json(value) { body = value; return this; } };

    await controller.listar({}, response);

    assert.match(sqlReceived, /FROM medicamentos m JOIN categorias c ON c\.id = m\.categoria_id/);
    assert.match(sqlReceived, /ORDER BY c\.nombre, m\.nombre/);
    assert.deepEqual(body, { ok: true, medicamentos: rows });
});

test('fallo del repositorio conserva HTTP 500 y el mensaje actual del catálogo', async () => {
    shouldFail = true;
    let statusCode;
    let body;
    const response = {
        status(code) { statusCode = code; return this; },
        json(value) { body = value; return this; }
    };

    await controller.listar({}, response);

    assert.equal(statusCode, 500);
    assert.deepEqual(body, { ok: false, mensaje: 'No se pudo cargar el catálogo.' });
    shouldFail = false;
});
