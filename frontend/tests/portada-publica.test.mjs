import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { test } from 'node:test';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const edgePath = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const dist = new URL('../dist/', import.meta.url);

test('La portada muestra Stock bajo y excluye medicamentos despublicados', {
    skip: !existsSync(edgePath) && 'Microsoft Edge no está instalado',
    timeout: 45_000
}, async t => {
    const { PGlite } = require('@electric-sql/pglite');
    const { abrirEdge } = require('./tests/support/afiliados-edge.cjs');
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`
        CREATE TABLE categorias (id int PRIMARY KEY, nombre text, descripcion text);
        CREATE TABLE medicamentos (
            id int PRIMARY KEY, nombre text, descripcion text, presentacion text,
            requiere_formula boolean, categoria_id int, precio numeric,
            stock int, stock_minimo int, imagen text, estado text
        );
        INSERT INTO categorias (id, nombre) VALUES (1, 'Prueba');
        INSERT INTO medicamentos (id, nombre, categoria_id, precio, stock, stock_minimo, imagen, estado) VALUES
            (1, 'Medicamento bajo', 1, 7500, 2, 5, '/images/medicamentos/default.svg', 'DISPONIBLE'),
            (2, 'Medicamento disponible', 1, 12000, 10, 5, NULL, 'DISPONIBLE'),
            (3, 'Medicamento agotado', 1, 9000, 0, 0, NULL, 'AGOTADO'),
            (4, 'Medicamento despublicado', 1, 6500, 10, 5, NULL, 'INACTIVO');
        INSERT INTO medicamentos (id, nombre, categoria_id, stock, stock_minimo, estado)
        SELECT i, 'Zeta ' || i, 1, 10, 5, 'DISPONIBLE' FROM generate_series(10, 19) AS i;
    `);
    const databasePath = require.resolve('./src/config/database');
    require.cache[databasePath] = { exports: db };
    const { buscarPublicados } = require('./src/repositories/medication.repository');
    t.after(() => { delete require.cache[databasePath]; });
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
    const server = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        try {
            if (url.pathname === '/api/medicamentos/publico') {
                const result = await buscarPublicados(url.searchParams.get('buscar') || '', Number(url.searchParams.get('pagina')));
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
                return;
            }
            const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
            const file = new URL(filename, dist);
            if (!file.href.startsWith(dist.href)) return res.writeHead(404).end();
            const content = await readFile(file);
            res.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream' }).end(content);
        } catch (error) {
            res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const edge = await abrirEdge();
    t.after(() => edge.cerrar());
    await edge.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await edge.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await edge.until(() => edge.evaluate('document.querySelectorAll("#catalogo-publico-lista article").length === 12'));
    const actual = await edge.evaluate(`[...document.querySelectorAll('#catalogo-publico-lista article')].slice(0, 3).map(card => [
        card.querySelector('h3').textContent,
        card.querySelector('strong').textContent,
        new URL(card.querySelector('a').href).searchParams.get('buscar')
    ])`);
    assert.deepEqual(actual, [
        ['Medicamento agotado', 'Agotado', 'Medicamento agotado'],
        ['Medicamento bajo', 'Stock bajo', 'Medicamento bajo'],
        ['Medicamento disponible', 'Disponible', 'Medicamento disponible']
    ]);
    const precioVisible = await edge.evaluate(` [...document.querySelectorAll('#catalogo-publico-lista article')].find(card=>card.querySelector('h3').textContent==='Medicamento bajo')?.textContent.includes('7.500') ?? false`);
    assert.equal(precioVisible, true);
    await edge.until(() => edge.evaluate('document.querySelector(".home-hero-photo")?.naturalWidth > 0'));
    assert.equal(await edge.evaluate(`getComputedStyle(document.querySelector('#servicios .grid-servicios')).gridTemplateColumns.split(' ').length`), 3);
    await edge.evaluate(`document.querySelector('#catalogo-publico-siguiente').click()`);
    await edge.until(() => edge.evaluate('document.querySelector("#catalogo-publico-estado").textContent.endsWith(" 2")'));
    await edge.evaluate(`
        document.querySelector('#busquedaInicio').value = 'despublicado';
        document.querySelector('#buscarInicio').click();
    `);
    await edge.until(() => edge.evaluate(`document.querySelector('#catalogo-publico-estado').textContent === 'No se encontraron medicamentos.'`));
    assert.equal(await edge.evaluate('document.querySelectorAll("#catalogo-publico-lista article").length'), 0);
    await edge.evaluate(`document.querySelector('#catalogo-publico-completo').click()`);
    await edge.until(() => edge.evaluate('document.querySelectorAll("#catalogo-publico-lista article").length === 12'));
});
