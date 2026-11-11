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
                window.afiliadosDatosPrueba = rows;
                const originalFetch = window.fetch.bind(window);
                window.fetch = async (input, options) => {
                    const url = new URL(input, location.origin);
                    if (!url.pathname.startsWith('/api/admin/afiliados')) return originalFetch(input, options);
                    if (window.afiliadosFailure) return new Response(JSON.stringify({ ok:false, mensaje:'Afiliados aún no está habilitado en la base de datos de la aplicación.' }), { status:503, headers:{'Content-Type':'application/json'} });
                    let data;
                    if (options?.method === 'POST') {
                        window.afiliadosCreacion = JSON.parse(options.body);
                        rows.find(r => r.id === url.pathname.split('/').at(-2)).usuario = { id: 1, estado: 'ACTIVO' };
                        data = { ok: true, usuario: { id: 1, estado: 'ACTIVO' } };
                    } else if (url.pathname === '/api/admin/afiliados') {
                        const p = Number(url.searchParams.get('pagina') || 1), buscar = url.searchParams.get('buscar') || '';
                        const cuenta = url.searchParams.get('cuenta');
                        const filtrados = rows.filter(r => campos.some(c => String(r[c]).includes(buscar)) && (!url.searchParams.get('eps') || r.eps_id === url.searchParams.get('eps')) && (!url.searchParams.get('estado') || r.estado === url.searchParams.get('estado')) && (!cuenta || (cuenta === 'SIN_CUENTA' ? !r.usuario && !r.cuenta_conflicto : r.usuario?.estado === cuenta)));
                        data = { ok: true, total: 50, coincidencias: filtrados.length, pagina:p, filtros:{eps:['1','2'],estados:['Activo']}, afiliados: filtrados.slice((p-1)*10,p*10) };
                    } else { const a = rows.find(r => r.id === url.pathname.split('/').pop()); data = { ok: true, afiliado: a, puedeCrearCuenta: !a.usuario && !a.cuenta_conflicto && !window.afiliadosNoAutorizado }; }
                    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
                };
            }
        ` });
        try {
            await go('/pages/admin-afiliados.html');
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 10'));
            assert.equal(await evaluate('document.querySelector("#total").textContent'), '50');
            await until(() => evaluate('document.querySelector("#sinCuenta").textContent === "50"'));
            assert.equal(await evaluate('document.querySelector("#conCuenta").textContent'), '0');
            assert.equal(await evaluate('document.querySelector("#adminMain h1").textContent'), 'Gestión de afiliados');
            assert.equal(await evaluate('document.querySelector("#rango").textContent'), 'Mostrando 1–10 de 50 afiliados');
            assert.equal(await evaluate('document.querySelectorAll("#cabecera th").length'), 6);
            await click('#siguiente');
            await until(() => evaluate('document.querySelector("#pagina").textContent.includes("Página 2")'));
            await evaluate(`document.querySelector('#buscar').value='0000'; document.querySelector('#buscar').dispatchEvent(new Event('input'))`);
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 1'));
            await click('#filas button');
            await until(() => evaluate('document.querySelector("#detalle").open'));
            assert.equal(await evaluate('document.querySelectorAll("#campos dt").length'), 13);
            assert.equal(await evaluate('document.querySelector("#campos [data-field=documento] dd").textContent'), '0000');
            assert.equal(await evaluate('document.querySelectorAll("#campos .af-field-section").length'), 4);
            assert.equal(await evaluate('document.querySelector("#verificado").checked'), false);
            await evaluate(`document.querySelector('#verificado').checked=true; document.querySelector('#password').value='password-fixture'; document.querySelector('#crearCuenta').requestSubmit()`);
            await until(() => evaluate('document.querySelector("#mensajeCuenta").textContent.includes("creada")'));
            assert.equal(await evaluate('window.afiliadosCreacion.verificado'), true);
            assert.equal(await evaluate('document.querySelector("#password").value'), '');
            await until(() => evaluate('document.querySelector("#conCuenta").textContent === "1" && document.querySelector("#sinCuenta").textContent === "49"'));
            await click('#cerrar');
            await click('#limpiar');
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 10'));
            await evaluate(`document.querySelector('#filtroEps').value='2'; document.querySelector('#filtroEps').dispatchEvent(new Event('change'))`);
            await until(() => evaluate('document.querySelector("#resultados").textContent.includes("25 resultados")'));
            assert.equal(await evaluate('document.querySelector("#sinCuenta").textContent'), '49');
            await evaluate(`document.querySelector('#filtroCuenta').value='ACTIVO'; document.querySelector('#filtroCuenta').dispatchEvent(new Event('change'))`);
            await until(() => evaluate('document.querySelector("#estadoTitulo").textContent.includes("No encontramos")'));
            assert.equal(await evaluate('document.querySelector("#total").textContent'), '50');
            await evaluate('window.afiliadosFailure=true'); await click('#actualizar');
            await until(() => evaluate('!document.querySelector("#mensaje").hidden'));
            assert.match(await evaluate('document.querySelector("#mensaje").textContent'), /no está habilitado/);
            assert.equal(await evaluate('document.querySelector("#total").textContent'), '—');
            await evaluate('window.afiliadosFailure=false'); await click('#limpiar');
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 10'));
            await evaluate(`window.afiliadosDatosPrueba[2].usuario={id:7,estado:'POR_VERIFICAR'};window.afiliadosDatosPrueba[3].cuenta_conflicto=true;window.afiliadosDatosPrueba[4].estado='PENDIENTE'`);
            await click('#actualizar');
            await until(() => evaluate('document.querySelector("#conCuenta").textContent === "2" && document.querySelector("#sinCuenta").textContent === "47"'));
            assert.match(await evaluate('document.querySelector("#resumen").textContent'), /1 afiliado requiere revisión/);
            assert.equal(await evaluate(`Array.from(document.querySelectorAll('#filas tr')).find(r=>r.querySelector('.af-document strong').textContent==='0002').querySelector('.af-account-stack .af-badge:last-child').dataset.tone`), 'neutral');
            assert.equal(await evaluate(`Array.from(document.querySelectorAll('#filas tr')).find(r=>r.querySelector('.af-document strong').textContent==='0004').cells[3].querySelector('.af-badge').dataset.tone`), 'neutral');
            await evaluate(`document.querySelector('#filtroEps').value='2'; document.querySelector('#filtroEps').dispatchEvent(new Event('change'))`);
            await until(() => evaluate('document.querySelector("#resultados").textContent.includes("25 resultados")'));
            await evaluate(`document.querySelector('#buscar').value='00049'; document.querySelector('#buscar').dispatchEvent(new Event('input'))`);
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 1'));
            assert.equal(await evaluate('document.querySelector("#limpiarBusqueda").hidden'),false);
            await evaluate('window.afiliadosNoAutorizado=true'); await click('#filas button');
            await until(() => evaluate('document.querySelector("#detalle").open'));
            assert.equal(await evaluate('document.querySelector("#crearCuenta").hidden'),true);
            await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
            await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
            assert.equal(await evaluate('document.querySelector("#detalle").contains(document.activeElement)'),true);
            await click('#cerrarFicha'); await click('#limpiarBusqueda');
            await until(() => evaluate('document.querySelectorAll("#filas tr").length === 10'));
            assert.equal(await evaluate('document.querySelector("#limpiarBusqueda").hidden'),true);
            assert.equal(await evaluate('document.querySelector("#filtroEps").value'),'2');
            assert.equal(await evaluate('document.activeElement.id'),'buscar');
            for (const width of [1440, 768, 390, 320]) {
                await send('Emulation.setDeviceMetricsOverride', { width, height:900, deviceScaleFactor:1, mobile:width < 600 });
                assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Sin desbordamiento a ${width}px`);
            }
            await send('Emulation.clearDeviceMetricsOverride');
        } finally { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
    });
};
