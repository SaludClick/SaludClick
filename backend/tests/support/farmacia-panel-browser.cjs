const assert = require('node:assert/strict');

// HTTP fixture only: never imports application repositories or database config.
function createFixture() {
    const fixture = { enabled: false, pedidos: [], failStats: false };
    fixture.reset = () => {
        fixture.enabled = true;
        fixture.failStats = false;
        fixture.pedidos = Array.from({ length: 31 }, (_, i) => ({
            id: i + 1, estado: i < 26 ? 'APROBADA' : i < 29 ? 'PREPARANDO' : 'LISTA',
            fecha: '2026-11-13T10:00:00Z', tipo_entrega: 'RECOGER',
            usuario: { nombre: 'Paciente ficticio', apellido: String(i + 1) },
            detalles: [{ cantidad: 1, medicamento: { nombre: 'Medicamento ficticio' } }]
        }));
    };
    fixture.handle = (req, res, url) => {
        if (!fixture.enabled || url.pathname !== '/api/farmacia/pedidos') return false;
        res.setHeader('Content-Type', 'application/json');
        const estado = url.searchParams.get('estado');
        if (fixture.failStats && estado === 'PREPARANDO') {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, mensaje: 'Fallo ficticio de indicador' }));
            return true;
        }
        const filtered = fixture.pedidos.filter(p => estado ? p.estado === estado : p.estado !== 'ENTREGADA');
        const pagina = Number(url.searchParams.get('pagina') || 1);
        res.end(JSON.stringify({ ok: true, pedidos: filtered.slice((pagina - 1) * 25, pagina * 25),
            paginacion: { pagina, tamano: 25, total: filtered.length, paginas: Math.ceil(filtered.length / 25) } }));
        return true;
    };
    return fixture;
}

async function testIndicators({ t, fixture, evaluate, go, click, until }) {
    await t.test('indicadores cuentan 26 pedidos, filtran y muestran errores sin inventar ceros', async () => {
        fixture.reset();
        try {
            await evaluate(`for (const s of [localStorage,sessionStorage]) { s.setItem('saludclick_token','frontend-test-only'); s.setItem('saludclick_user',JSON.stringify({nombre:'Farmacia ficticia',rol:3})); }`);
            await go('/pages/farmacia.html');
            const count = state => evaluate(`document.querySelector('[data-order-status="${state}"] [data-count]').textContent`);
            await until(async () => await count('APROBADA') === '26');
            assert.equal(await count('PREPARANDO'), '3');
            assert.equal(await count('LISTA'), '2');
            await click('[data-order-status="APROBADA"]');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 25 && document.querySelector("#ordersPage").textContent.includes("26")'));
            await click('#ordersNext');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 1'));
            await click('[data-order-status="LISTA"]');
            await until(() => evaluate('document.querySelectorAll(".farmacia-order").length === 2'));
            assert.match(await evaluate('document.querySelector("#ordersPage").textContent'), /1 de 1/);
            fixture.failStats = true;
            await click('#refreshFarmacia');
            await until(() => evaluate('document.querySelector("#retryFarmaciaStats").hidden === false'));
            assert.equal(await count('PREPARANDO'), '3');
            fixture.failStats = false;
            fixture.pedidos = fixture.pedidos.filter(p => p.estado !== 'PREPARANDO');
            await click('#retryFarmaciaStats');
            await until(async () => await count('PREPARANDO') === '0');
        } finally { fixture.enabled = false; }
    });
}
module.exports = { createFixture, testIndicators };
