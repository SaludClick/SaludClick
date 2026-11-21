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
        categoria: 'Analgésicos',
        categoria_descripcion: 'Alivio del dolor',
        precio: 5000,
        stock: 10,
        imagen: null,
        estado: 'DISPONIBLE'
    }
];

let shouldFail = false;
let empty = false;
const queries = [];
let repository;
let service;
let controller;

const fakePool = {
    query: async sql => {
        queries.push(sql);
        if (shouldFail) throw new Error('db unavailable');
        return { rows: empty ? [] : medicamentos };
    }
};

before(() => {
    Module._load = function(request, parent, isMain) {
        if (
            request === '../config/database' &&
            /medication\.repository\.js$/.test(parent?.filename || '')
        ) {
            return fakePool;
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

test('catálogo conserva la delegación controlador → servicio → repositorio con PostgreSQL', async () => {
    shouldFail = false;
    let body;
    const response = {
        set(name, value) {
            assert.equal(name, 'Cache-Control');
            assert.equal(value, 'no-store');
            return this;
        },
        json(value) {
            body = value;
            return this;
        }
    };

    await controller.listar({}, response);
    assert.deepEqual(body, {
        ok: true,
        medicamentos: [medicamentos[0]]
    });
});

test('fallo del repositorio conserva HTTP 500 y el mensaje actual del catálogo', async () => {
    shouldFail = true;
    let statusCode;
    let body;
    const response = {
        set(name, value) {
            assert.equal(name, 'Cache-Control');
            assert.equal(value, 'no-store');
            return this;
        },
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


test('catalogo consulta las categorias y metadatos existentes sin escribir ni modificar el esquema', async () => {
    shouldFail = false;
    await repository.listar();
    const sql = queries.at(-1);
    assert.match(sql, /m\.presentacion/);
    assert.match(sql, /m\.requiere_formula/);
    assert.match(sql, /JOIN categorias c ON c\.id = m\.categoria_id/);
    assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|ALTER|CREATE/i);
});

test('catalogo vacio devuelve un listado vacio real', async () => {
    empty = true;
    try { assert.deepEqual(await service.listar(), []); }
    finally { empty = false; }
});
