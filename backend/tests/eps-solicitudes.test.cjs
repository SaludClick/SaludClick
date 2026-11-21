require('./support/isolate-database.cjs');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');

const secret = 'solicitudes-eps-fixture';
let db, server, base, conexiones = 0;
let origenDisponible = true;
let reversionCapturada, definicionesOriginales;
const propuestaEps = path.join(__dirname, '../prisma/propuestas/20261120130000_eps_notificaciones');
const leerSql = archivo => fs.readFileSync(path.join(propuestaEps, archivo), 'utf8');
const definiciones = () => db.query(`SELECT proname, pg_get_functiondef(oid) AS definicion
    FROM pg_proc WHERE proname IN ('eps_notify_request','eps_route_shared_notifications')
    ORDER BY proname`).then(r => r.rows);

const token = (id, rol = 4) => jwt.sign({ id, rol, eps_id: '1' }, secret, { expiresIn: '1h' });

before(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE TABLE usuarios(id int PRIMARY KEY, nombre text, rol_id int, estado text, tipo_documento text, cedula text);
        CREATE TABLE eps_entidades(id text PRIMARY KEY, nombre text, activa bool);
        CREATE TABLE eps_accesos(usuario_id int PRIMARY KEY, eps_id text, activo bool);
        CREATE TABLE afiliado_cuentas_origen(usuario_id int PRIMARY KEY, afiliado_id text, eps_id text, verificado_at timestamptz);
        CREATE TABLE solicitudes(id int PRIMARY KEY, usuario_id int, estado text, fecha timestamp);
        CREATE TABLE farmacia_asignaciones(solicitud_id int PRIMARY KEY, farmacia_id int, activa bool);
        CREATE TABLE eps_farmacias(eps_id text, farmacia_id int, activa bool);
        CREATE TABLE medicamentos(id int PRIMARY KEY, nombre text);
        CREATE TABLE detalle_solicitud(id int PRIMARY KEY, solicitud_id int, medicamento_id int, cantidad int);
        CREATE TABLE farmacia_solicitud_eventos(id int PRIMARY KEY, solicitud_id int, farmacia_id int,
            estado_anterior text, estado text, created_at timestamptz, observaciones text);
        CREATE TABLE formulas_medicas(id int PRIMARY KEY, usuario_id int, estado text, nombre_archivo text);
        CREATE TABLE farmacia_formulas_autorizadas(solicitud_id int, formula_id int, autorizado_por int, activa bool);
        INSERT INTO usuarios VALUES
            (4,'Vinculada',3,'ACTIVO',null,null), (5,'Ajena',3,'ACTIVO',null,null),
            (11,'EPS VidaPlena',4,'ACTIVO',null,null), (12,'EPS Otra',4,'ACTIVO',null,null),
            (13,'EPS inactiva',4,'INACTIVO',null,null), (14,'EPS sin vínculo',4,'ACTIVO',null,null),
            (15,'EPS revocada',4,'ACTIVO',null,null),
            (21,'Pac. acreditado',2,'ACTIVO','CC','00100'), (22,'Pac. sin vínculo',2,'ACTIVO','CC','200'),
            (23,'Otra EPS',2,'ACTIVO','CC','300'), (24,'Pac. inactivo',2,'INACTIVO','CC','400'),
            (25,'Identidad distinta',2,'ACTIVO','CC','500'), (26,'Sin verificar',2,'ACTIVO','CC','600');
        INSERT INTO eps_entidades VALUES ('1','EPS VidaPlena',true), ('2','EPS Otra',true);
        INSERT INTO eps_accesos VALUES (11,'1',true), (12,'2',true), (13,'1',true), (15,'1',false);
        INSERT INTO usuarios VALUES (16,'EPS Vacía',4,'ACTIVO',null,null);
        INSERT INTO eps_entidades VALUES ('3','EPS Vacía',true);
        INSERT INTO eps_accesos VALUES (16,'3',true);
        INSERT INTO afiliado_cuentas_origen VALUES (21,'A','1',now()), (23,'B','2',now()),
           (24,'C','1',now()), (25,'D','1',now()), (26,'E','1',null);
        INSERT INTO solicitudes VALUES
            (2,22,'ENTREGADA','2026-11-18'), (3,21,'APROBADA','2026-11-20'),
            (4,23,'APROBADA','2026-11-19'), (5,21,'LISTA','2026-11-19'),
            (6,24,'APROBADA','2026-11-20'), (7,25,'APROBADA','2026-11-20'),
            (8,26,'APROBADA','2026-11-20');
        INSERT INTO farmacia_asignaciones VALUES (3,4,true), (4,5,true), (5,5,true);
        INSERT INTO eps_farmacias VALUES ('1',4,true), ('2',5,true);
        INSERT INTO medicamentos VALUES (1,'Medicamento de prueba');
        INSERT INTO detalle_solicitud VALUES (1,3,1,2);
        INSERT INTO formulas_medicas VALUES (1,21,'ACTIVA','archivo-privado.pdf'), (2,23,'ACTIVA','otro.pdf');
        INSERT INTO farmacia_formulas_autorizadas VALUES (3,1,21,true),(5,1,21,false),(5,2,21,true);
        INSERT INTO farmacia_solicitud_eventos VALUES
            (1,3,5,'PREPARANDO','LISTA',now(),'Nota privada de otra farmacia'),
            (2,4,5,'APROBADA','PREPARANDO','2026-11-20T12:00:00Z','Nota privada del evento');
        ALTER TABLE usuarios ADD COLUMN apellido text;
        ALTER TABLE eps_farmacias ADD COLUMN vinculada_at timestamptz DEFAULT '2026-11-18T18:00:00Z';
        UPDATE usuarios SET nombre = 'Farmacia', apellido = 'VidaSalud' WHERE id = 4;
        INSERT INTO usuarios VALUES (9,'Droguería',3,'ACTIVO',null,null,'Anterior');
        INSERT INTO eps_farmacias(eps_id,farmacia_id,activa) VALUES ('1',9,false);
        ALTER TABLE usuarios ADD COLUMN correo text, ADD COLUMN telefono text,
          ADD COLUMN ciudad text, ADD COLUMN updated_at timestamptz;
        ALTER TABLE eps_entidades ADD COLUMN correo text, ADD COLUMN telefono text,
          ADD COLUMN ciudad text, ADD COLUMN direccion text;
        UPDATE usuarios SET apellido='Prueba',correo='cuenta@example.test' WHERE id=11;
        UPDATE eps_entidades SET correo='eps@example.test',ciudad='Bogotá' WHERE id='1';
        CREATE TABLE afiliados(id text, usuario_id int, eps_id text);
        CREATE TABLE administrative_preferences(usuario_id int, notificaciones bool);
        CREATE TABLE eps_autorizaciones(id int, afiliado_id text, eps_id text,
            farmacia_vinculo_id int, estado text, solicitud_id int);
        CREATE TABLE eps_existencias(id int, vinculo_id int);
        ALTER TABLE eps_farmacias ADD COLUMN id serial;
        CREATE TABLE eps_eventos(id serial PRIMARY KEY, eps_id text, tipo text, registro_id text,
            titulo text, detalle jsonb NOT NULL);
        CREATE TABLE eps_lecturas(evento_id int, usuario_id int, leida_at timestamptz, PRIMARY KEY(evento_id, usuario_id));
        CREATE TABLE eps_notificaciones_compartidas(id serial PRIMARY KEY, usuario_id int, rol_destinatario int,
            eps_id text, clave text, tipo text, registro_id text, titulo text,
            created_at timestamptz DEFAULT now(), leida_at timestamptz, UNIQUE(usuario_id,clave));
        INSERT INTO afiliados VALUES ('A',21,'1');
        INSERT INTO eps_notificaciones_compartidas(usuario_id,rol_destinatario,eps_id,clave,tipo,registro_id,titulo)
          VALUES (11,4,'1','existente','PERFIL','1','Título legado'),
                 (12,4,'2','ajena','PERFIL','2','Texto ajeno'),
                 (11,4,'2','vinculo-anterior','PERFIL','2','Texto de otra EPS');
    `);
    await db.exec(leerSql('reversion.sql'));
    await db.exec(`
        CREATE TRIGGER eps_request_events AFTER INSERT OR UPDATE OF estado ON solicitudes
         FOR EACH ROW EXECUTE FUNCTION eps_notify_request();
        CREATE TRIGGER eps_shared_event_notifications AFTER INSERT ON eps_eventos
         FOR EACH ROW EXECUTE FUNCTION eps_route_shared_notifications();
    `);
    definicionesOriginales = await definiciones();
    const respaldo = await db.exec(leerSql('respaldo.sql').replace("current_database() <> 'neondb'", 'false'));
    reversionCapturada = respaldo.flatMap(resultado => resultado.rows.map(fila => fila.linea)).join('\n');
    assert.match(reversionCapturada, /^BEGIN;/);
    assert.match(reversionCapturada, /COMMIT;$/);
    await db.exec(leerSql('migration.sql'));
    await db.exec(leerSql('migration.sql'));

    const dbModule = require.cache[require.resolve('../src/config/database')];
    let turno = Promise.resolve();
    dbModule.exports.connect = async () => {
        conexiones++;
        const anterior = turno;
        let release;
        turno = new Promise(resolve => { release = resolve; });
        await anterior;
        return { query: (...args) => db.query(...args), release };
    };
    dbModule.exports.query = async (...args) => {
        const cliente = await dbModule.exports.connect();
        try { return await cliente.query(...args); }
        finally { cliente.release(); }
    };
    const afiliados = {
        1: [['A', '00100'], ['C', '400'], ['D', '0500'], ['E', '600']],
        2: [['B', '300']],
        3: []
    };
    require('../src/repositories/afiliados-origen.repository').leerAutorizados = async (eps, opciones) => {
        if (!origenDisponible) throw new Error('Fallo privado en el origen de prueba');
        return {
            pacientes: afiliados[eps].map(([identificador, documento]) => ({
                identificador, documento, tipo_documento: 'CC', nombres: 'Nombre', apellidos: 'Original'
            })),
            total: afiliados[eps].length,
            ...(opciones?.estadisticas && { afiliados: {
                total: afiliados[eps].length + Number(eps === '1'),
                activos: afiliados[eps].length, inactivos: Number(eps === '1')
            } })
        };
    };
    process.env.JWT_SECRET = secret;
    const app = express();
    app.use(express.json());
    app.use('/api/eps', require('../src/routes/eps.routes'));
    app.use(express.static(path.resolve(__dirname, '../../frontend/dist')));
    server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db?.close();
});

async function consultar(sufijo = '', credencial = token(11), body) {
    const headers = credencial ? { Authorization: `Bearer ${credencial}` } : {};
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}/api/eps/solicitudes${sufijo}`, {
        headers, method: body ? 'POST' : 'GET', body: body && JSON.stringify(body)
    });
    const json = response.headers.get('content-type')?.includes('application/json');
    return { status: response.status, cache: response.headers.get('cache-control'), body: json ? await response.json() : null };
}

test('EPS: listado, búsqueda, paginación y detalle conservan el pedido original y la proyección mínima', async () => {
    const superior = await consultar('?tamano=1');
    assert.equal(superior.status, 200);
    assert.equal(superior.cache, 'no-store');
    assert.deepEqual(superior.body.paginacion, { pagina: 1, tamano: 1, total: 2, paginas: 2 });
    assert.deepEqual(superior.body.solicitudes.map(s => s.id), [3]);
    assert.deepEqual(superior.body.solicitudes[0].medicamentos, [{ nombre: 'Medicamento de prueba', cantidad: 2 }]);
    assert.equal(superior.body.solicitudes[0].formula_asociada, true);
    assert.deepEqual((await consultar('?tamano=1&pagina=2')).body.solicitudes.map(s => s.id), [5]);
    assert.equal((await consultar('?numero=2')).body.paginacion.total, 0);
    assert.equal((await consultar('?numero=3&estado=LISTA')).body.paginacion.total, 0);
    assert.deepEqual((await consultar('?estado=APROBADA')).body.solicitudes.map(s => s.id), [3]);
    const doc = await consultar('/busqueda', token(11), { tipo_documento: 'cc', documento: '00100', numero: '3' });
    assert.deepEqual(doc.body.solicitudes.map(s => s.id), [3]);
    for (const documento of ['100', '300', '400', '500', '600']) {
        assert.equal((await consultar('/busqueda', token(11), { tipo_documento: 'CC', documento })).body.paginacion.total, 0);
    }
    const { body: { solicitud } } = await consultar('/3');
    assert.deepEqual(solicitud, {
        id: 3, fecha: '2026-11-20T00:00:00.000Z', estado: 'APROBADA', afiliado: 'A',
        farmacia: { id: 4, nombre: 'Farmacia VidaSalud' },
        medicamentos: [{ nombre: 'Medicamento de prueba', cantidad: 2 }], historial: [], formula_asociada: true,
        paciente: { nombres: 'Nombre', apellidos: 'Original', tipo_documento: 'CC', documento: '00100' }
    });
    assert.equal((await consultar('/5')).body.solicitud.farmacia, null);
    assert.equal((await consultar('/5')).body.solicitud.formula_asociada, false);
    assert.equal((await consultar('/3/formulas')).status, 404);
    assert.equal((await fetch(`${base}/api/eps/solicitudes/3`, { method: 'PATCH' })).status, 404);
    assert.equal((await consultar('/3')).body.solicitud.estado, 'APROBADA');
});

test('EPS: otras entidades, cuentas inactivas y roles ajenos no acceden', async () => {
    const inicial = conexiones;
    assert.equal((await consultar('', '')).status, 401);
    for (const rol of [1, 2, 3]) assert.equal((await consultar('/3', token(11, rol))).status, 403);
    assert.equal(conexiones, inicial);
    for (const id of [13, 14, 15]) assert.equal((await consultar('/3', token(id))).status, 403);
    assert.equal((await consultar('/3', token(12))).status, 404);
    assert.deepEqual((await consultar('', token(12))).body.solicitudes.map(s => s.id), [4]);
    assert.deepEqual((await consultar('/4', token(12))).body.solicitud.historial, [{
        fecha: '2026-11-20T12:00:00.000Z', estado_anterior: 'APROBADA', estado: 'PREPARANDO'
    }]);
    for (const numero of [2, 4, 6, 7, 8]) assert.equal((await consultar(`/${numero}`)).status, 404);
    for (const filtro of ['eps_id=2', 'estado=INVALIDO', 'tamano=51', 'numero=0', 'documento=00100']) {
        assert.equal((await consultar(`?${filtro}`)).status, 400);
    }
    origenDisponible = false;
    try {
        for (const ruta of ['', '/3']) {
            const respuesta = await consultar(ruta);
            assert.equal(respuesta.status, 503);
            assert.deepEqual(respuesta.body, { ok: false, mensaje: 'No fue posible verificar las solicitudes de tu EPS.' });
        }
    } finally {
        origenDisponible = true;
    }
});

test('Farmacias EPS: listado, búsqueda y detalle usan el nombre completo y aíslan los convenios', async () => {
    async function farmacias(ruta = '', credencial = token(11)) {
        const headers = credencial ? { Authorization: `Bearer ${credencial}` } : {};
        const respuesta = await fetch(`${base}/api/eps/farmacias${ruta}`, { headers });
        return { status: respuesta.status, body: await respuesta.json() };
    }

    const listado = await farmacias('?tamano=1&pagina=2');
    assert.equal(listado.status, 200);
    assert.equal(listado.body.paginacion.total, 2);
    assert.equal(listado.body.eps.nombre, 'EPS VidaPlena');
    assert.deepEqual(listado.body.farmacias, [{
        id: 4, nombre: 'Farmacia VidaSalud', activa: true, vinculada_at: '2026-11-18T18:00:00.000Z'
    }]);
    assert.equal((await farmacias('?tamano=1')).body.farmacias[0].activa, false);
    assert.deepEqual((await farmacias('?buscar=viDAsalud')).body.farmacias, listado.body.farmacias);
    assert.deepEqual((await farmacias('/4')).body.farmacia, listado.body.farmacias[0]);
    assert.equal((await farmacias('/4', token(12))).status, 404);
    assert.equal((await farmacias('/5')).status, 404);
    assert.equal((await farmacias('?eps_id=2')).status, 400);
    assert.equal((await farmacias('', '')).status, 401);
    for (const credencial of [token(11, 3), token(13), token(14), token(15)]) {
        assert.equal((await farmacias('/4', credencial)).status, 403);
    }
});

test('Dashboard EPS: agrupa datos acreditados, proyecta sin datos personales y maneja una entidad vacía', async () => {
    async function resumen(credencial = token(11), query = '') {
        const respuesta = await fetch(base + '/api/eps/dashboard/resumen' + query, {
            headers: { Authorization: `Bearer ${credencial}` }
        });
        return { status: respuesta.status, body: await respuesta.json() };
    }
    const { status, body } = await resumen();
    assert.equal(status, 200);
    assert.deepEqual(body.afiliados, { total: 5, activos: 4, inactivos: 1 });
    assert.equal(body.solicitudes.total, 2);
    assert.deepEqual(body.solicitudes.estados, [{ estado: 'APROBADA', total: 1 }, { estado: 'LISTA', total: 1 }]);
    assert.deepEqual(body.solicitudes.meses, [{ mes: '2026-11', total: 2 }]);
    assert.deepEqual(body.solicitudes.recientes.map(s => s.id), [3, 5]);
    assert.deepEqual(Object.keys(body.solicitudes.recientes[0]).sort(), ['estado', 'farmacia', 'fecha', 'id']);
    assert.equal(body.solicitudes.recientes[0].farmacia.nombre, 'Farmacia VidaSalud');
    assert.equal(body.farmacias.total, 2);
    assert.equal(body.farmacias.activas, 1);
    assert.deepEqual((await resumen(token(12))).body.solicitudes.recientes.map(s => s.id), [4]);
    const vacia = (await resumen(token(16))).body;
    assert.deepEqual(vacia.afiliados, { total: 0, activos: 0, inactivos: 0 });
    assert.deepEqual(vacia.solicitudes, { total: 0, estados: [], meses: [], recientes: [] });
    assert.deepEqual(vacia.farmacias, { total: 0, activas: 0, recientes: [] });
    assert.equal((await resumen('', '')).status, 401);
    for (const credencial of [token(13), token(14), token(15), token(11, 3)]) {
        assert.equal((await resumen(credencial)).status, 403);
    }
    assert.equal((await resumen(token(11), '?eps_id=2')).status, 400);
    origenDisponible = false;
    try {
        const fallo = await resumen();
        assert.equal(fallo.status, 503);
        assert.deepEqual(Object.keys(fallo.body).sort(), ['mensaje', 'ok']);
    } finally {
        origenDisponible = true;
    }
});

test('Edge: Dashboard renderiza gráficas, enlaces, avisos y maneja sesión expirada', {
    skip: process.env.EPS_EDGE_TEST !== '1',
    timeout: 45000
}, async () => {
    const browser = await require('./support/afiliados-edge.cjs').abrirEdge();
    const { send, evaluate, until } = browser;
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            if (location.pathname === '/pages/eps.html') {
                sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(11))});
                sessionStorage.setItem('saludclick_user', JSON.stringify({ id: 11, rol: 4 }));
            }
        ` });
        await send('Page.navigate', { url: base + '/pages/eps.html' });
        await until(() => evaluate('document.getElementById("epsDashboardEntidad")?.textContent === "EPS VidaPlena"'));
        const grafico = await evaluate('document.getElementById("epsGraficoMeses").textContent');
        assert.match(grafico, /noviembre.*2026.*2/);
        assert.equal(await evaluate('document.querySelectorAll("#epsGraficoMeses meter").length'), 1);
        assert.match(await evaluate('document.getElementById("epsGraficoEstados").textContent'), /APROBADA.*1.*LISTA.*1/);
        assert.match(await evaluate('document.getElementById("epsGraficoAfiliados").textContent'), /Activos.*4.*Inactivos.*1/);
        await until(() => evaluate('document.getElementById("epsDashboardAvisos").textContent.includes("Perfil actualizado")'));
        assert.equal(await evaluate('document.getElementById("epsAvisosContador").textContent'), '1');
        assert.match(await evaluate('document.getElementById("epsDashboardMetricas").textContent'), /1 sin leer/);
        await evaluate('document.querySelector(".eps-dash-accesos a[href=\'#afiliados\']").click()');
        await until(() => evaluate('!document.getElementById("afiliados").hidden'));
        await evaluate('location.hash = ""');
        await until(() => evaluate('!document.getElementById("epsDashboardDatos").hidden'));
        await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 820, deviceScaleFactor: 1, mobile: true });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
        await evaluate('document.querySelector("#epsDashboardRecientes a[href=\'#solicitudes/3\']").click()');
        await until(() => evaluate('document.getElementById("epsSolicitudResumen").textContent.includes("Farmacia VidaSalud")'));
        assert.equal(await evaluate('document.getElementById("epsSolicitudDetalle").open'), true);
        await evaluate(`document.getElementById("epsSolicitudDetalle").close();
            sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(16))}); location.hash = '';`);
        await until(() => evaluate('document.getElementById("epsDashboardEntidad").textContent === "EPS Vacía"'));
        assert.match(await evaluate('document.getElementById("epsGraficoMeses").textContent'), /Sin solicitudes/);
        assert.match(await evaluate('document.getElementById("epsGraficoAfiliados").textContent'), /Sin afiliados/);
        origenDisponible = false;
        try {
            await evaluate('document.getElementById("refreshEps").click()');
            await until(() => evaluate('document.getElementById("epsDashboardEstado").textContent.includes("No fue posible")'));
            assert.equal(await evaluate('document.getElementById("epsDashboardDatos").hidden'), true);
        } finally {
            origenDisponible = true;
        }
        await evaluate(`sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(15))});
            document.getElementById("refreshEps").click();`);
        await until(() => evaluate('document.getElementById("epsDashboardEstado").textContent.includes("Acceso denegado")'));
        await evaluate(`
            sessionStorage.setItem('saludclick_token', ${JSON.stringify(jwt.sign({ id: 11, rol: 4 }, secret, { expiresIn: -1 }))});
            document.getElementById("refreshEps").click();`);
        await until(() => evaluate('location.pathname === "/login.html"'));
        assert.deepEqual(browser.errores, []);
    } finally {
        await browser.cerrar();
    }
});

test('Reportes EPS reutiliza los totales del Dashboard y filtra por el día de Bogotá', async () => {
    async function get(ruta, credencial = token(11)) {
        const respuesta = await fetch(base + '/api/eps/' + ruta, { headers: { Authorization: `Bearer ${credencial}` } });
        return { status: respuesta.status, body: await respuesta.json() };
    }
    const resumen = (await get('dashboard/resumen')).body;
    const todo = (await get('reportes/resumen')).body;
    assert.equal(todo.solicitudes.total, resumen.solicitudes.total);
    assert.deepEqual(todo.afiliados, resumen.afiliados);
    assert.deepEqual(todo.farmacias, resumen.farmacias);
    assert.deepEqual(todo.solicitudes.recientes, []);
    const { body } = await get('reportes/resumen?desde=2026-11-19&hasta=2026-11-19');
    assert.deepEqual(body.solicitudes.estados, [{ estado: 'APROBADA', total: 1 }]);
    assert.deepEqual(body.solicitudes.meses, [{ mes: '2026-11', total: 1 }]);
    assert.deepEqual(body.afiliados, resumen.afiliados);
    assert.equal((await get('reportes/resumen?desde=2026-11-20')).body.solicitudes.total, 0);
    assert.equal((await get('reportes/resumen', token(12))).body.solicitudes.total, 1);
    for (const consulta of ['eps_id=2', 'desde=2026-02-30', 'desde=2026-11-20&hasta=2026-11-19']) {
        assert.equal((await get('reportes/resumen?' + consulta)).status, 400);
    }
    assert.equal((await get('reportes/resumen', token(15))).status, 403);
});

test('Perfil EPS solo modifica nombre, apellido, teléfono y ciudad de su cuenta vigente', async () => {
    async function perfil(credencial, datos, consulta = '') {
        const respuesta = await fetch(base + '/api/eps/perfil' + consulta, {
            method: datos ? 'PUT' : 'GET',
            headers: { Authorization: `Bearer ${credencial}`, 'Content-Type': 'application/json' },
            body: datos && JSON.stringify(datos)
        });
        return { status: respuesta.status, body: await respuesta.json() };
    }
    const original = (await perfil(token(11))).body;
    assert.equal(original.eps.nombre, 'EPS VidaPlena');
    assert.equal(original.eps.correo, 'eps@example.test');
    assert.equal(original.usuario.estado, 'ACTIVO');
    assert.equal(original.usuario.correo, 'cuenta@example.test');
    assert.equal((await perfil(token(12))).body.eps.id, '2');
    const cambios = { nombre: 'EPS VidaPlena', apellido: 'Prueba', telefono: '3001234567', ciudad: 'Bogotá' };
    for (const campo of ['id', 'rol_id', 'eps_id', 'estado', 'correo', 'password', 'activo']) {
        assert.equal((await perfil(token(11), { ...cambios, [campo]: '2' })).status, 400);
    }
    assert.equal((await perfil(token(11), null, '?eps_id=2')).status, 400);
    for (const credencial of [token(13), token(14), token(15), token(11, 3)]) {
        assert.equal((await perfil(credencial)).status, 403);
        assert.equal((await perfil(credencial, cambios)).status, 403);
    }
    const guardado = await perfil(token(11), cambios);
    assert.equal(guardado.status, 200);
    assert.equal(guardado.body.usuario.telefono, cambios.telefono);
    assert.deepEqual(guardado.body.eps, original.eps);
    assert.equal((await perfil(token(12))).body.usuario.telefono, null);
});

test('Edge: Reportes y Perfil funcionan desde el menú sin recargar y exportan solo agregados', {
    skip: process.env.EPS_EDGE_TEST !== '1', timeout: 45000
}, async () => {
    const browser = await require('./support/afiliados-edge.cjs').abrirEdge();
    const { send, evaluate, until } = browser;
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(11))});
            sessionStorage.setItem('saludclick_user', JSON.stringify({ id: 11, rol: 4 }));
            const crearUrl = URL.createObjectURL.bind(URL);
            URL.createObjectURL = blob => {
                if (blob.type.startsWith('text/csv')) blob.text().then(texto => { window.csvPrueba = texto; });
                return crearUrl(blob);
            };
            const clic = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () { if (!this.download) clic.call(this); };
        ` });
        await send('Page.navigate', { url: base + '/pages/eps.html' });
        await until(() => evaluate('!document.getElementById("epsDashboardDatos")?.hidden && !!document.getElementById("epsDashboardDatos")'));
        await evaluate('window.marcaNavegacion = 1; document.getElementById("epsNavReportes").click()');
        await until(() => evaluate('!document.getElementById("epsReportesDatos").hidden'));
        assert.match(await evaluate('document.getElementById("epsReportesDatos").textContent'), /Afiliados.*Solicitudes.*Farmacia VidaSalud/s);
        await evaluate(`const form = document.getElementById("epsReportesFiltro");
            form.elements.desde.value = "2026-11-19"; form.elements.hasta.value = "2026-11-19"; form.requestSubmit();`);
        await until(() => evaluate('!document.getElementById("epsReportesCSV").disabled'));
        await evaluate('document.getElementById("epsReportesCSV").click()');
        await until(() => evaluate('typeof window.csvPrueba === "string"'));
        const csv = await evaluate('window.csvPrueba');
        assert.match(csv, /"EPS VidaPlena","2026-11-19","2026-11-19","Solicitudes por estado","APROBADA","1"/);
        assert.doesNotMatch(csv, /00100|archivo-privado|cuenta@example/);
        await evaluate('document.getElementById("epsNavPerfil").click()');
        await until(() => evaluate('!document.getElementById("epsPerfilDatos").hidden'));
        assert.equal(await evaluate('window.marcaNavegacion'), 1);
        assert.equal(await evaluate('document.getElementById("epsPerfilEntidad").textContent'), 'EPS VidaPlena');
        assert.match(await evaluate('document.getElementById("epsPerfilInstitucional").textContent'), /Vigente.*eps@example.test/);
        await evaluate(`(() => {
            const form = document.getElementById("epsPerfilForm");
            form.elements.ciudad.value = "Cali";
            form.requestSubmit();
        })()`);
        await until(() => evaluate('document.getElementById("epsPerfilEstado").textContent === "Perfil actualizado."'));
        for (const width of [375, 768, 1280]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: width < 768 });
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
        }
        assert.deepEqual(browser.errores, []);
    } finally {
        await browser.cerrar();
    }
});

test('Edge: Solicitudes abre el listado real de prueba, filtra y muestra el detalle', {
    skip: process.env.EPS_EDGE_TEST !== '1',
    timeout: 45000
}, async () => {
    const browser = await require('./support/afiliados-edge.cjs').abrirEdge();
    const { send, evaluate, until } = browser;
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(11))});
            sessionStorage.setItem('saludclick_user', JSON.stringify({ id: 11, rol: 4, nombre: 'EPS' }));
        ` });
        await send('Page.navigate', { url: base + '/pages/eps.html' });
        await until(() => evaluate('Boolean(document.getElementById("epsNavSolicitudes"))'));
        await evaluate('document.getElementById("epsNavSolicitudes").click()');
        await until(() => evaluate('document.getElementById("epsSolicitudesFilas").rows.length === 2'));
        const fila = await evaluate('document.getElementById("epsSolicitudesFilas").rows[0].textContent');
        assert.match(fila, /Nombre Original.*CC 00100.*EPS VidaPlena.*Farmacia VidaSalud.*Cantidad 2.*Archivo no autorizado para EPS/);
        assert.equal(await evaluate('document.getElementById("epsNavSolicitudes").getAttribute("aria-current")'), 'location');
        await evaluate('document.getElementById("epsSolicitudesFilas").rows[0].querySelector("button").click()');
        await until(() => evaluate('document.getElementById("epsSolicitudResumen").textContent.includes("Farmacia VidaSalud · ID 4")'));
        const detalle = await evaluate('document.getElementById("epsSolicitudDatos").textContent');
        assert.match(detalle, /APROBADA/);
        assert.match(detalle, /Cantidad 2/);
        assert.match(detalle, /Sin cambios registrados/);
        assert.match(detalle, /Nombre Original.*CC 00100.*EPS VidaPlena/);
        assert.match(detalle, /Archivo no autorizado para EPS/);
        assert.equal(await evaluate('document.querySelectorAll("#epsSolicitudDatos a").length'), 0);
        await evaluate(`document.getElementById("epsSolicitudDetalle").close();
            const form = document.getElementById("epsSolicitudesFiltros");
            form.elements.tipo_documento.value = "CC";
            form.elements.documento.value = "00100";
            form.elements.estado.value = "APROBADA";
            form.requestSubmit();`);
        await until(() => evaluate('document.getElementById("epsSolicitudesFilas").rows.length === 1'));
        assert.ok(await evaluate('document.getElementById("epsSolicitudesFilas").textContent.includes("#3")'));
        assert.equal(await evaluate('location.search'), '');
        await evaluate(`document.getElementById("epsSolicitudesFiltros").elements.estado.value = "CANCELADA";
            document.getElementById("epsSolicitudesFiltros").requestSubmit();`);
        await until(() => evaluate('document.getElementById("epsSolicitudesEstado").textContent.includes("Sin solicitudes")'));
        await evaluate(`sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(15))});
            document.getElementById('epsSolicitudesFiltros').reset();`);
        await until(() => evaluate('document.getElementById("epsSolicitudesEstado").textContent.includes("Acceso denegado")'));
        assert.equal(await evaluate('document.getElementById("epsSolicitudesFilas").rows.length'), 0);
        assert.deepEqual(browser.errores, []);
    } finally {
        await browser.cerrar();
    }
});

test('Edge: Farmacias vinculadas muestra nombre, convenio y detalle y responde a los filtros', {
    skip: process.env.EPS_EDGE_TEST !== '1',
    timeout: 45000
}, async () => {
    const browser = await require('./support/afiliados-edge.cjs').abrirEdge();
    const { send, evaluate, until } = browser;
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(11))});
            sessionStorage.setItem('saludclick_user', JSON.stringify({ id: 11, rol: 4, nombre: 'EPS' }));
        ` });
        await send('Page.navigate', { url: base + '/pages/eps.html' });
        await until(() => evaluate('Boolean(document.getElementById("epsNavFarmacias"))'));
        await evaluate('document.getElementById("epsNavFarmacias").click()');
        await until(() => evaluate('document.getElementById("epsFarmaciasFilas").rows.length === 2'));
        assert.equal(await evaluate('document.getElementById("epsNavFarmacias").getAttribute("aria-current")'), 'location');
        assert.deepEqual(await evaluate(`(() => {
            const [farmacia, convenio, detalle] = document.getElementById("epsFarmaciasFilas").rows[1].cells;
            return [farmacia.querySelector("strong").textContent, farmacia.querySelector("small").textContent,
                convenio.textContent, detalle.querySelector("button").textContent];
        })()`), ['Farmacia VidaSalud', 'ID 4', 'Convenio activo', 'Ver detalle de Farmacia VidaSalud']);
        await evaluate('document.getElementById("epsFarmaciasFilas").rows[1].querySelector("button").click()');
        await until(() => evaluate('document.getElementById("epsFarmaciaDetalleTitulo").textContent === "Farmacia VidaSalud"'));
        assert.match(await evaluate('document.getElementById("epsFarmaciaDatos").textContent'), /EPS VidaPlena.*Convenio activo/);
        await evaluate(`document.getElementById("epsFarmaciaDetalle").close();
            document.getElementById("epsFarmaciaNombre").value = "vidasalud";
            document.getElementById("epsFarmaciasBuscar").requestSubmit();`);
        await until(() => evaluate('document.getElementById("epsFarmaciasFilas").rows.length === 1'));
        await evaluate(`document.getElementById("epsFarmaciaNombre").value = "ausente";
            document.getElementById("epsFarmaciasBuscar").requestSubmit();`);
        await until(() => evaluate('document.getElementById("epsFarmaciasEstado").textContent.includes("Sin farmacias")'));
        await evaluate(`sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(15))});
            document.getElementById('epsFarmaciasBuscar').requestSubmit();`);
        await until(() => evaluate('document.getElementById("epsFarmaciasEstado").textContent.includes("Acceso denegado")'));
        assert.deepEqual(browser.errores, []);
    } finally {
        await browser.cerrar();
    }
});

test('Notificaciones EPS: publica operaciones confirmadas, conserva el legado de Paciente y aísla las lecturas', async () => {
    async function avisos(sufijo = '', credencial = token(11), method = 'GET') {
        const respuesta = await fetch(`${base}/api/eps/notificaciones${sufijo}`, {
            method, headers: { Authorization: `Bearer ${credencial}` }
        });
        return { status: respuesta.status, body: await respuesta.json() };
    }

    assert.equal((await avisos()).body.noLeidas, 1);
    await db.exec("BEGIN; INSERT INTO solicitudes VALUES (91,21,'APROBADA',now()); ROLLBACK;");
    await db.exec(`
        INSERT INTO solicitudes VALUES (90,21,'APROBADA',now()),(92,22,'APROBADA',now()),(93,26,'APROBADA',now());
        UPDATE solicitudes SET estado='LISTA' WHERE id=90;
        UPDATE solicitudes SET estado='LISTA' WHERE id=90;
        UPDATE eps_farmacias SET activa=true WHERE farmacia_id=9;
        UPDATE eps_farmacias SET activa=true WHERE farmacia_id=9;
    `);
    const listado = await avisos('?estado=no_leidas');
    assert.equal(listado.status, 200);
    assert.deepEqual(listado.body.notificaciones.map(n => n.tipo),
        ['FARMACIA_VINCULADA', 'SOLICITUD_ESTADO', 'SOLICITUD_NUEVA', 'PERFIL']);
    assert.equal(listado.body.noLeidas, 4);
    assert.equal(listado.body.notificaciones[0].enlace, '#farmacias');
    assert.equal(listado.body.notificaciones[1].enlace, '#solicitudes');
    assert.deepEqual(Object.keys(listado.body.notificaciones[1]).sort(),
        ['enlace', 'fecha', 'id', 'leida_at', 'mensaje', 'tipo', 'titulo']);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM eps_notificaciones_compartidas WHERE rol_destinatario=2 AND tipo='SOLICITUD'")).rows[0].n, 2);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM eps_notificaciones_compartidas WHERE rol_destinatario=4 AND tipo='SOLICITUD'")).rows[0].n, 0);

    const id = listado.body.notificaciones[0].id;
    for (const [actor, esperado] of [[token(12), 404], [token(13), 403], [token(14), 403], [token(15), 403], [token(11, 3), 403]]) {
        assert.equal((await avisos(`/${id}/leida`, actor, 'PATCH')).status, esperado);
    }
    assert.equal((await avisos('?eps_id=2')).status, 400);
    assert.equal((await avisos(`/${id}/leida`, token(11), 'PATCH')).body.noLeidas, 3);
    assert.equal((await avisos(`/${id}/leida`, token(11), 'PATCH')).body.noLeidas, 3);
    assert.equal((await avisos('?estado=leidas')).body.paginacion.total, 1);
    assert.equal((await avisos('/leer-todas', token(11), 'PATCH')).body.noLeidas, 0);
    assert.equal((await avisos('/no-leidas/count', token(12))).body.noLeidas, 1);
    assert.equal((await db.query("SELECT leida_at FROM eps_notificaciones_compartidas WHERE clave='vinculo-anterior'")).rows[0].leida_at, null);
});

test('Edge: Notificaciones reemplaza Autorizaciones y actualiza los avisos al marcar lectura', {
    skip: process.env.EPS_EDGE_TEST !== '1',
    timeout: 45000
}, async () => {
    await db.exec("UPDATE solicitudes SET estado='ENTREGADA' WHERE id=90; UPDATE eps_farmacias SET activa=false WHERE farmacia_id=9;");
    const browser = await require('./support/afiliados-edge.cjs').abrirEdge();
    const { send, evaluate, until } = browser;
    try {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            sessionStorage.setItem('saludclick_token', ${JSON.stringify(token(11))});
            sessionStorage.setItem('saludclick_user', JSON.stringify({ id: 11, rol: 4 }));
            const iniciarIntervalo = window.setInterval.bind(window);
            window.setInterval = (fn, demora, ...args) => {
                if (demora === 30000) window.refrescarAvisosPrueba = fn;
                return iniciarIntervalo(fn, demora, ...args);
            };
        ` });
        await send('Page.navigate', { url: base + '/pages/eps.html' });
        await until(() => evaluate('document.getElementById("epsAvisosContador").textContent === "2"'));
        assert.equal(await evaluate('document.querySelector(".admin-side-nav").textContent.includes("Autorizaciones")'), false);
        await evaluate('document.getElementById("epsNavNotificaciones").click()');
        await until(() => evaluate('document.querySelectorAll("#epsAvisosLista li").length === 6'));
        assert.match(await evaluate('document.getElementById("epsAvisosLista").textContent'), /Farmacia desvinculada.*Estado de solicitud actualizado/s);
        await evaluate('document.querySelector("#epsAvisosLista button").click()');
        await until(() => evaluate('document.getElementById("epsAvisosContador").textContent === "1"'));
        await evaluate('document.getElementById("epsAvisosLeerTodas").click()');
        await until(() => evaluate('document.getElementById("epsAvisosContador").hidden && !document.querySelector("#epsAvisosLista button")'));
        await evaluate(`document.getElementById("epsAvisosFiltro").value = "no_leidas";
            document.getElementById("epsAvisosFiltro").dispatchEvent(new Event("change"));`);
        await until(() => evaluate('document.getElementById("epsAvisosEstado").textContent.includes("Sin notificaciones")'));
        await db.exec("INSERT INTO solicitudes VALUES (94,21,'APROBADA',now());");
        await evaluate('window.refrescarAvisosPrueba()');
        await until(() => evaluate('document.getElementById("epsAvisosContador").textContent === "1" && document.querySelector("#epsAvisosLista h3")?.textContent === "Nueva solicitud"'));
        assert.deepEqual(browser.errores, []);
    } finally {
        await browser.cerrar();
    }
});

test('Reversión EPS: restaura las funciones respaldadas y conserva los avisos y lecturas', async () => {
    await db.exec("INSERT INTO solicitudes VALUES (95,23,'APROBADA',now());");
    const { rows: destinatarios } = await db.query(`
        SELECT usuario_id,eps_id,rol_destinatario,tipo FROM eps_notificaciones_compartidas
        WHERE registro_id='95'`);
    assert.deepEqual(destinatarios, [{ usuario_id: 12, eps_id: '2', rol_destinatario: 4, tipo: 'SOLICITUD_NUEVA' }]);
    const historial = () => db.query('SELECT id,clave,leida_at FROM eps_notificaciones_compartidas ORDER BY id').then(r => r.rows);
    const antes = await historial();
    await db.exec(reversionCapturada);
    assert.deepEqual(await definiciones(), definicionesOriginales);
    assert.deepEqual(await historial(), antes);
    const existen = await db.query(`
        SELECT EXISTS(SELECT FROM pg_trigger WHERE tgname='eps_pharmacy_link_notifications') AS disparador,
               to_regprocedure('public.eps_notify_pharmacy_link()') IS NOT NULL AS funcion`);
    assert.deepEqual(existen.rows, [{ disparador: false, funcion: false }]);
    await db.exec("INSERT INTO solicitudes VALUES (96,21,'APROBADA',now()); UPDATE eps_farmacias SET activa=true WHERE farmacia_id=9;");
    const nuevos = (await historial()).filter(aviso => !antes.some(anterior => anterior.id === aviso.id));
    const { rows: roles } = await db.query(`
        SELECT rol_destinatario,tipo FROM eps_notificaciones_compartidas WHERE id=ANY($1::int[]) ORDER BY rol_destinatario`,
        [nuevos.map(n => n.id)]);
    assert.deepEqual(roles, [{ rol_destinatario: 2, tipo: 'SOLICITUD' }, { rol_destinatario: 4, tipo: 'SOLICITUD' }]);
    await db.exec(leerSql('migration.sql'));
    const despues = await historial();
    await db.exec(leerSql('reversion.sql'));
    assert.deepEqual(await definiciones(), definicionesOriginales);
    assert.deepEqual(await historial(), despues);
});
