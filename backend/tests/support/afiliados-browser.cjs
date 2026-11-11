const assert = require('node:assert/strict');
module.exports = async ({ t, evaluate, go, click, until, send }) => {
    await t.test('Afiliados: tabla, búsqueda, paginación, 13 campos y creación revisada', async () => {
        // Fixtures de navegador: no consulta ni escribe ninguna base de datos.
        const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            if (location.pathname === '/pages/admin-afiliados.html') {
                for (const s of [localStorage, sessionStorage]) {
                    s.setItem('saludclick_token', 'frontend-test-only');
                    s.setItem('saludclick_user', JSON.stringify({ nombre: 'Admin prueba', rol_id: 1 }));
                }
                const campos = 'id,nombres,apellidos,tipo_documento,documento,fecha_nacimiento,telefono,correo,direccion,ciudad,regimen,estado,eps_id'.split(',');
                const rows = Array.from({ length: 50 }, (_, i) => Object.fromEntries([...campos.map(c => [c, c === 'id' ? String(i+1) : c === 'documento' ? '000' + i : c === 'eps_id' ? String(i % 2 + 1) : c === 'estado' ? 'Activo' : c + '-fixture']), ['usuario', null]]));
                const originalFetch = window.fetch.bind(window);
                window.fetch = async (input, options) => {
                    const url = new URL(input, location.origin);
                    if (!url.pathname.startsWith('/api/admin/afiliados')) return originalFetch(input, options);
                    if (window.afiliadosFailure) return new Response(JSON.stringify({ ok:false, mensaje:'Afiliados aún no está habilitado en la base de datos de la aplicación.' }), { status:503, headers:{'Content-Type':'application/json'} });
                    let data;
                    if (options?.method === 'POST') {
                        window.afiliadosCreacion = JSON.parse(options.body);
                        data = { ok: true, usuario: { id: 1, estado: 'ACTIVO' } };
                    } else if (url.pathname === '/api/admin/afiliados') {
                        const p = Number(url.searchParams.get('pagina') || 1), buscar = url.searchParams.get('buscar') || '';
                        const filtrados = rows.filter(r => campos.some(c => r[c].includes(buscar)) && (!url.searchParams.get('eps') || r.eps_id === url.searchParams.get('eps')) && (!url.searchParams.get('estado') || r.estado === url.searchParams.get('estado')) && url.searchParams.get('cuenta') !== 'ACTIVO');
                        data = { ok: true, total: 50, coincidencias: filtrados.length, pagina:p, filtros:{eps:['1','2'],estados:['Activo']}, afiliados: filtrados.slice((p-1)*10,p*10) };
                    } else data = { ok: true, afiliado: rows.find(r => r.id === url.pathname.split('/').pop()), puedeCrearCuenta: true };
                    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
                };
            }
        ` });
        try {
            await go('/pages/admin-afiliados.html');
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 10'));
            assert.equal(await evaluate('document.querySelector("#total").textContent'), '50');
            assert.equal(await evaluate('document.querySelectorAll("#cabecera th").length'), 6);
            await click('#siguiente');
            await until(() => evaluate('document.querySelector("#pagina").textContent.includes("Página 2")'));
            await evaluate(`document.querySelector('#buscar').value='0000'; document.querySelector('#buscar').dispatchEvent(new Event('input'))`);
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 1'));
            await click('#filas button');
            await until(() => evaluate('document.querySelector("#detalle").open'));
            assert.equal(await evaluate('document.querySelectorAll("#campos dt").length'), 13);
            assert.equal(await evaluate('document.querySelectorAll("#campos dd")[4].textContent'), '0000');
            assert.equal(await evaluate('document.querySelector("#verificado").checked'), false);
            await evaluate(`document.querySelector('#verificado').checked=true; document.querySelector('#password').value='password-fixture'; document.querySelector('#crearCuenta').requestSubmit()`);
            await until(() => evaluate('document.querySelector("#mensajeCuenta").textContent.includes("creada")'));
            assert.equal(await evaluate('window.afiliadosCreacion.verificado'), true);
            assert.equal(await evaluate('document.querySelector("#password").value'), '');
            await click('#cerrar');
            await click('#limpiar');
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 10'));
            await evaluate(`document.querySelector('#filtroEps').value='2'; document.querySelector('#filtroEps').dispatchEvent(new Event('change'))`);
            await until(() => evaluate('document.querySelector("#resultados").textContent.includes("25 resultados")'));
            await evaluate(`document.querySelector('#filtroCuenta').value='ACTIVO'; document.querySelector('#filtroCuenta').dispatchEvent(new Event('change'))`);
            await until(() => evaluate('document.querySelector("#estadoTitulo").textContent.includes("No encontramos")'));
            assert.equal(await evaluate('document.querySelector("#total").textContent'), '50');
            await evaluate('window.afiliadosFailure=true'); await click('#actualizar');
            await until(() => evaluate('!document.querySelector("#mensaje").hidden'));
            assert.match(await evaluate('document.querySelector("#mensaje").textContent'), /no está habilitado/);
            assert.equal(await evaluate('document.querySelector("#total").textContent'), '—');
            await evaluate('window.afiliadosFailure=false'); await click('#limpiar');
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 10'));
            for (const width of [1440, 768, 390, 320]) {
                await send('Emulation.setDeviceMetricsOverride', { width, height:900, deviceScaleFactor:1, mobile:width < 600 });
                assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Sin desbordamiento a ${width}px`);
            }
            await send('Emulation.clearDeviceMetricsOverride');
        } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
    });
};
