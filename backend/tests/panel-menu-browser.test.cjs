const assert = require('node:assert/strict');
const { test } = require('node:test');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const express = require('express');
const { abrirEdge } = require('./support/afiliados-edge.cjs');
const { createFixture: adminFixture } = require('./support/administrative-browser.cjs');
const { createFixture: pharmacyFixture } = require('./support/farmacia-panel-browser.cjs');

const panels = [
    { name: 'administrador', role: 1, start: 'admin', links: ['#dashboard', '#usuarios', '#solicitudes', '#notificaciones', '#informes', '#configuracion'], next: '#usuarios' },
    { name: 'eps', role: 4, start: 'eps', links: ['#dashboard', '#afiliados', '#farmacias', '#solicitudes', '#notificaciones', '#reportes', '#perfil', '/pages/eps-v1.html', '/pages/eps-convenios.html'], next: '#afiliados' },
    { name: 'farmacia', role: 3, start: 'farmacia', links: ['', '-solicitudes', '-usuarios', '-inventario', '-medicamentos', '-notificaciones', '-perfil'].map(suffix => '/pages/farmacia' + suffix + '.html'), next: '/pages/farmacia-usuarios.html' }
];

test('Edge: menus by role, viewport, keyboard, navigation and persistence', { timeout: 120000 }, async t => {
    if (!existsSync(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')) {
        t.skip('Microsoft Edge no disponible');
        return;
    }
    const dist = resolve(__dirname, '../../frontend/dist');
    assert.ok(existsSync(resolve(dist, 'css/panel-menu.css')), 'Ejecuta primero el build de Astro');
    const output = process.env.PANEL_MENU_CAPTURES;
    if (output) mkdirSync(output, { recursive: true });
    const app = express();
    const admin = adminFixture();
    const pharmacy = pharmacyFixture();
    pharmacy.reset();
    app.use(async (req, res, next) => {
        if (await admin.handle(req, res)) return;
        if (pharmacy.handle(req, res, new URL(req.url, 'http://fixture.test'))) return;
        next();
    });
    app.get('/api/farmacia/verificar-acceso', (req, res) => res.json({ ok: true, operacionHabilitada: false }));
    app.get('/api/farmacia/eps', (req, res) => res.json({ ok: true, vinculacion: { estado: 'SIN_VINCULO', mensaje: 'Sin EPS vinculada' } }));
    app.get('/api/eps/dashboard/resumen', (req, res) => res.json({
        ok: true,
        eps: { nombre: 'EPS de prueba' },
        afiliados: { total: 24, activos: 20, inactivos: 4 },
        solicitudes: { total: 0, estados: [], meses: [], recientes: [] },
        farmacias: { total: 0, activas: 0, recientes: [] }
    }));
    app.get('/api/eps/notificaciones', (req, res) => res.json({
        ok: true, notificaciones: [], noLeidas: 0, paginacion: { total: 0 }
    }));
    app.use('/api', (req, res) => res.json({ ok: true, pacientes: [], afiliados: [], notificaciones: [], items: [] }));
    app.use(express.static(dist));
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await abrirEdge();
        const { evaluate, send, until, onEvent } = browser;
        const consoleErrors = [];
        onEvent('Runtime.consoleAPICalled', ({ type, args }) => {
            if (type === 'error') consoleErrors.push(args.map(arg => arg.value ?? arg.description).join(' '));
        });
        const origin = 'http://127.0.0.1:' + server.address().port;
        await send('Network.setBlockedURLs', { urls: ['https://*', 'http://localhost:*'] });
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        const navigate = async route => {
            await send('Page.navigate', { url: origin + route });
            await until(() => evaluate('location.pathname === ' + JSON.stringify(route.split('#')[0]) +
                ' && document.readyState === "complete" && !!document.querySelector("[data-panel-open]")'));
        };
        const active = async href => {
            await until(() => evaluate('document.querySelector("aside nav [aria-current]")?.getAttribute("href") === ' + JSON.stringify(href)));
        };
        const state = () => evaluate(`(() => {
            const panel = document.querySelector('[data-panel-menu]');
            const toggle = panel.querySelector('button[aria-controls]');
            const sidebar = document.getElementById(toggle.getAttribute('aria-controls'));
            const main = panel.querySelector(':scope > :is(.admin-main, .ad-main)');
            const backdrop = panel.querySelector('[data-panel-backdrop]');
            return {
                open: toggle.getAttribute('aria-expanded') === 'true',
                focus: document.activeElement === toggle,
                closeFocus: document.activeElement === sidebar.querySelector('[data-panel-close]'),
                modal: sidebar.getAttribute('aria-modal') === 'true',
                sidebarInert: sidebar.inert,
                mainInert: main.inert,
                backdrop: getComputedStyle(backdrop).visibility === 'visible' && getComputedStyle(backdrop).display !== 'none',
                headerTop: main.querySelector('header').getBoundingClientRect().top,
                bodyPadding: getComputedStyle(document.body).paddingBlockStart,
                left: main.getBoundingClientRect().left,
                right: main.getBoundingClientRect().right,
                scrollWidth: document.documentElement.scrollWidth,
                viewport: innerWidth
            };
        })()`);
        const toggle = '[data-panel-menu] button[aria-controls]';
        const click = async selector => {
            await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
            const point = await evaluate(`(() => {
                const element = document.querySelector(${JSON.stringify(selector)});
                const box = element.getBoundingClientRect();
                const x = box.x + box.width / 2;
                const y = box.y + box.height / 2;
                const target = document.elementFromPoint(x, y);
                return {x, y, hit: element.contains(target), target: target?.outerHTML.slice(0, 200)};
            })()`);
            assert.ok(point.hit, JSON.stringify({ selector, ...point }));
            const { x, y } = point;
            await send('Input.dispatchMouseEvent', { x, y, type: 'mousePressed', button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { x, y, type: 'mouseReleased', button: 'left', clickCount: 1 });
        };
        const key = async (key, windowsVirtualKeyCode, modifiers = 0) => {
            const descriptor = { key, code: key, windowsVirtualKeyCode, modifiers };
            const text = key === 'Enter' ? '\r' : '';
            await send('Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor, text, unmodifiedText: text });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', ...descriptor });
        };
        const capture = async (name, width, open) => {
            if (!output) return;
            const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            writeFileSync(resolve(output, `${name}-${width}-${open ? 'abierto' : 'cerrado'}.png`), Buffer.from(data, 'base64'));
        };

        for (const { name, role, start, links, next } of panels) {
            const source = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
                window.SALUDCLICK_API_URL = location.origin;
                sessionStorage.setItem('saludclick_token', 'panel-menu-fixture-only');
                sessionStorage.setItem('saludclick_user', JSON.stringify({ id: ${role}, rol: ${role}, nombre: 'Cuenta de prueba' }));
                window.io = () => ({on(){return this;},disconnect(){}});
            ` });
            for (const width of [1440, 1024, 768, 390, 320]) {
                await t.test(`${name} at ${width}px`, async () => {
                    const desktop = width >= 1024;
                    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: !desktop });
                    await navigate('/pages/' + start + '.html');
                    await active(links[0]);
                    assert.equal((await state()).open, desktop);
                    assert.equal((await state()).headerTop, 0);
                    assert.equal((await state()).bodyPadding, '0px');
                    if (name === 'administrador') await until(() => evaluate('document.querySelectorAll(".ad-stat").length > 0'));
                    if (name === 'eps') await until(() => evaluate('!document.querySelector("#epsDashboardDatos").hidden'));
                    if (name === 'farmacia') {
                        await until(() => evaluate('document.querySelector("#farmaciaApp").dataset.authorized === "true"'));
                        assert.equal(await evaluate('document.querySelector("#farmaciaApp").dataset.operacion'), 'false');
                    }
                    assert.deepEqual(await evaluate('[...document.querySelectorAll("aside nav a")].map(a => a.getAttribute("href"))'), links);

                    for (const open of [true, false]) {
                        if ((await state()).open !== open) {
                            await click(!open && !desktop ? '[data-panel-close]' : toggle);
                        }
                        const current = await state();
                        assert.equal(current.open, open);
                        assert.equal(current.sidebarInert, !open);
                        assert.equal(current.mainInert, open && !desktop);
                        assert.equal(current.modal, open && !desktop);
                        assert.equal(current.backdrop, open && !desktop);
                        assert.equal(current.left > 0, open && desktop);
                        assert.ok(current.right <= width, JSON.stringify(current));
                        assert.equal(current.viewport, width);
                        assert.ok(current.scrollWidth <= width, JSON.stringify(current));
                        await capture(name, width, open);
                    }
                    assert.equal((await state()).focus, true);
                    await key('Enter', 13);
                    await until(async () => (await state()).open);
                    if (!desktop) {
                        await until(async () => (await state()).closeFocus);
                        await key('Tab', 9, 8);
                        assert.equal(await evaluate('document.activeElement.closest("aside") !== null'), true);
                        await key('Tab', 9);
                        assert.equal((await state()).closeFocus, true);
                        await send('Input.dispatchMouseEvent', { x: width - 10, y: 200, type: 'mousePressed', button: 'left', clickCount: 1 });
                        await send('Input.dispatchMouseEvent', { x: width - 10, y: 200, type: 'mouseReleased', button: 'left', clickCount: 1 });
                        assert.equal((await state()).open, false);
                        assert.equal((await state()).focus, true);
                        await click(toggle);
                    }
                    await key('Escape', 27);
                    assert.equal((await state()).open, false);
                    assert.equal((await state()).focus, true);

                    await click(toggle);
                    await click(`aside nav a[href="${next}"]`);
                    await active(next);
                    await until(() => evaluate('document.readyState === "complete" && !!document.querySelector("[data-panel-open]")'));
                    assert.equal((await state()).open, desktop);
                    assert.equal((await state()).headerTop, 0);
                    if (name === 'administrador' && desktop) {
                        for (const href of [next, ...links.filter(link => link !== next)]) {
                            await click(`aside nav a[href="${href}"]`);
                            await active(href);
                            await until(() => evaluate('document.querySelector("#adminView").getAttribute("aria-busy") === "false"'));
                            await evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
                            await click(toggle);
                            assert.equal((await state()).open, false);
                            await click(toggle);
                            assert.equal((await state()).open, true);
                        }
                    }
                    if (name === 'eps') {
                        if (!desktop) await click(toggle);
                        await click('aside nav a[href="/pages/eps-v1.html"]');
                        await until(() => evaluate('location.pathname.endsWith("eps-v1.html") && !!document.querySelector("[data-panel-open]")'));
                        await active('#dashboard');
                        assert.equal((await state()).open, desktop);
                        assert.equal((await state()).headerTop, 0);
                        await navigate('/pages/eps-convenios.html');
                        await active('#dashboard');
                        if (!desktop) await click(toggle);
                        await click('aside nav a[href="#inventario"]');
                        await active('#inventario');
                        assert.equal((await state()).open, desktop);
                        assert.equal((await state()).headerTop, 0);
                    }
                    if (desktop) {
                        const heading = name === 'administrador' ? '.panel-menu-heading > span' : '.admin-topbar-copy';
                        await click(heading);
                        assert.equal((await state()).open, false);
                        await click(toggle);
                        await click(toggle);
                        await navigate('/pages/' + start + '.html');
                        assert.equal((await state()).open, false);
                        await click(toggle);
                        await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 900, deviceScaleFactor: 1, mobile: true });
                        await until(async () => !(await state()).open);
                        await click(toggle);
                        await until(async () => (await state()).modal);
                        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
                        await until(async () => (await state()).open && !(await state()).modal);
                        assert.equal((await state()).mainInert, false);
                        assert.equal((await state()).backdrop, false);
                        assert.ok((await state()).scrollWidth <= width);
                        if (width === 1024) {
                            await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
                            try {
                                await until(() => evaluate('matchMedia("(pointer: coarse)").matches'));
                                await until(async () => !(await state()).open);
                                await click(toggle);
                                assert.equal((await state()).modal, true);
                                await key('Escape', 27);
                                assert.equal((await state()).open, false);
                            } finally {
                                await send('Emulation.setTouchEmulationEnabled', { enabled: false });
                            }
                        }
                    }
                });
            }
            await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: source.identifier });
        }
        assert.deepEqual(browser.errores, []);
        assert.deepEqual(consoleErrors, []);
    } finally {
        await browser?.cerrar();
        await new Promise(resolve => server.close(resolve));
    }
});
