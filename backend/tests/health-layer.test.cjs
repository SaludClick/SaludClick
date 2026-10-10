const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const calls = [];
const fakePool = {
    query: async sql => {
        calls.push(sql);
        return [[{ fecha: '2026-10-09 12:00:00' }]];
    }
};

let repository;
let service;
let controller;

before(() => {
    Module._load = function(request, parent, isMain) {
        if (request === '../config/database' && /health\.repository\.js$/.test(parent?.filename || '')) return fakePool;
        if (request === '../repositories/health.repository' && /health\.service\.js$/.test(parent?.filename || '')) return repository;
        if (request === '../services/health.service' && /health\.controller\.js$/.test(parent?.filename || '')) return service;
        return originalLoad.call(this, request, parent, isMain);
    };
    repository = require('../src/repositories/health.repository');
    service = require('../src/services/health.service');
    controller = require('../src/controllers/health.controller');
});

after(() => { Module._load = originalLoad; });

test('health conserva SQL y delegación repositorio → servicio → controlador', async () => {
    calls.length = 0;
    const statusCalls = [];
    let body;
    const response = {
        status(code) { statusCalls.push(code); return this; },
        json(value) { body = value; return this; }
    };

    await controller.health({}, response);

    assert.deepEqual(calls, ['SELECT NOW() AS fecha']);
    assert.deepEqual(statusCalls, [200]);
    assert.deepEqual(body, {
        ok: true,
        mensaje: 'API funcionando correctamente',
        servidor: '2026-10-09 12:00:00'
    });
});
