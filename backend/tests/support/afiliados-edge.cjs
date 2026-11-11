const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
async function abrirEdge() {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'saludclick-afiliados-edge-'));
    const probe = net.createServer();
    const puerto = await new Promise(resolve => probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); }));
    const proceso = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${puerto}`, `--user-data-dir=${carpeta}`, 'about:blank'], { windowsHide: true, stdio:'ignore' });
    let socket, sequence = 0;
    const pendientes = new Map(), errores = [], respuestas = [];
    const until = async (fn, timeout = 15000) => { const limite = Date.now() + timeout; while (Date.now() < limite) { try { if (await fn()) return; } catch {} await new Promise(r => setTimeout(r, 70)); } throw new Error('Tiempo de espera agotado en navegador de Afiliados.'); };
    async function cerrar() {
        socket?.close();
        if (proceso.pid && proceso.exitCode === null) await new Promise(resolve => { const p = spawn('taskkill', ['/PID', String(proceso.pid), '/T', '/F'], { windowsHide: true, stdio:'ignore' }); p.once('error', resolve); p.once('close', resolve); });
        const destino = path.resolve(carpeta);
        if (destino.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(destino).startsWith('saludclick-afiliados-edge-')) {
            for (let i = 0; i < 20; i++) { try { fs.rmSync(destino, { recursive:true, force:true }); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
        }
    }
    try {
        let targets;
        await until(async () => { targets = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json(); return targets.some(t => t.type === 'page'); });
        socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve,reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }); });
        socket.addEventListener('message', event => {
            const m = JSON.parse(event.data);
            if (m.id) { const p = pendientes.get(m.id); pendientes.delete(m.id); if (p) { clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
            if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
            if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/api/admin/afiliados')) respuestas.push(m.params.response.status);
        });
        const send = (method, params = {}) => new Promise((resolve,reject) => { const id = ++sequence; const timer = setTimeout(() => { pendientes.delete(id); reject(new Error(`DevTools no respondió: ${method}`)); }, 15000); pendientes.set(id,{ resolve,reject,timer }); socket.send(JSON.stringify({ id,method,params })); });
        const evaluate = async expression => { const r = await send('Runtime.evaluate',{ expression, returnByValue:true, awaitPromise:true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
        await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
        // La prueba es local y no depende de tipografías o servicios externos.
        await send('Network.setBlockedURLs',{ urls:['*://cdnjs.cloudflare.com/*'] });
        return { send,evaluate,until,cerrar,errores,respuestas };
    } catch(e) { await cerrar(); throw e; }
}
module.exports = { abrirEdge };
