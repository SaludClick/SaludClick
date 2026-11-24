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
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".auth-panel")).backgroundColor'), 'rgb(25, 41, 37)');
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
    } finally {
        await browser?.cerrar();
        await new Promise(resolve => server.close(resolve));
    }
});
