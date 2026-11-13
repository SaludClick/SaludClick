const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CAMPOS, leerCsv, importar } = require('../src/services/afiliados-import.service');
// Fixtures exclusivamente de pruebas; jamás se cargan en el módulo ni en PostgreSQL.
function csv() {
    return [CAMPOS.join(','), ...Array.from({ length: 50 }, (_, i) => CAMPOS.map(c => {
        const v = c === 'id' ? String(i + 1) : c === 'documento' ? `000${i}` : `${c} "prueba",\nlínea`;
        return `"${v.replaceAll('"', '""')}"`;
    }).join(','))].join('\r\n');
}
test('CSV conserva los 13 valores, ceros iniciales, comillas y saltos internos', () => {
    const rows = leerCsv('\uFEFF' + csv());
    assert.equal(rows.length, 50);
    assert.deepEqual(Object.keys(rows[0]), CAMPOS);
    assert.equal(rows[0].documento, '0000');
    assert.equal(rows[0].nombres, 'nombres "prueba",\nlínea');
});
test('rechaza conteo incorrecto, campos adicionales, documentos duplicados y CSV incompleto', () => {
    assert.throws(() => leerCsv(CAMPOS.join(',') + '\n'));
    assert.throws(() => leerCsv(csv().replace('id,nombres', 'extra,id,nombres')));
    assert.throws(() => leerCsv(csv().replace('"0001"', '"0000"')));
    assert.throws(() => leerCsv(csv() + '"'));
});
test('importación idempotente verifica todos los campos y rechaza diferencias sin sobrescribir', async () => {
    const rows = leerCsv(csv());
    const almacen = [];
    const prisma = { $transaction: async callback => callback({ afiliado: {
        findMany: async ({ where }) => where.OR ? almacen.filter(a => where.OR.some(w => Object.entries(w).every(([c,v]) => a[c] === v))) : almacen.filter(a => where.id.in.includes(a.id)),
        create: async ({ data }) => { almacen.push({ ...data }); }
    } }) };
    assert.deepEqual(await importar(prisma, rows), { nuevos: 50, validados: 50 });
    assert.deepEqual(await importar(prisma, rows), { nuevos: 0, validados: 50 });
    assert.equal(almacen.length, 50);
    const cambiados = structuredClone(rows); cambiados[0].eps_id = 'otro';
    await assert.rejects(importar(prisma, cambiados), /Conflicto/);
    assert.deepEqual(almacen, rows);
});
