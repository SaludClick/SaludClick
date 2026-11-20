// PostgreSQL WASM in memory. No .env, no Neon, no existing accounts or databases.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { spawnSync } = require('node:child_process');
const express = require('express'),
  http = require('node:http'),
  jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { createService } = require('../src/services/eps.service');
const { createController } = require('../src/controllers/eps.controller');
const { createEpsSession } = require('../src/middlewares/eps-session.middleware');
const { createRouter } = require('../src/routes/eps.routes');
test(
  'EPS complete HTTP workflows and tenant isolation on isolated PostgreSQL',
  { timeout: 180000 },
  async (t) => {
    const { PGlite } = require('@electric-sql/pglite');
    const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
    const memory = await PGlite.create();
    const socket = new PGLiteSocketServer({
      db: memory,
      port: 0,
      host: '127.0.0.1',
      maxConnections: 1,
    });
    let db, pool, server, browser;
    const secret = 'eps-isolated-http-test-secret';
    try {
      const schema = fs.readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
      const baseline = schema
        .slice(0, schema.indexOf('// EPS: aislamiento'))
        .split('\n')
        .filter(
          (line) =>
            !/\bEps[A-Z]|eps_version Int|eps_affiliate_scope|eps_affiliate_patient/.test(line),
        )
        .join('\n');
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'saludclick-eps-test-'));
      const from = path.join(temp, 'baseline.prisma');
      fs.writeFileSync(from, baseline);
      const ddl = spawnSync(
        process.execPath,
        [
          path.resolve(__dirname, '../node_modules/prisma/build/index.js'),
          'migrate',
          'diff',
          '--from-empty',
          '--to-schema',
          from,
          '--script',
        ],
        { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' },
      );
      assert.equal(ddl.status, 0, ddl.stderr);
      let baselineDdl = ddl.stdout;
      if (process.env.EPS_BASELINE_WITHOUT_AFILIADOS === '1')
        baselineDdl = baselineDdl
          .replace(/CREATE TABLE "afiliados" \([\s\S]*?\);/g, '')
          .replace(
            /^(?:CREATE (?:UNIQUE )?INDEX [^\n]* ON "afiliados"[^\n]*|ALTER TABLE "afiliados"[^\n]*)$/gm,
            '',
          );
      await memory.exec(baselineDdl);
      const migration = fs.readFileSync(
        path.resolve(__dirname, '../prisma/migrations/20261114090000_eps_workspace/migration.sql'),
        'utf8',
      );
      assert.ok(!/DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i.test(migration));
      await memory.exec(migration);
      await memory.exec(fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261115090000_eps_role_integration/migration.sql'),'utf8'));
      await socket.start();
      pool = new Pool({
        connectionString: 'postgresql://postgres@' + socket.getServerConn() + '/postgres',
        max: 1,
      });
      db = new PrismaClient({ adapter: new PrismaPg(pool) });
      const service = createService(db),
        app = express();
      app.use(express.json());
      app.use(
        '/api/eps',
        createRouter({
          controller: createController({ service }),
          guard: createEpsSession({ db, verify: (token) => jwt.verify(token, secret) }),
        }),
      );
      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const origin = 'http://127.0.0.1:' + server.address().port;
      for (const [id, nombre] of [
        [2, 'PACIENTE'],
        [3, 'FARMACIA'],
        [4, 'EPS'],
      ])
        await db.rol.create({ data: { id, nombre } });
      async function account(id, rol) {
        return db.usuario.create({
          data: {
            id,
            rol_id: rol,
            nombre: 'Account ' + id,
            apellido: 'Isolated',
            correo: 'account' + id + '@example.test',
            cedula: 'D' + id,
            password: 'NOT_A_REAL_PASSWORD',
            estado: 'ACTIVO',
          },
        });
      }
      for (const [id, rol] of [
        [1, 4],
        [2, 4],
        [3, 2],
        [4, 2],
        [5, 3],
        [6, 4],
      ])
        await account(id, rol);
      for (const id of ['EPS-A', 'EPS-B'])
        await db.epsEntidad.create({
          data: {
            id,
            nombre: id,
            nit: id,
            correo: 'eps@example.test',
            telefono: '123',
            direccion: 'Local',
            ciudad: 'Bogota',
          },
        });
      await db.epsAcceso.createMany({
        data: [
          { usuario_id: 1, eps_id: 'EPS-A' },
          { usuario_id: 2, eps_id: 'EPS-B' },
          { usuario_id: 6, eps_id: 'EPS-A' },
        ],
      });
      const category = await db.categoria.create({ data: { nombre: 'Isolated' } }),
        drug = await db.medicamento.create({
          data: { nombre: 'Isolated medicine', categoria_id: category.id, precio: 1, stock: 999 },
        });
      const token = (id = 1, rol = 4) =>
        jwt.sign({ id, rol, iat: Math.floor(Date.now() / 1000) - 10 }, secret, {
          expiresIn: '10m',
        });
      async function req(route, { method = 'GET', body, auth = token(), status = 200 } = {}) {
        const r = await fetch(origin + '/api/eps' + route, {
          method,
          headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await r.json();
        assert.equal(r.status, status, method + ' ' + route + ' ' + JSON.stringify(data));
        assert.equal(r.headers.get('cache-control'), 'no-store');
        return data;
      }
      const input = {
        nombres: 'Ana',
        apellidos: 'Isolated',
        tipo_documento: 'CC',
        documento: '100003',
        fecha_nacimiento: '2000-01-01',
        telefono: '123',
        correo: 'ana@example.test',
        direccion: 'Local',
        ciudad: 'Bogota',
        regimen: 'CONTRIBUTIVO',
        estado: 'ACTIVO',
      };
      const a = (
        await req('/afiliados', {
          method: 'POST',
          status: 201,
          body: { ...input, estado: 'Activo', regimen: 'Subsidiado' },
        })
      ).afiliado;
      const b = (
        await req('/afiliados', {
          method: 'POST',
          status: 201,
          auth: token(2),
          body: { ...input, documento: '100004', correo: 'b@example.test' },
        })
      ).afiliado;
      await db.afiliado.update({ where: { id: a.id }, data: { usuario_id: 3 } });
      await db.afiliado.update({ where: { id: b.id }, data: { usuario_id: 4 } });
      const order = await db.solicitud.create({ data: { usuario_id: 3 } }),
        foreign = await db.solicitud.create({ data: { usuario_id: 4 } });
      await db.detalleSolicitud.create({
        data: {
          solicitud_id: order.id,
          medicamento_id: drug.id,
          cantidad: 1,
          precio: 1,
          subtotal: 1,
        },
      });
      await t.test('live account and tenant access, never client tenant ids', async () => {
        await req('/dashboard', { auth: 'invalid', status: 401 });
        await req('/dashboard', { auth: token(3, 2), status: 403 });
        await req('/afiliados?eps_id=EPS-B', { status: 400 });
        assert.equal((await req('/afiliados')).paginacion.total, 1);
        assert.equal((await req('/afiliados?estado=ACTIVO')).paginacion.total, 1);
        assert.equal((await req('/pacientes')).paginacion.total, 1);
        await req('/pacientes/4', { status: 404 });
        await req('/afiliados/' + b.id, {
          method: 'PATCH',
          body: { estado: 'INACTIVO', version: 1 },
          status: 404,
        });
      });
      await t.test(
        'affiliation updates, strict validation, duplicate and stale edits',
        async () => {
          await req('/afiliados', {
            method: 'POST',
            body: { ...input, estado: 'Activo', regimen: 'Subsidiado' },
            status: 409,
          });
          await req('/afiliados', {
            method: 'POST',
            body: { ...input, documento: 'other', eps_id: 'EPS-B' },
            status: 400,
          });
          const r = await req('/afiliados/' + a.id, {
            method: 'PATCH',
            body: { telefono: '456', version: 1 },
          });
          assert.equal(r.afiliado.eps_version, 2);
          await req('/afiliados/' + a.id, {
            method: 'PATCH',
            body: { telefono: '789', version: 1 },
            status: 409,
          });
          assert.equal((await req('/historial/AFILIADO/' + a.id)).datos.length, 2);
        },
      );
      let authorization;
      await t.test(
        'authorization creation, cross-tenant denial, resolution and audit',
        async () => {
          await req('/autorizaciones', {
            method: 'POST',
            body: {
              afiliado_id: a.id,
              solicitud_id: foreign.id,
              concepto: 'Review',
              motivo: 'Documented',
            },
            status: 404,
          });
          authorization = (
            await req('/autorizaciones', {
              method: 'POST',
              status: 201,
              body: {
                afiliado_id: a.id,
                solicitud_id: order.id,
                concepto: 'Clinical review',
                motivo: 'Documented',
              },
            })
          ).autorizacion;
          await req('/autorizaciones/' + authorization.id, {
            auth: token(2),
            method: 'PATCH',
            body: { estado: 'APROBADA', motivo: 'Review', version: 1 },
            status: 404,
          });
          await req('/autorizaciones/' + authorization.id, {
            method: 'PATCH',
            body: { estado: 'APROBADA', motivo: '', version: 1 },
            status: 400,
          });
          await req('/autorizaciones/' + authorization.id, {
            method: 'PATCH',
            body: { estado: 'APROBADA', motivo: 'Documented review', version: 1 },
          });
          await req('/autorizaciones/' + authorization.id, {
            method: 'PATCH',
            body: { estado: 'RECHAZADA', motivo: 'Stale', version: 1 },
            status: 409,
          });
          assert.equal((await req('/historial/AUTORIZACION/' + authorization.id)).datos.length, 2);
        },
      );
      await t.test(
        'patient requests and EPS follow-up preserve pharmacy operational state',
        async () => {
          assert.equal((await req('/solicitudes')).paginacion.total, 1);
          await req('/solicitudes/' + foreign.id + '/seguimiento', {
            method: 'PATCH',
            body: { estado: 'EN_REVISION', motivo: 'Review' },
            status: 404,
          });
          for (const [estado, version] of [
            ['EN_REVISION', 0],
            ['RESUELTA', 1],
            ['CERRADA', 2],
          ])
            await req('/solicitudes/' + order.id + '/seguimiento', {
              method: 'PATCH',
              body: { estado, motivo: 'Documented ' + estado, version },
            });
          await req('/solicitudes/' + order.id + '/seguimiento', {
            method: 'PATCH',
            body: { estado: 'EN_REVISION', motivo: 'Invalid', version: 3 },
            status: 409,
          });
          assert.equal(
            (await db.solicitud.findUnique({ where: { id: order.id } })).estado,
            'PENDIENTE',
          );
        },
      );
      await t.test(
        'pharmacy links and actual per-pharmacy inventory, no global-stock substitution',
        async () => {
          await req('/farmacias/vinculo', {
            method: 'PUT',
            body: { farmacia_id: 3, activa: true },
            status: 404,
          });
          const link = (
            await req('/farmacias/vinculo', {
              method: 'PUT',
              body: { farmacia_id: 5, activa: true },
            })
          ).vinculo;
          assert.equal((await req('/inventario')).paginacion.total, 0);
          const { syncInventory } = require('../scripts/eps-sync-inventory.cjs');
          const snapshot = [{ farmacia_id: 5, medicamento_id: drug.id, stock: 2, minimo: 5 }];
          assert.equal((await syncInventory(db, 'EPS-A', snapshot)).mode, 'READ_ONLY_PLAN');
          assert.equal(await db.epsExistencia.count(), 0);
          await assert.rejects(
            syncInventory(db, 'EPS-B', snapshot, { apply: true }),
            (e) => e.status === 400,
          );
          await syncInventory(db, 'EPS-A', snapshot, { apply: true });
          await assert.rejects(
            syncInventory(
              db,
              'EPS-A',
              [
                { ...snapshot[0], stock: 0 },
                { farmacia_id: 6, medicamento_id: drug.id, stock: 0, minimo: 5 },
              ],
              { apply: true },
            ),
            (e) => e.status === 400,
          );
          assert.equal((await db.epsExistencia.findFirst()).stock, 2);
          assert.equal((await req('/inventario?estado=BAJO')).datos[0].stock, 2);
          assert.equal((await req('/inventario', { auth: token(2) })).paginacion.total, 0);
          await req('/farmacias/vinculo', {
            method: 'PUT',
            body: { farmacia_id: 5, activa: false, version: 1 },
          });
          assert.equal((await req('/inventario')).paginacion.total, 0);
          await req('/farmacias/vinculo', {
            method: 'PUT',
            body: { farmacia_id: 5, activa: true, version: 2 },
          });
        },
      );
      await t.test(
        'actual notifications, read receipts isolated per account, profile and dashboard',
        async () => {
          const notifications = await req('/notificaciones?estado=PENDIENTE');
          assert.ok(notifications.paginacion.total >= 8);
          assert.ok(notifications.datos.some((n) => n.tipo === 'INVENTARIO'));
          const id = notifications.datos[0].id;
          await req('/notificaciones/' + id + '/leida', {
            auth: token(2),
            method: 'PATCH',
            status: 404,
          });
          await req('/notificaciones/' + id + '/leida', { method: 'PATCH' });
          assert.equal(
            (await req('/notificaciones?estado=PENDIENTE')).paginacion.total,
            notifications.paginacion.total - 1,
          );
          assert.equal(
            (await req('/notificaciones?estado=PENDIENTE', { auth: token(6) })).paginacion.total,
            notifications.paginacion.total,
          );
          const d = (await req('/dashboard')).estadisticas;
          assert.equal(d.afiliados, 1);
          assert.equal(d.pacientes, 1);
          assert.equal(d.farmacias, 1);
          assert.equal(d.stock_bajo, 1);
          assert.equal(d.solicitudes, 1);
          const profile = (await req('/perfil')).perfil;
          await req('/perfil', {
            method: 'PUT',
            body: {
              nombre: 'Updated EPS',
              correo: profile.correo,
              telefono: profile.telefono,
              direccion: profile.direccion,
              ciudad: profile.ciudad,
              version: profile.version,
            },
          });
          assert.equal((await req('/perfil', { auth: token(2) })).perfil.nombre, 'EPS-B');
        },
      );
      if (process.env.EPS_BROWSER === '1') {
        await t.test(
          'EPS browser uses real isolated HTTP API across all menu entries',
          async () => {
            app.use(express.static(path.resolve(__dirname, '../../frontend/dist')));
            browser = await require('./support/afiliados-edge.cjs').abrirEdge();
            const { send, evaluate, until } = browser;
            await send('Page.navigate', { url: origin + '/pages/eps.html' });
            await until(() => evaluate('document.readyState === "complete"'));
            await evaluate(
              'sessionStorage.setItem("saludclick_token",' +
                JSON.stringify(token(6)) +
                ');sessionStorage.setItem("saludclick_user",JSON.stringify({id:6,nombre:"EPS A",rol:4}));',
            );
            await send('Page.navigate', { url: origin + '/pages/eps.html' });
            await until(() =>
              evaluate(
                'document.querySelector("#epsWorkspace")?.getAttribute("aria-busy")==="false"',
              ),
            );
            for (const view of [
              'dashboard',
              'afiliados',
              'farmacias',
              'inventario',
              'solicitudes',
              'notificaciones',
              'perfil',
            ]) {
              await evaluate('document.querySelector("[data-eps-view=' + view + ']").click()');
              await until(() =>
                evaluate(
                  'document.querySelector("#epsWorkspace")?.getAttribute("aria-busy")==="false"',
                ),
              );
              assert.equal(await evaluate('document.querySelector("#epsMessage").textContent'), '');
              assert.ok(
                await evaluate('document.querySelector("#epsWorkspace").textContent.length > 10'),
              );
            }

            assert.equal(
              await evaluate('document.querySelectorAll("[data-eps-view=pacientes], [data-eps-view=autorizaciones]").length'),
              0,
            );
            for (const [parent, view, label, action] of [
              ['afiliados', 'pacientes', 'Pacientes vinculados', 'Ver datos autorizados'],
              ['solicitudes', 'autorizaciones', 'Autorizaciones', 'Crear autorizacion'],
            ]) {
              await navigate(parent);
              await clickText(label);
              await until(() =>
                evaluate('location.hash === "#' + view + '" && document.querySelector("#epsWorkspace").getAttribute("aria-busy") === "false"'),
              );
              await clickText(action);
              await until(() => evaluate('document.querySelector("#epsDialog").open'));
              await evaluate('document.querySelector("dialog").close()');
            }

            async function clickText(text, selector = 'button') {
              await evaluate(
                'Array.from(document.querySelectorAll(' +
                  JSON.stringify(selector) +
                  ')).find(n=>n.textContent.trim()===' +
                  JSON.stringify(text) +
                  ').click()',
              );
            }
            async function navigate(view) {
              await evaluate('document.querySelector("[data-eps-view=' + view + ']").click()');
              await until(() =>
                evaluate(
                  'document.querySelector("#epsWorkspace").getAttribute("aria-busy")==="false"',
                ),
              );
            }
            async function submit(values) {
              await evaluate(
                '(()=>{const f=document.querySelector("#epsDialog form");for(const [key,value] of Object.entries(' +
                  JSON.stringify(values) +
                  '))f.elements.namedItem(key).value=value;f.querySelector("[type=submit]").click();})()',
              );
              await until(() =>
                evaluate(
                  '!document.querySelector("#epsDialog").open && document.querySelector("#epsWorkspace").getAttribute("aria-busy")==="false"',
                ),
              );
            }
            await navigate('afiliados');
            await clickText('Registrar afiliado');
            await submit({
              ...input,
              nombres: 'Browser',
              documento: '500005',
              correo: 'browser@example.test',
            });
            const created = await db.afiliado.findUnique({ where: { documento: '500005' } });
            assert.ok(created);
            assert.equal(created.eps_id, 'EPS-A');
            await evaluate(
              'Array.from(document.querySelectorAll("tbody tr")).find(r=>r.textContent.includes("500005")).querySelectorAll("button")[1].click()',
            );
            await submit({ telefono: '999' });
            assert.equal(
              (await db.afiliado.findUnique({ where: { id: created.id } })).telefono,
              '999',
            );
            await clickText('Historial');
            await until(() => evaluate('document.querySelector("#epsDialog").open'));
            assert.ok(
              await evaluate(
                'document.querySelector("#epsDialogContent").textContent.includes("Pagina 1 de")',
              ),
            );
            await evaluate('document.querySelector("#epsCloseDialog").click()');

            await evaluate(
              'Array.from(document.querySelectorAll("tbody tr")).find(r=>r.textContent.includes("100003")).querySelectorAll("button")[1].click()',
            );
            await until(() => evaluate('document.querySelector("#epsDialog").open'));
            assert.equal(
              await evaluate(
                'document.querySelector("#epsDialog form").elements.namedItem("estado").value',
              ),
              'Activo',
            );
            assert.equal(
              await evaluate(
                'document.querySelector("#epsDialog form").elements.namedItem("regimen").value',
              ),
              'Subsidiado',
            );
            await evaluate('document.querySelector("#epsCloseDialog").click()');

            await navigate('solicitudes');
            const nextOrder = await db.solicitud.create({ data: { usuario_id: 3 } });
            await clickText('Actualizar');
            await until(() =>
              evaluate(
                'document.querySelector("#epsWorkspace").getAttribute("aria-busy")==="false"',
              ),
            );
            await evaluate(
              'Array.from(document.querySelectorAll("tbody tr")).find(r=>r.textContent.includes("#' +
                nextOrder.id +
                ' ")).querySelectorAll("button")[1].click()',
            );
            await submit({ estado: 'EN_REVISION', motivo: 'Browser follow-up' });
            assert.equal(
              (
                await db.epsSeguimiento.findUnique({
                  where: { eps_id_solicitud_id: { eps_id: 'EPS-A', solicitud_id: nextOrder.id } },
                })
              ).estado,
              'EN_REVISION',
            );
            async function inventoryAction(label) {
              await clickText(label);
              await until(() => evaluate('document.querySelector("#epsWorkspace").getAttribute("aria-busy") === "false"'));
            }
            async function applyInventoryFilters({ buscar = '', estado = '', farmacia = '5' } = {}) {
              await evaluate('(() => { const fields = document.querySelector(".eps-toolbar").elements; const filters = ' +
                JSON.stringify({ buscar, estado, farmacia }) +
                '; for (const [key, value] of Object.entries(filters)) fields.namedItem(key).value = value; })()');
              await inventoryAction('Buscar');
            }
            const inventoryText = () => evaluate('document.querySelector("#epsWorkspace").textContent');
            await navigate('farmacias');
            assert.equal(await evaluate('document.querySelector(".eps-toolbar").checkValidity()'), true);
            await inventoryAction('Buscar');
            await inventoryAction('Medicamentos');
            assert.equal(await evaluate('location.hash'), '#inventario');
            assert.equal(await evaluate('document.querySelector("[name=farmacia]").value'), '5');
            assert.equal(await evaluate('document.querySelector(".eps-toolbar").checkValidity()'), true);
            await inventoryAction('Buscar');
            assert.match(await inventoryText(), /Isolated medicine/);
            await applyInventoryFilters({ farmacia: '999' });
            assert.match(await inventoryText(), /todav.*no tiene existencias/);
            await applyInventoryFilters({ buscar: 'no match' });
            assert.match(await inventoryText(), /No hay registros para los filtros seleccionados/);
            await applyInventoryFilters({ estado: 'AGOTADO' });
            assert.doesNotMatch(await inventoryText(), /Isolated medicine/);

            const link = await db.epsFarmacia.findFirstOrThrow({ where: { eps_id: 'EPS-A', farmacia_id: 5 } });
            const more = await db.medicamento.createManyAndReturn({
              data: Array.from({ length: 25 }, (_, i) => ({
                nombre: 'Pagination fixture ' + (i + 1), categoria_id: category.id, precio: 1,
              })),
            });
            await db.epsExistencia.createMany({
              data: more.map(item => ({ vinculo_id: link.id, medicamento_id: item.id, stock: 2, minimo: 5 })),
            });
            await applyInventoryFilters({ estado: 'BAJO' });
            assert.match(await inventoryText(), /26 registros \/ Pagina 1 de 2/);
            await inventoryAction('Siguiente');
            assert.match(await inventoryText(), /26 registros \/ Pagina 2 de 2/);
            assert.match(await inventoryText(), /Isolated medicine/);
            await inventoryAction('Actualizar');
            assert.match(await inventoryText(), /26 registros \/ Pagina 2 de 2/);
            assert.equal(await evaluate('document.querySelector("[name=estado]").value'), 'BAJO');
            assert.equal(await evaluate('document.querySelector("[name=farmacia]").value'), '5');
            await inventoryAction('Anterior');
            await inventoryAction('Limpiar filtros');
            assert.match(await inventoryText(), /26 registros \/ Pagina 1 de 2/);
            assert.equal(await evaluate('document.querySelector("[name=farmacia]").value'), '');
            await applyInventoryFilters({ buscar: 'isolated MEDICINE', estado: 'BAJO' });
            assert.match(await inventoryText(), /1 registros \/ Pagina 1 de 1/);

            for (const width of [390, 320]) {
              await send('Emulation.setDeviceMetricsOverride', {
                width,
                height: 844,
                deviceScaleFactor: 1,
                mobile: true,
              });
              assert.ok(
                await evaluate('document.documentElement.scrollWidth <= innerWidth'),
                'EPS layout at ' + width + 'px',
              );
            }
            await evaluate('document.querySelector("#menuToggle").click()');
            assert.equal(await evaluate('document.querySelector("#menuToggle").getAttribute("aria-expanded")'), 'true');
            await navigate('afiliados');
            assert.equal(await evaluate('document.querySelector("#menuToggle").getAttribute("aria-expanded")'), 'false');
            assert.equal(await evaluate('document.activeElement.id'), 'epsTitle');
            assert.ok(await evaluate(`(() => {
              const table = document.querySelector('.eps-table-scroll');
              return table.clientWidth < table.scrollWidth && table.tabIndex === 0
                && document.documentElement.scrollWidth <= innerWidth;
            })()`));
            await clickText('Registrar afiliado');
            await until(() => evaluate('document.querySelector("#epsDialog").open'));
            assert.ok(await evaluate(`(() => {
              const dialog = document.querySelector('#epsDialog');
              const bounds = dialog.getBoundingClientRect();
              return bounds.left >= 0 && bounds.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
            })()`));
            await evaluate('document.querySelector("#epsCloseDialog").click()');
            await send('Emulation.clearDeviceMetricsOverride');
            await evaluate('document.querySelector("#logout").click()');
            await until(() => evaluate('location.pathname === "/login.html"'));
            assert.equal(
              await evaluate(
                'localStorage.getItem("saludclick_token") || sessionStorage.getItem("saludclick_token")',
              ),
              null,
            );
            await req('/dashboard', { auth: token(6), status: 401 });

            assert.deepEqual(browser.errores, []);
            await browser.cerrar();
            browser = null;
          },
        );
      }
      await t.test('logout revokes old token server-side', async () => {
        await req('/logout', { method: 'POST' });
        await req('/dashboard', { status: 401 });
        assert.equal((await req('/dashboard', { auth: token(2) })).ok, true);
      });
    } finally {
      if (browser) await browser.cerrar();
      if (server) await new Promise((r) => server.close(r));
      if (db) await db.$disconnect();
      if (pool) await pool.end();
      await socket.stop();
      await memory.close();
    }
  },
);
