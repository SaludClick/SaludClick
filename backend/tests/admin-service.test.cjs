const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const calls = [];
const unlinkCalls = [];
const loggedErrors = [];
let formulaFiles;
let unlinkError;

const repository = {
    pedidos: async () => [{ id: 11 }],
    estadoPedido: async (id, estado) => {
        calls.push({ operation: 'estadoPedido', id, estado });
        return 1;
    },
    listarCuentas: async () => [{ id: 12 }],
    buscarCuentaParaEliminar: async id => ({ id }),
    eliminarCuenta: async id => {
        calls.push({ operation: 'eliminarCuenta', id });
        return { id, archivosFormula: formulaFiles };
    }
};

const fsPromises = {
    unlink: async file => {
        unlinkCalls.push(file);
        if (unlinkError) throw unlinkError;
    }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (/admin\.service\.js$/.test(parent?.filename || '')) {
        if (request === '../repositories/admin.repository') return repository;
        if (request === 'fs/promises') return fsPromises;
    }
    return originalLoad.call(this, request, parent, isMain);
};
const adminService = require('../src/services/admin.service');
Module._load = originalLoad;

const validFormulaFile = '123e4567-e89b-12d3-a456-426614174000.pdf';

beforeEach(() => {
    calls.length = 0;
    unlinkCalls.length = 0;
    loggedErrors.length = 0;
    formulaFiles = [];
    unlinkError = null;
});

test('admin service delegates order, account and status queries', async () => {
    assert.deepEqual(await adminService.listarPedidos(), [{ id: 11 }]);
    assert.equal(await adminService.actualizarEstadoPedido('42', 'LISTA'), 1);
    assert.deepEqual(calls, [{ operation: 'estadoPedido', id: 42, estado: 'LISTA' }]);
    assert.deepEqual(await adminService.listarCuentas(), [{ id: 12 }]);
    assert.deepEqual(await adminService.buscarCuentaParaEliminar('17'), { id: 17 });
});

test('account lookup and deletion reject invalid identifiers and self-deletion', async () => {
    for (const id of ['', '0', '-1', '1.5', 'not-an-id', Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(
            adminService.buscarCuentaParaEliminar(id),
            /identificador de la cuenta no es válido/
        );
        await assert.rejects(
            adminService.eliminarCuenta(id, 1),
            /identificador de la cuenta no es válido/
        );
    }
    await assert.rejects(adminService.eliminarCuenta(2, 0), /identificar al administrador/);
    await assert.rejects(adminService.eliminarCuenta(2, 'not-an-id'), /identificar al administrador/);

    await assert.rejects(
        adminService.eliminarCuenta(2, 2),
        error => error.code === 'CUENTA_PROPIA'
    );
    assert.deepEqual(calls, []);
});

test('account deletion unlinks only safe formula names and skips invalid paths', async () => {
    formulaFiles = [
        validFormulaFile,
        `../${validFormulaFile}`,
        validFormulaFile.replace('.pdf', '.exe'),
        null
    ];
    const originalError = console.error;
    console.error = (...args) => loggedErrors.push(args);
    try {
        assert.deepEqual(await adminService.eliminarCuenta('22', '1'), { id: 22 });
    } finally {
        console.error = originalError;
    }

    assert.deepEqual(calls, [{ operation: 'eliminarCuenta', id: 22 }]);
    assert.equal(unlinkCalls.length, 1);
    assert.equal(path.basename(unlinkCalls[0]), validFormulaFile);
    assert.equal(loggedErrors.length, 3);
});

test('a missing formula file is harmless', async () => {
    formulaFiles = [validFormulaFile];
    unlinkError = Object.assign(new Error('missing file'), { code: 'ENOENT' });
    const originalError = console.error;
    console.error = (...args) => loggedErrors.push(args);
    try {
        assert.deepEqual(await adminService.eliminarCuenta(23, 1), { id: 23 });
        assert.deepEqual(loggedErrors, []);
    } finally {
        console.error = originalError;
    }
});

test('an unexpected unlink error is logged without falsifying account deletion', async () => {
    formulaFiles = [validFormulaFile];
    unlinkError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const originalError = console.error;
    console.error = (...args) => loggedErrors.push(args);
    try {
        assert.deepEqual(await adminService.eliminarCuenta(24, 1), { id: 24 });
        assert.equal(loggedErrors.length, 1);
        assert.match(loggedErrors[0][0], /No se pudo eliminar/);
    } finally {
        console.error = originalError;
    }
});
