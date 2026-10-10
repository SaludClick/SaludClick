const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
let saved;
const repository = {
    actualizarPerfil: async (id, data) => { saved = { id, data }; return { id, ...data }; },
    buscarPerfil: async id => id === 9 ? { id, nombre: 'Ana' } : undefined
};

before(() => {
    Module._load = function(request, parent, isMain) {
        if (request === '../repositories/auth.repository' && /user\.service\.js$/.test(parent?.filename || '')) return repository;
        return originalLoad.call(this, request, parent, isMain);
    };
});
after(() => { Module._load = originalLoad; });

test('servicio de usuario normaliza perfil y conserva la validación actual', async () => {
    const userService = require('../src/services/user.service');
    const result = await userService.updateProfile(9, {
        nombre: ' Ana ', apellido: ' Prueba ', telefono: ' 300 ', tipoDocumento: ' CC ', ciudad: ' Cali '
    });
    assert.deepEqual(saved, {
        id: 9,
        data: { nombre: 'Ana', apellido: 'Prueba', telefono: '300', tipoDocumento: 'CC', ciudad: 'Cali' }
    });
    assert.deepEqual(result, { id: 9, ...saved.data });
    await assert.rejects(userService.updateProfile(9, { nombre: 'Ana' }), /Nombre y apellido son obligatorios\./);
    assert.deepEqual(await userService.profile(9), { id: 9, nombre: 'Ana' });
    await assert.rejects(userService.profile(10), /Usuario no encontrado\./);
});
