
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const calls = [];

const fakePrisma = {
    $queryRaw: async () => {
        calls.push('SELECT NOW() AS fecha');
        return [{ fecha: new Date('2026-10-09T12:00:00.000Z') }];
    }
};

let repository;
let service;
let controller;

before(() => {
    Module._load = function(request, parent, isMain) {
        if (
            request === '../config/prisma' &&
            /health\.repository\.js$/.test(parent?.filename || '')
        ) {
            return fakePrisma;
        }

        if (
            request === '../repositories/health.repository' &&
            /health\.service\.js$/.test(parent?.filename || '')
        ) {
            return repository;
        }

        if (
            request === '../services/health.service' &&
            /health\.controller\.js$/.test(parent?.filename || '')
        ) {
            return service;
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    repository = require('../src/repositories/health.repository');
    service = require('../src/services/health.service');
    controller = require('../src/controllers/health.controller');
});

after(() => {
    Module._load = originalLoad;
});

test('health utiliza Prisma y conserva la respuesta del controlador', async () => {
    calls.length = 0;

    const statusCalls = [];
    let body;

    const response = {
        status(code) {
            statusCalls.push(code);
            return this;
        },
        json(value) {
            body = value;
            return this;
        }
    };

    await controller.health({}, response);

    assert.deepEqual(calls, ['SELECT NOW() AS fecha']);
    assert.deepEqual(statusCalls, [200]);

    assert.equal(body.ok, true);
    assert.equal(body.mensaje, 'API funcionando correctamente');
    assert.ok(body.servidor instanceof Date);
});
