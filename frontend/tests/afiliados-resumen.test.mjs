import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obtenerResumenAfiliados } from '../public/js/admin-afiliados-resumen.js';
// Solo metadatos de prueba; sin pacientes ni acceso a bases de datos.
const filas = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1), usuario: i >= 35 && i < 45 ? { id: i, estado: i === 36 ? 'DESCONOCIDO' : 'INACTIVO' } : null, cuenta_conflicto: i === 49 }));
const pagina = p => ({ total: 50, coincidencias: 50, pagina: p, afiliados: filas.slice((p - 1) * 10, p * 10) });
test('las tarjetas cuentan el registro completo y cuentas de cualquier estado, no solo la página visible', async () => {
    const consultas = [];
    const resumen = await obtenerResumenAfiliados(async p => { consultas.push(p); return pagina(p); }, pagina(1));
    assert.deepEqual(resumen, { total: 50, conCuenta: 10, sinCuenta: 39, enRevision: 1 });
    assert.deepEqual(consultas, [2, 3, 4, 5]);
    assert.equal(pagina(1).afiliados.every(a => !a.usuario), true);
});
test('un registro vacío confirmado devuelve ceros reales', async () => {
    assert.deepEqual(await obtenerResumenAfiliados(async () => ({ total: 0, coincidencias: 0, pagina: 1, afiliados: [] })), { total: 0, conCuenta: 0, sinCuenta: 0, enRevision: 0 });
});
test('rechaza respuestas parciales o inconsistentes en lugar de inventar estadísticas', async () => {
    await assert.rejects(obtenerResumenAfiliados(async p => ({ ...pagina(p), total: p === 3 ? 51 : 50 })), /registro cambió/);
    await assert.rejects(obtenerResumenAfiliados(async p => p === 2 ? pagina(1) : pagina(p)), /registro cambió/);
    await assert.rejects(obtenerResumenAfiliados(async p => ({ ...pagina(p), afiliados: pagina(p).afiliados.map(a => ({ id: a.id })) })), /confirmar el registro/);
    await assert.rejects(obtenerResumenAfiliados(async p => ({ ...pagina(p), afiliados: pagina(p).afiliados.map(a => ({ ...a, id: 'duplicado' })) })), /confirmar el registro/);
});
