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
            await until(() => evaluate(`location.pathname === ${JSON.stringify(path)} && !!document.querySelector('.saludclick-theme select')`));
        };
        const resolved = () => evaluate('document.documentElement.dataset.theme');

        await systemTheme('dark');
        await navigate('/login.html');
        assert.equal(await resolved(), 'dark');
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
        await evaluate(`(() => {
            const select = document.querySelector('.saludclick-theme select');
            select.value = 'light';
            select.dispatchEvent(new Event('change'));
        })()`);
        assert.equal(await resolved(), 'light');

        await navigate('/recuperar.html');
        assert.equal(await resolved(), 'light');
        assert.equal(await evaluate('document.querySelector(".saludclick-theme select").value'), 'light');
        await evaluate(`(() => {
            const select = document.querySelector('.saludclick-theme select');
            select.value = 'system';
            select.dispatchEvent(new Event('change'));
        })()`);
        assert.equal(await resolved(), 'dark');
        await systemTheme('light');
        await until(async () => await resolved() === 'light');
        await evaluate(`(() => {
            const select = document.querySelector('.saludclick-theme select');
            select.value = 'dark';
            select.dispatchEvent(new Event('change'));
        })()`);
        await send('Page.reload');
        await until(() => evaluate('document.readyState === "complete" && document.querySelector(".saludclick-theme select")?.value === "dark"'));
        assert.equal(await resolved(), 'dark');
    } finally {
        await browser?.cerrar();
        await new Promise(resolve => server.close(resolve));
    }
});
