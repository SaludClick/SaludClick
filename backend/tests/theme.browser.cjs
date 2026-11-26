const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { test } = require('node:test');
const express = require('express');
const { abrirEdge } = require('./support/afiliados-edge.cjs');

test('el tema sigue al sistema y conserva la elección al navegar', { timeout: 45000 }, async () => {
    const app = express();
    app.use(express.static(resolve(__dirname, '../../frontend/dist')));
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await abrirEdge();
        const { send, evaluate, until } = browser;
        const origin = 'http://127.0.0.1:' + server.address().port;
        await send('Network.setBlockedURLs', { urls: ['https://*'] });
        await send('Emulation.setDeviceMetricsOverride', {
            width: 390, height: 844, deviceScaleFactor: 1, mobile: true
        });
        const systemTheme = value => send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value }]
        });
        const navigate = async path => {
            await send('Page.navigate', { url: origin + path });
            await until(() => evaluate(`location.pathname === ${JSON.stringify(path)} && !!document.querySelector('button.saludclick-theme')`));
        };
        const resolved = () => evaluate('document.documentElement.dataset.theme');
        const contrast = (text, surface, pseudo = null) => evaluate(`(() => {
            function luminance(rgb) {
                return (rgb.match(/[0-9.]+/g) || []).slice(0, 3).map(Number)
                    .map(c => c / 255)
                    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
                    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
            }
            const foreground = luminance(getComputedStyle(document.querySelector(${JSON.stringify(text)}), ${JSON.stringify(pseudo)}).color);
            const background = luminance(getComputedStyle(document.querySelector(${JSON.stringify(surface)})).backgroundColor);
            return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        })()`);

        await systemTheme('dark');
        await navigate('/login.html');
        assert.equal(await resolved(), 'dark');
        assert.ok(await contrast('.auth-intro-copy h1', 'body') >= 4.5);
        assert.ok(await contrast('.auth-highlights small', 'body') >= 4.5);
        assert.ok(await evaluate(`(() => {
            const control = document.querySelector('.saludclick-theme');
            const form = document.querySelector('.auth-panel');
            return control.getBoundingClientRect().bottom <= form.getBoundingClientRect().top &&
                control.textContent === '☀️' && control.getAttribute('aria-label') === 'Activar tema claro';
        })()`));
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".auth-panel")).backgroundColor'), 'rgb(38, 48, 52)');
        assert.ok(await evaluate(`(() => {
            const colors = getComputedStyle(document.documentElement);
            const luminance = value => [...value.trim().matchAll(/[0-9a-f]{2}/gi)]
                .map(([channel]) => parseInt(channel, 16) / 255)
                .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
                .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
            const contrast = (fg, bg) => (luminance(colors.getPropertyValue(fg)) + .05) /
                (luminance(colors.getPropertyValue(bg)) + .05);
            return contrast('--theme-text', '--theme-surface') >= 4.5 &&
                contrast('--theme-muted', '--theme-raised') >= 4.5 &&
                contrast('--theme-control-border', '--theme-raised') >= 3;
        })()`));
        await evaluate("document.querySelector('button.saludclick-theme').click()");
        assert.equal(await resolved(), 'light');

        await navigate('/recuperar.html');
        assert.equal(await resolved(), 'light');
        assert.equal(await evaluate("document.querySelector('button.saludclick-theme').textContent"), '🌙');
        await evaluate("document.querySelector('button.saludclick-theme').click()");
        assert.equal(await resolved(), 'dark');
        await systemTheme('light');
        await send('Page.reload');
        await until(() => evaluate('document.readyState === "complete" && !!document.querySelector("button.saludclick-theme")'));
        assert.equal(await resolved(), 'dark');
        await navigate('/');
        for (const selector of [
            '.home-hero .hero-botones .btn-primary', '.home-hero .hero-botones .btn-outline',
            '.home-login-link', '#buscarInicio', '#catalogo-publico-completo'
        ]) {
            assert.ok(await contrast(selector, selector) >= 4.5, selector);
            await send('DOM.enable');
            await send('CSS.enable');
            const { root } = await send('DOM.getDocument');
            const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
            await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover', 'focus-visible'] });
            assert.ok(await contrast(selector, selector) >= 4.5, `${selector} activo`);
            assert.notEqual(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).outlineStyle`), 'none');
            await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
        }
        assert.ok(await contrast('#catalogo-publico-titulo', 'body') >= 4.5);
        assert.ok(await contrast('#servicios-titulo', '#servicios') >= 4.5);
        assert.ok(await contrast('#servicios .servicio-tarjeta p', '#servicios .servicio-tarjeta') >= 4.5);
        assert.ok(await contrast('#servicios .servicio-tarjeta h3', '#servicios .servicio-tarjeta') >= 4.5);
        assert.ok(await contrast('#servicios .servicio-tarjeta a', '#servicios .servicio-tarjeta') >= 4.5);
        assert.ok(await contrast('#preguntas-frecuentes h2', '#preguntas-frecuentes') >= 4.5);
        assert.ok(await contrast('#catalogo-publico-estado', 'body') >= 4.5);
        assert.ok(await contrast('.portada-faq summary', '.portada-faq details') >= 4.5);
        assert.ok(await contrast('.portada-busqueda label', 'body') >= 4.5);
        assert.ok(await contrast('#busquedaInicio', '#busquedaInicio') >= 4.5);
        assert.ok(await contrast('#busquedaInicio', '#busquedaInicio', '::placeholder') >= 4.5);
        assert.ok(await contrast('.home-logo', '.home-navbar') >= 4.5);
        assert.ok(await contrast('.home-menu-toggle', '.home-menu-toggle') >= 4.5);
        await evaluate('document.querySelector(".home-menu-toggle").click()');
        await until(() => evaluate('document.querySelector("#menu").classList.contains("active")'));
        assert.ok(await contrast('.home-menu-toggle', '.home-menu-toggle') >= 4.5);
        assert.ok(await contrast('.home-nav-links a', '#menu') >= 4.5);
        await evaluate('document.querySelector(".home-menu-toggle").click()');
        assert.ok(await evaluate('!!document.querySelector("header.navbar .nav-container button.saludclick-theme")'));
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
        await send('Emulation.setDeviceMetricsOverride', {
            width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
        });
        assert.ok(await evaluate('document.querySelector(".home-nav-links a").getClientRects().length > 0'));
        assert.ok(await contrast('.home-nav-links a', '#menu') >= 4.5);
        assert.ok(await contrast('.home-logo', '.home-navbar') >= 4.5);
        assert.ok(await contrast('#buscarInicio', '#buscarInicio') >= 4.5);
    } finally {
        await browser?.cerrar();
        await new Promise(resolve => server.close(resolve));
    }
});
