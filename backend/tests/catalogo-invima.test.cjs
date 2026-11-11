const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('el catálogo contiene 1000 referencias únicas y válidas sin conectar a la base', () => {
    const result = spawnSync(process.execPath, [
        path.resolve(__dirname, '../scripts/importar-catalogo-invima.js'), '--validar'
    ], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: '' },
        encoding: 'utf8',
        timeout: 10000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Catálogo validado: 1000 registros/);
});

test('el cliente Prisma incluye el contrato INVIMA usado por los scripts', () => {
    const { Prisma } = require('@prisma/client');
    const models = Prisma.dmmf.datamodel.models;
    const medication = models.find(model => model.name === 'Medicamento');
    for (const field of ['codigo_fuente', 'cum', 'registro_sanitario', 'precio_referencial', 'catalogo_verificado']) {
        assert.ok(medication.fields.some(item => item.name === field), `Falta ${field}`);
    }
    assert.ok(models.some(model => model.name === 'ImagenMedicamento'));
    assert.ok(models.some(model => model.name === 'ObservacionPrecio'));
});
