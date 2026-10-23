
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;

const medicamentos = [
    {
        id: 3,
        nombre: 'Medicamento simulado',
        descripcion: 'Descripción de prueba',
        categoria_id: 1,
        categoria: {
            nombre: 'Analgésicos',
            descripcion: 'Alivio del dolor'
        },
        precio: 5000,
        stock: 10,
        imagen: null,
        estado: 'DISPONIBLE'
    }
];

let shouldFail = false;
let repository;
let service;
let controller;

const fakePrisma = {
    medicamento: {
        findMany: async () => {
            if (shouldFail) {
                throw new Error('db unavailable');
            }

            return medicamentos;
        }
    }
};

before(() => {
    Module._load = function(request, parent, isMain) {
        if (
            request === '../config/prisma' &&
            /medication\.repository\.js$/.test(parent?.filename || '')
        ) {
            return fakePrisma;
        }

        if (
            request === '../repositories/medication.repository' &&
            /medication\.service\.js$/.test(parent?.filename || '')
        ) {
            return repository;
        }

        if (
            request === '../services/medication.service' &&
            /medication\.controller\.js$/.test(parent?.filename || '')
        ) {
            return service;
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    repository = require('../src/repositories/medication.repository');
    service = require('../src/services/medication.service');
    controller = require('../src/controllers/medication.controller');
});

after(() => {
    Module._load = originalLoad;
});

test('catálogo conserva la delegación controlador → servicio → repositorio con Prisma', async () => {
    shouldFail = false;

    let body;
    const response = {
        json(value) {
            body = value;
            return this;
        }
    };

    await controller.listar({}, response);

    assert.deepEqual(body, {
        ok: true,
        medicamentos: [
            {
                id: 3,
                nombre: 'Medicamento simulado',
                descripcion: 'Descripción de prueba',
                categoria_id: 1,
                categoria: 'Analgésicos',
                categoria_descripcion: 'Alivio del dolor',
                precio: 5000,
                stock: 10,
                imagen: null,
                estado: 'DISPONIBLE'
            }
        ]
    });
});

test('fallo del repositorio conserva HTTP 500 y el mensaje actual del catálogo', async () => {
    shouldFail = true;

    let statusCode;
    let body;

    const response = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(value) {
            body = value;
            return this;
        }
    };

    try {
        await controller.listar({}, response);

        assert.equal(statusCode, 500);
        assert.deepEqual(body, {
            ok: false,
            mensaje: 'No se pudo cargar el catálogo.'
        });
    } finally {
        shouldFail = false;
    }
});
