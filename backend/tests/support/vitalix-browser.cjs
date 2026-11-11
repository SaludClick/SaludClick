const assert = require('node:assert/strict');

module.exports = async function testVitalix({ t, evaluate, go, click, until, send, getApiRequests }) {
    const lastReply = () => evaluate(`document.querySelector('.vitalix-message-assistant:last-child')?.innerText || ''`);
    const waitReply = () => until(() => evaluate(`!document.querySelector('.vitalix-typing') && Boolean(document.querySelector('.vitalix-message-assistant'))`));
    async function write(text, enter = false) {
        await evaluate(`document.querySelector('.vitalix-composer input').focus()`);
        await send('Input.insertText', { text });
        if (enter) {
            await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
            await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
        } else await click('.vitalix-composer button');
    }
    await t.test('VITALIX conversa con reglas, conserva historial y protege el alcance', async () => {
        await evaluate(`localStorage.removeItem('saludclick_token'); localStorage.removeItem('saludclick_user'); sessionStorage.removeItem('saludclick_token'); sessionStorage.removeItem('saludclick_user'); sessionStorage.removeItem('saludclick_vitalix_conversation_v1')`);
        await go('/pages/chat.html');
        await until(() => evaluate(`document.querySelector('.vitalix-composer input')?.disabled === false`));
        assert.match(await evaluate(`document.querySelector('.vitalix-mode').textContent`), /respuestas programadas/);
        assert.equal(await evaluate(`document.querySelectorAll('.vitalix-option').length`), 5);
        await write('Hola.', true);
        assert.equal(await evaluate(`Boolean(document.querySelector('.vitalix-typing'))`), true);
        await waitReply();
        assert.match(await lastReply(), /¡Hola!/);
        assert.equal(await evaluate(`document.querySelector('.vitalix-message-user').innerText.includes('Hola.')`), true);
        assert.equal(await evaluate(`document.querySelectorAll('.vitalix-time').length`), 2);
        assert.equal(await evaluate(`document.querySelector('.vitalix-composer button').disabled`), true);
        await write('No puedo ingresar'); await waitReply();
        assert.match(await evaluate(`[...document.querySelectorAll('.vitalix-message-assistant')].at(-1).innerText`), /cuenta activa.*aprobación/);
        await write('Tengo una cuenta activa'); await waitReply();
        assert.equal(await evaluate(`[...document.querySelectorAll('.vitalix-message-assistant')].at(-1).querySelector('a').getAttribute('href')`), '/recuperar.html');
        for (const [message, pattern] of [
            ['Necesito una cuenta', 'todavía no puede enviar'],
            ['¿Cómo sé si aprobaron mi solicitud?', 'no está disponible'],
            ['Quiero hablar con el administrador', 'no se ha enviado ningún mensaje'],
            ['Me duele la cabeza', 'No respondo consultas médicas'],
            ['xyz desconocido', 'No he comprendido'],
            ['Mi cédula es 123456789', 'No compartas']
        ]) {
            await write(message); await waitReply();
            assert.ok((await evaluate(`[...document.querySelectorAll('.vitalix-message-assistant')].at(-1).innerText`)).includes(pattern), message);
        }
        assert.equal(await evaluate(`sessionStorage.getItem('saludclick_vitalix_conversation_v1').includes('123456789')`), false);
        assert.equal(await evaluate(`document.querySelector('.vitalix-transcript').innerText.includes('123456789')`), false);
        assert.equal(await evaluate(`document.activeElement === document.querySelector('.vitalix-composer input')`), true);
        await until(() => evaluate(`(() => {const log=document.querySelector('.vitalix-transcript'); return log.scrollHeight-log.scrollTop-log.clientHeight < 3;})()`));
        assert.equal(getApiRequests(), 0);
    });

    for (const route of ['/index.html', '/login.html']) {
        await t.test(`VITALIX mensajería flotante, teclado y móvil en ${route}`, async () => {
            await go(route);
            await until(() => evaluate(`document.querySelector('.vitalix-composer input')?.disabled === false`));
            for (const [width, height] of [[1280,900], [768,1024], [390,844], [320,568]]) {
                await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:width<600 });
                await click('.vitalix-launcher');
                await until(() => evaluate(`document.querySelector('.vitalix-dialog').open`));
                assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), 'Cerrar asistente VITALIX');
                assert.ok(await evaluate(`document.querySelectorAll('.vitalix-turn').length > 0`), 'Conserva el historial entre rutas');
                await click('.vitalix-shortcuts summary');
                for (const id of ['solicitar-cuenta','estado-solicitud','problemas-login','contactar-admin','faq-acceso']) {
                    await click(`[data-vitalix-option="${id}"]`);
                    await waitReply();
                    assert.equal(await evaluate(`document.querySelector('[data-vitalix-option="${id}"]').getAttribute('aria-pressed')`), 'true');
                }
                await click('.vitalix-shortcuts summary');
                const bounds = await evaluate(`(() => {const d=document.querySelector('.vitalix-dialog'), r=d.getBoundingClientRect(), i=document.querySelector('.vitalix-composer input').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:d.scrollWidth,client:d.clientWidth,inputTop:i.top,inputBottom:i.bottom};})()`);
                assert.ok(bounds.left>=0 && bounds.top>=0 && bounds.right<=bounds.width && bounds.bottom<=bounds.height, JSON.stringify(bounds));
                assert.ok(bounds.scroll<=bounds.client && bounds.inputTop>=bounds.top && bounds.inputBottom<=bounds.bottom, JSON.stringify(bounds));
                await write('Gracias', true); await waitReply();
                await evaluate(`document.querySelector('.vitalix-widget-header button').focus()`);
                await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
                await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
                assert.equal(await evaluate(`document.querySelector('.vitalix-dialog').contains(document.activeElement)`), true);
                await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
                await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
                await until(() => evaluate(`!document.querySelector('.vitalix-dialog').open && document.querySelector('.vitalix-launcher').getAttribute('aria-expanded') === 'false'`));
                assert.equal(await evaluate(`document.activeElement === document.querySelector('.vitalix-launcher')`), true);
                await click('.vitalix-launcher');
                await click('.vitalix-widget-header button');
                await until(() => evaluate(`!document.querySelector('.vitalix-dialog').open`));
                assert.equal(await evaluate(`location.pathname`), route);
            }
            await send('Emulation.clearDeviceMetricsOverride');
            assert.equal(getApiRequests(), 0);
        });
    }
    await t.test('VITALIX permite borrar el historial de la sesión', async () => {
        await click('.vitalix-launcher');
        await click('.vitalix-clear');
        await until(() => evaluate(`document.querySelectorAll('.vitalix-turn').length === 0 && sessionStorage.getItem('saludclick_vitalix_conversation_v1') === '[]'`));
        await click('.vitalix-widget-header button');
    });
};
