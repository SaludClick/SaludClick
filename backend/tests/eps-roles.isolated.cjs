// Four-role workflow against the real app and PostgreSQL WASM, never .env/Neon.
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  http = require('node:http');
const { randomUUID, randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg'),
  { PrismaClient } = require('@prisma/client'),
  { PrismaPg } = require('@prisma/adapter-pg');
const jwt = require('jsonwebtoken');
test(
  'admin -> patient -> EPS -> assigned pharmacy -> patient notifications',
  { timeout: 180000 },
  async (t) => {
    const prismaRequire = require('node:module').createRequire(require.resolve('@prisma/dev', {
      paths: [path.dirname(require.resolve('prisma/package.json'))],
    }));
    const { PGlite } = prismaRequire('@electric-sql/pglite');
    const { PGLiteSocketServer } = prismaRequire('@electric-sql/pglite-socket');
    const memory = await PGlite.create(),
      socket = new PGLiteSocketServer({
        db: memory,
        port: 0,
        host: '127.0.0.1',
        maxConnections: 1,
      });
    let pool, db, server, browser;
    try {
      assert.equal(process.env.FARMACIA_OPERACION_ENABLED, 'false');
      const migrations = path.resolve(__dirname, '../prisma/migrations');
      for (const name of fs.readdirSync(migrations).sort()) {
        if (name > '20261116173000_eps_notificaciones') break;
        if (name.startsWith('20261111190000')) {
          await memory.exec("INSERT INTO roles(id,nombre) VALUES(2,'usuario')");
        }
        await memory.exec(fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8'));
      }
      const pending = await memory.query("SELECT to_regclass('farmacia_catalogo_autorizaciones') AS tabla");
      assert.equal(pending.rows[0].tabla, null);
      await socket.start();
      pool = new Pool({
        connectionString: 'postgresql://postgres@' + socket.getServerConn() + '/postgres',
        max: 1,
      });
      db = new PrismaClient({ adapter: new PrismaPg(pool) });
      for (const [file, exports] of [
        ['../src/config/database', pool],
        ['../src/config/prisma', db],
        [
          '../src/repositories/afiliados-origen.repository',
          { leerAutorizados: async () => ({
            pacientes: [{ identificador: a.id, documento: '10002', tipo_documento: 'CC',
              nombres: 'Person2', apellidos: 'Fixture' }],
            total: 1, afiliados: { total: 1, activos: 1, inactivos: 0 },
          }) },
        ],
      ]) {
        const id = require.resolve(file);
        require.cache[id] = { id, filename: id, loaded: true, exports };
      }
      process.env.JWT_SECRET = 'four-role-isolated-only';
      const priorUploadDir = process.env.FORMULA_UPLOAD_DIR;
      const formulaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saludclick-eps-formulas-'));
      process.env.FORMULA_UPLOAD_DIR = formulaDir;
      t.after(() => {
        if (priorUploadDir === undefined) delete process.env.FORMULA_UPLOAD_DIR;
        else process.env.FORMULA_UPLOAD_DIR = priorUploadDir;
        if (fs.existsSync(formulaDir)) {
          for (const file of fs.readdirSync(formulaDir)) {
            assert.match(file, /^[0-9a-f-]+\.pdf$/);
            fs.unlinkSync(path.join(formulaDir, file));
          }
          fs.rmdirSync(formulaDir);
        }
      });
      server = http.createServer();
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      process.env.PORT = String(server.address().port);
      const origin = 'http://127.0.0.1:' + server.address().port;
      const app = require('../src/app');
      server.on('request', app);
      for (const [id, nombre] of [
        [1, 'admin'],
        [2, 'PACIENTE'],
        [3, 'farmacia'],
        [4, 'EPS'],
      ])
        await db.rol.upsert({ where: { id }, create: { id, nombre }, update: {} });
      const roleMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 2, 6: 3, 7: 4, 8: 2 };
      for (const [id, rol] of Object.entries(roleMap))
        await db.usuario.create({
          data: {
            id: Number(id),
            nombre: 'Person' + id,
            apellido: 'Fixture',
            correo: 'user' + id + '@example.test',
            cedula: '1000' + id,
            tipo_documento: 'CC',
            rol_id: rol,
            estado: 'ACTIVO',
            password: await bcrypt.hash(randomBytes(32).toString('base64url'), 10),
          },
        });
      const token = (id) =>
        jwt.sign({ id, rol: roleMap[id] }, process.env.JWT_SECRET, { expiresIn: '10m' });
      async function req(route, { id = 1, method = 'GET', body, status = 200, key, auth } = {}) {
        const r = await fetch(origin + '/api' + route, {
          method,
          headers: {
            Authorization: 'Bearer ' + (auth || token(id)),
            'Content-Type': 'application/json',
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await r.json();
        assert.equal(r.status, status, method + ' ' + route + ' ' + JSON.stringify(data));
        return data;
      }
      const entityInput = (id) => ({
        id,
        nombre: id === 'A' ? 'VidaPlena - SIMULACION SIN VALIDEZ OPERATIVA' : 'Entity ' + id,
        nit: id === 'A' ? 'PRUEBA-VIDAPLENA' : id,
        correo: id === 'A' ? 'vidaplena@example.test' : '',
        telefono: id === 'A' ? '0000000000' : '',
        direccion: id === 'A' ? 'Direccion ficticia de prueba' : '',
        ciudad: 'Local',
      });
      const affiliateInput = (id) => ({
        nombres: 'Person' + id,
        apellidos: 'Fixture',
        tipo_documento: 'CC',
        documento: '1000' + id,
        fecha_nacimiento: '2000-01-01',
        telefono: '123',
        correo: 'user' + id + '@example.test',
        direccion: 'Local',
        ciudad: 'Local',
        regimen: 'Subsidiado',
        estado: 'Activo',
      });
      let a, b, linkA, linkB, order, authorization;
      const category = await db.categoria.create({ data: { nombre: 'Fixture category' } }),
        drug = await db.medicamento.create({
          data: { nombre: 'Fixture medicine', requiere_formula: false, categoria_id: category.id, precio: 20, stock: 10 },
          select: { id: true, categoria_id: true },
        });
      await t.test(
        'administrator manages entities and EPS account scope without clinical access',
        async () => {
          await req('/integracion/admin/eps', {
            method: 'POST',
            status: 201,
            body: entityInput('A'),
          });
          await req('/integracion/admin/eps', {
            method: 'POST',
            status: 201,
            body: entityInput('B'),
          });
          await req('/integracion/admin/eps/A/acceso', {
            method: 'PUT',
            body: { usuario_id: 4, activo: true },
          });
          await req('/integracion/admin/eps/B/acceso', {
            method: 'PUT',
            body: { usuario_id: 7, activo: true },
          });
          await req('/integracion/admin/eps/A/acceso', {
            method: 'PUT',
            body: { usuario_id: 7, activo: true },
            status: 409,
          });
          await req('/integracion/admin/eps', { id: 2, status: 403 });
          await req('/eps/autorizaciones', { id: 1, status: 403 });
          const data = await req('/integracion/admin/eps');
          assert.equal(data.paginacion.total, 2);
          assert.ok(!JSON.stringify(data).includes('password'));
        },
      );
      await t.test(
        'identity-verified affiliate links expose only the patient own affiliation',
        async () => {
          a = (
            await req('/eps/afiliados', {
              id: 4,
              method: 'POST',
              status: 201,
              body: affiliateInput(2),
            })
          ).afiliado;
          b = (
            await req('/eps/afiliados', {
              id: 7,
              method: 'POST',
              status: 201,
              body: affiliateInput(5),
            })
          ).afiliado;
          for (const id of [2, 5])
            await db.pacienteAutorizado.create({
              data: {
                nombres: 'Person' + id,
                apellidos: 'Fixture',
                tipo_documento: 'CC',
                cedula: '1000' + id,
                estado: 'AUTORIZADO',
              },
            });
          await req('/integracion/admin/eps/A/paciente', {
            method: 'PUT',
            body: { afiliado_id: a.id, usuario_id: 5 },
            status: 409,
          });
          await req('/integracion/admin/eps/A/paciente', {
            method: 'PUT',
            body: { afiliado_id: a.id, usuario_id: 2 },
          });
          await req('/integracion/admin/eps/B/paciente', {
            method: 'PUT',
            body: { afiliado_id: b.id, usuario_id: 5 },
          });
          await db.afiliadoCuentaOrigen.create({
            data: { usuario_id: 2, afiliado_id: a.id, eps_id: 'A', verificado_por: 1 },
          });
          assert.equal(
            (await req('/integracion/paciente/afiliacion', { id: 2 })).afiliacion.eps.id,
            'A',
          );
          assert.equal(
            (await req('/integracion/paciente/afiliacion', { id: 5 })).afiliacion.eps.id,
            'B',
          );
          assert.equal((await req('/integracion/paciente/afiliacion', { id: 8 })).afiliacion, null);
          linkA = (
            await req('/integracion/admin/eps/A/farmacia', {
              method: 'PUT',
              body: { farmacia_id: 3, activa: true },
            })
          ).vinculo;
          linkB = (
            await req('/integracion/admin/eps/B/farmacia', {
              method: 'PUT',
              body: { farmacia_id: 6, activa: true },
            })
          ).vinculo;
        },
      );
      await t.test('VidaPlena pilot provisions 50 synthetic patient links without duplicates', async () => {
        async function provisionPatient(id) {
          const input = affiliateInput(id);
          let account = await db.usuario.findUnique({ where: { cedula: input.documento } });
          if (!account) {
            const password = randomBytes(32).toString('base64url');
            account = await db.usuario.create({
              data: {
                id, cedula: input.documento, tipo_documento: input.tipo_documento,
                nombre: input.nombres, apellido: input.apellidos, correo: input.correo,
                rol_id: 2, estado: 'ACTIVO', password: await bcrypt.hash(password, 10),
              },
            });
            assert.equal(await bcrypt.compare(password, account.password), true);
          }
          assert.equal(account.id, id);
          assert.equal(account.correo, input.correo);
          assert.equal(account.rol_id, 2);
          assert.equal(account.estado, 'ACTIVO');
          const affiliate = await db.afiliado.findUnique({ where: { documento: input.documento } })
            ?? (await req('/eps/afiliados', { id: 4, method: 'POST', status: 201, body: input })).afiliado;
          assert.equal(affiliate.eps_id, 'A');
          assert.ok(affiliate.usuario_id == null || affiliate.usuario_id === id);
          const authorized = await db.pacienteAutorizado.findFirst({ where: { cedula: input.documento } });
          if (!authorized) {
            await db.pacienteAutorizado.create({
              data: {
                nombres: input.nombres, apellidos: input.apellidos,
                tipo_documento: input.tipo_documento, cedula: input.documento, estado: 'AUTORIZADO',
              },
            });
          }
          await req('/integracion/admin/eps/A/paciente', {
            method: 'PUT', body: { afiliado_id: affiliate.id, usuario_id: id },
          });
        }

        const ids = [2, ...Array.from({ length: 49 }, (_, index) => index + 100)];
        for (const id of ids) await provisionPatient(id);
        const snapshot = () => db.afiliado.findMany({
          where: { eps_id: 'A' },
          orderBy: { id: 'asc' },
          select: { id: true, usuario_id: true, eps_version: true, verificado_at: true },
        });
        const first = await snapshot();
        assert.deepEqual(first.map((row) => row.usuario_id).sort((a, b) => a - b), ids);
        const eventCount = await db.epsEvento.count();
        for (const id of ids) await provisionPatient(id);
        assert.deepEqual(await snapshot(), first);
        assert.equal(await db.epsEvento.count(), eventCount);
        assert.equal(await db.usuario.count({ where: { id: { in: ids }, rol_id: 2 } }), 50);
        const entity = await db.epsEntidad.findUnique({ where: { id: 'A' } });
        assert.match(entity.nombre, /SIMULACION SIN VALIDEZ OPERATIVA/);
        assert.deepEqual(
          [entity.nit, entity.correo, entity.telefono, entity.direccion],
          ['PRUEBA-VIDAPLENA', 'vidaplena@example.test', '0000000000', 'Direccion ficticia de prueba'],
        );
      });
      await t.test('simulated rejection, empty cart and insufficient stock never persist payment or order', async () => {
        const payment = {numero:'4000000000000002',vencimiento:'12/30',cvv:'123',titular:'Titular de prueba'};
        const beforeOrders = await db.solicitud.count(), beforePayments = await db.pago.count();
        const rejected = await req('/pedidos/',{id:2,method:'POST',status:400,key:randomUUID(),body:{items:[{id:drug.id,cantidad:1}],pago:payment}});
        assert.match(rejected.mensaje,/Pago rechazado/);
        for (const items of [[],[{id:drug.id,cantidad:11}]]) await req('/pedidos/',{id:2,method:'POST',status:400,key:randomUUID(),body:{items,pago:{...payment,numero:'4242424242424242'}}});
        assert.equal(await db.solicitud.count(),beforeOrders);
        assert.equal(await db.pago.count(),beforePayments);
        assert.equal((await db.medicamento.findUnique({where:{id:drug.id},select:{stock:true}})).stock,10);
      });
      await t.test(
        'patient creates one permitted request through existing checkout and idempotency',
        async () => {
          const key = randomUUID(),
            body = {
              items: [{ id: drug.id, cantidad: 1 }],
              tipoEntrega: 'RECOGER',
              pago: {
                numero: '4242424242424242',
                vencimiento: '12/30',
                cvv: '123',
                titular: 'Fixture',
              },
            };
          const originalEnvironment = process.env.NODE_ENV;
          const simulationMode = process.env.PEDIDOS_SIMULADOS;
          try {
            process.env.NODE_ENV = 'production';
            process.env.PEDIDOS_SIMULADOS = 'true';
            order = (await req('/pedidos/', { id: 2, method: 'POST', status: 201, body, key })).solicitudId;
          } finally {
            if (originalEnvironment === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = originalEnvironment;
            if (simulationMode === undefined) delete process.env.PEDIDOS_SIMULADOS;
            else process.env.PEDIDOS_SIMULADOS = simulationMode;
          }
          assert.ok(order);
          const before = await db.epsNotificacionCompartida.count();
          await req('/pedidos/', { id: 2, method: 'POST', status: 201, body, key });
          assert.equal(await db.solicitud.count(), 1);
          assert.equal(await db.epsNotificacionCompartida.count(), before);
          assert.equal((await db.medicamento.findUnique({ where: { id: drug.id }, select: { stock: true } })).stock, 9);
          assert.equal(await db.pago.count(),1);
          const persisted = await db.pago.findFirst({where:{solicitud_id:order,usuario_id:2}});
          assert.equal(persisted.estado,'APROBADO');
          assert.equal(persisted.simulacion,true);
          assert.equal(persisted.metodo,'TARJETA');
          assert.equal(Number(persisted.monto),20);
          assert.equal(persisted.ultimos_digitos,'4242');
          assert.equal('numero' in persisted,false);
          assert.equal('cvv' in persisted,false);
          const details=(await req('/pedidos/'+order,{id:2})).pedido;
          assert.equal(details[0].referencia,persisted.referencia);
          assert.ok(details[0].fecha);

          assert.equal(
            (await req('/integracion/paciente/solicitudes', { id: 2 })).datos[0].id,
            order,
          );
          assert.equal(
            (await req('/integracion/paciente/solicitudes', { id: 5 })).paginacion.total,
            0,
          );
          await req('/integracion/paciente/solicitudes?usuario_id=2', { id: 5, status: 400 });
          assert.equal((await req('/farmacia/verificar-acceso', { id: 3 })).operacionHabilitada, false);
        },
      );
      await t.test(
        'EPS approves and assigns only its own authorization to a linked pharmacy',
        async () => {
          await req('/eps/autorizaciones', {
            id: 4,
            method: 'POST',
            status: 404,
            body: {
              afiliado_id: b.id,
              solicitud_id: order,
              concepto: 'PRIVATE_CONCEPT',
              motivo: 'PRIVATE_REASON',
            },
          });
          authorization = (
            await req('/eps/autorizaciones', {
              id: 4,
              method: 'POST',
              status: 201,
              body: {
                afiliado_id: a.id,
                solicitud_id: order,
                concepto: 'PRIVATE_CONCEPT',
                motivo: 'PRIVATE_REASON',
              },
            })
          ).autorizacion;
          await req('/eps/autorizaciones/' + authorization.id, {
            id: 7,
            method: 'PATCH',
            status: 404,
            body: { estado: 'APROBADA', motivo: 'Other EPS', version: 1 },
          });
          const resolved = (
            await req('/eps/autorizaciones/' + authorization.id, {
              id: 4,
              method: 'PATCH',
              body: { estado: 'APROBADA', motivo: 'PRIVATE_REASON', version: 1 },
            })
          ).autorizacion;
          await req('/integracion/eps/autorizaciones/' + authorization.id + '/farmacia', {
            id: 4,
            method: 'PUT',
            status: 404,
            body: { farmacia_id: 6, version: resolved.version },
          });
          await req('/integracion/eps/autorizaciones/' + authorization.id + '/farmacia', {
            id: 4,
            method: 'PUT',
            body: { farmacia_id: 3, version: resolved.version },
          });
          const count = await db.epsNotificacionCompartida.count();
          await req('/integracion/eps/autorizaciones/' + authorization.id + '/farmacia', {
            id: 4,
            method: 'PUT',
            body: { farmacia_id: 3, version: resolved.version },
          });
          assert.equal(await db.epsNotificacionCompartida.count(), count);
          const duplicate = await db.epsAutorizacion.create({
            data: {
              eps_id: resolved.eps_id, afiliado_id: resolved.afiliado_id, solicitud_id: order,
              responsable_id: 4, concepto: 'Duplicate test fixture', motivo: 'Duplicate test fixture',
              estado: 'APROBADA',
            },
          });
          try {
            await req('/integracion/eps/autorizaciones/' + duplicate.id + '/farmacia', {
              id: 4, method: 'PUT', status: 409,
              body: { farmacia_id: 3, version: duplicate.version },
            });
            assert.equal((await db.epsAutorizacion.findUnique({ where: { id: duplicate.id } })).farmacia_vinculo_id, null);
          } finally {
            await db.epsAutorizacion.delete({ where: { id: duplicate.id } });
          }
          const meta = await req('/integracion/admin/eps/A/autorizaciones');
          assert.equal(meta.datos[0].estado, 'APROBADA');
          assert.ok(!JSON.stringify(meta).includes('PRIVATE_'));
          assert.ok(!JSON.stringify(meta).includes('concepto'));
          assert.ok(!JSON.stringify(meta).includes('motivo'));
          const own = await req('/integracion/paciente/autorizaciones', { id: 2 });
          assert.equal(own.datos[0].concepto, 'PRIVATE_CONCEPT');
          assert.equal(
            (await req('/integracion/paciente/autorizaciones', { id: 5 })).paginacion.total,
            0,
          );
        },
      );
      await t.test(
        'assigned pharmacy sees authorized details; legacy endpoints cannot bypass scope',
        async () => {
          const queue = await req('/integracion/farmacia/pedidos', { id: 3 });
          assert.deepEqual(queue.pedidos.map(pedido => pedido.id), [order]);
          assert.equal(queue.resumen.pendientes, 1);
          assert.equal((await req('/integracion/farmacia/pedidos', { id: 6 })).paginacion.total, 0);
          assert.equal((await req('/integracion/farmacia/pedidos/' + order, { id: 3 })).pedido.id, order);
          await req('/integracion/farmacia/pedidos/' + order, { id: 6, status: 404 });
          const authorized = await req('/integracion/farmacia/autorizaciones', { id: 3 });
          assert.equal(authorized.datos[0].solicitud_id, order);
          assert.ok(!JSON.stringify(authorized).includes('PRIVATE_'));
          assert.equal(
            (await req('/integracion/farmacia/autorizaciones', { id: 6 })).paginacion.total,
            0,
          );
          assert.equal(authorized.datos[0].solicitud.operacion.siguienteEstado, null);
          assert.ok(authorized.datos[0].solicitud.operacion.bloqueos.includes('PAGO_REAL_NO_APROBADO'));
          assert.equal(authorized.datos[0].solicitud.pagos, undefined);
          await req('/farmacia/pedidos', { id: 3, status: 503 });
          await req('/farmacia/pedidos', { id: 6, status: 503 });
          await req('/integracion/farmacia/solicitudes/' + order + '/estado', {
            id: 3, method: 'PATCH', status: 503,
            body: { estadoActual: 'APROBADA', estado: 'PREPARANDO' },
          });
        },
      );
      process.env.FARMACIA_OPERACION_ENABLED = 'true';
      try {
        await t.test(
          'pharmacy selects from the catalog and only changes real stock in its own agreement',
          async () => {
            const path = '/integracion/farmacia/catalogo';
            const catalog = await req(path + '?buscar=fixture+medicine', { id: 3 });
            assert.equal(catalog.paginacion.total, 1);
            assert.equal(catalog.datos[0].id, drug.id);
            assert.equal('stock' in catalog.datos[0], false);
            assert.equal((await req(path + '?buscar=missing+medicine', { id: 3 })).paginacion.total, 0);
            await req(path + '?farmacia=6', { id: 3, status: 400 });
            await req(path, { id: 4, status: 403 });
            assert.equal((await req('/eps/inventario', { id: 4 })).paginacion.total, 0);
            await req('/integracion/farmacia/existencias', {
              id: 3,
              method: 'PUT',
              status: 404,
              body: { vinculo_id: linkB.id, medicamento_id: drug.id, stock: 4, minimo: 5 },
            });
            const row = (
              await req('/integracion/farmacia/existencias', {
                id: 3,
                method: 'PUT',
                body: { vinculo_id: linkA.id, medicamento_id: drug.id, stock: 4, minimo: 5 },
              })
            ).existencia;
            assert.equal((await req('/eps/inventario?estado=BAJO', { id: 4 })).datos[0].stock, 4);
            assert.equal((await req('/eps/inventario', { id: 7 })).paginacion.total, 0);
            const count = await db.epsNotificacionCompartida.count();
            await req('/integracion/farmacia/existencias', {
              id: 3,
              method: 'PUT',
              body: { vinculo_id: linkA.id, medicamento_id: drug.id, stock: 4, minimo: 5 },
            });
            assert.equal(await db.epsNotificacionCompartida.count(), count);
            await req('/integracion/farmacia/existencias', {
              id: 3,
              method: 'PUT',
              status: 409,
              body: {
                vinculo_id: linkA.id,
                medicamento_id: drug.id,
                stock: 0,
                minimo: 5,
                actualizado_at: '2000-01-01T00:00:00Z',
              },
            });
            await req('/integracion/farmacia/existencias', {
              id: 3,
              method: 'PUT',
              body: {
                vinculo_id: linkA.id,
                medicamento_id: drug.id,
                stock: 0,
                minimo: 5,
                actualizado_at: row.actualizado_at,
              },
            });
            assert.equal((await db.medicamento.findUnique({ where: { id: drug.id }, select: { stock: true } })).stock, 9);
            assert.equal((await req('/eps/dashboard', { id: 4 })).estadisticas.agotados, 1);
            assert.equal(
              await db.epsNotificacionCompartida.count({
                where: { usuario_id: 2, tipo: 'INVENTARIO' },
              }),
              0,
            );
          },
        );
        await t.test(
          'simulation mode lets the assigned pharmacy deliver without converting the payment to real',
          async () => {
            await req('/integracion/farmacia/solicitudes/' + order + '/estado', {
              id: 3, method: 'PATCH', status: 409,
              body: { estadoActual: 'APROBADA', estado: 'PREPARANDO' },
            });
            assert.equal((await db.solicitud.findUnique({ where: { id: order } })).estado, 'APROBADA');
            const simulationMode = process.env.PEDIDOS_SIMULADOS;
            try {
              process.env.PEDIDOS_SIMULADOS = 'true';
              const [existing] = (await req('/integracion/farmacia/existencias', { id: 3 })).datos;
              const inventory = (await req('/integracion/farmacia/existencias', {
                id: 3, method: 'PUT',
                body: {
                  vinculo_id: linkA.id, medicamento_id: drug.id, stock: 8, minimo: 5,
                  actualizado_at: existing.actualizado_at,
                },
              })).existencia;
              assert.equal(inventory.stock, 8);
              assert.equal((await req('/eps/inventario', { id: 4 })).datos[0].stock, 8);
              const pending = await req('/integracion/farmacia/pedidos/' + order, { id: 3 });
              assert.equal(pending.pedido.operacion.simulacion, true);
              assert.equal(pending.pedido.operacion.siguienteEstado, 'PREPARANDO');
              for (const [actual, next] of [
                ['APROBADA', 'PREPARANDO'],
                ['PREPARANDO', 'LISTA'],
                ['LISTA', 'ENTREGADA'],
              ])
                await req('/integracion/farmacia/solicitudes/' + order + '/estado', {
                  id: 3,
                  method: 'PATCH',
                  body: { estadoActual: actual, estado: next },
                });
            } finally {
              if (simulationMode === undefined) delete process.env.PEDIDOS_SIMULADOS;
              else process.env.PEDIDOS_SIMULADOS = simulationMode;
            }
            assert.equal((await db.pago.findFirst({ where: { solicitud_id: order } })).simulacion, true);
            assert.equal(
              (await req('/integracion/paciente/solicitudes', { id: 2 })).datos[0].estado,
              'ENTREGADA',
            );
            const stats = (await req('/eps/dashboard', { id: 4 })).estadisticas;
            assert.equal(stats.solicitudes, 1);
            assert.equal(stats.autorizaciones, 1);
            assert.equal(stats.pacientes, 50);
            assert.ok(
              (await req('/integracion/notificaciones', { id: 2 })).datos.some(
                (n) => n.tipo === 'SOLICITUD',
              ),
            );
          },
        );
      } finally {
        process.env.FARMACIA_OPERACION_ENABLED = 'false';
      }
      await t.test(
        'notifications are private, idempotent and synchronized with EPS read receipts',
        async () => {
          const notices = await req('/integracion/notificaciones', { id: 2 }),
            notice = notices.datos[0];
          await req('/integracion/notificaciones/' + notice.id + '/leida', {
            id: 5,
            method: 'PATCH',
            status: 404,
            body: {},
          });
          await req('/integracion/notificaciones/' + notice.id + '/leida', {
            id: 3,
            method: 'PATCH',
            status: 404,
            body: {},
          });
          await req('/integracion/notificaciones/' + notice.id + '/leida', {
            id: 2,
            method: 'PATCH',
            body: {},
          });
          const first = (
            await db.epsNotificacionCompartida.findUnique({ where: { id: notice.id } })
          ).leida_at;
          await req('/integracion/notificaciones/' + notice.id + '/leida', {
            id: 2,
            method: 'PATCH',
            body: {},
          });
          assert.equal(
            (
              await db.epsNotificacionCompartida.findUnique({ where: { id: notice.id } })
            ).leida_at.toISOString(),
            first.toISOString(),
          );
          const unread = (await req('/eps/notificaciones?estado=no_leidas', { id: 4 })).notificaciones;
          assert.ok(unread.length >= 2);
          await req('/eps/notificaciones/' + unread[0].id + '/leida', {
            id: 7, method: 'PATCH', status: 404,
          });
          await req('/eps/notificaciones/' + unread[0].id + '/leida', { id: 4, method: 'PATCH' });
          await req('/eps/notificaciones/leer-todas', { id: 4, method: 'PATCH' });
          assert.equal((await req('/eps/notificaciones/no-leidas/count', { id: 4 })).noLeidas, 0);
          for (const n of unread) {
            const shared = await db.epsNotificacionCompartida.findUnique({ where: { id: n.id } });
            const receipt = await db.epsLectura.findUnique({
              where: { evento_id_usuario_id: {
                evento_id: Number(shared.clave.split(':')[1]), usuario_id: 4,
              } },
            });
            assert.equal(+receipt.leida_at, +shared.leida_at);
          }
          const own = await db.epsNotificacionCompartida.findFirst({
            where: { usuario_id: 4 },
            orderBy: { id: 'asc' },
          });
          await req('/integracion/notificaciones/' + own.id + '/leida', {
            id: 4,
            method: 'PATCH',
            body: {},
          });
          assert.ok(
            await db.epsLectura.findUnique({
              where: {
                evento_id_usuario_id: { evento_id: Number(own.clave.split(':')[1]), usuario_id: 4 },
              },
            }),
          );
          const pending = await db.epsNotificacionCompartida.findFirst({
            where: { usuario_id: 4, leida_at: null },
          });
          const event = { id: Number(pending.clave.split(':')[1]) };
          await req('/eps/v1/notificaciones/' + event.id + '/leida', { id: 4, method: 'PATCH' });
          assert.ok(
            (
              await db.epsNotificacionCompartida.findUnique({
                where: { usuario_id_clave: { usuario_id: 4, clave: 'EPS_EVENTO:' + event.id } },
              })
            ).leida_at,
          );
          assert.ok(
            (await req('/integracion/notificaciones', { id: 1 })).datos.every(
              (n) => n.tipo === 'CONFIGURACION',
            ),
          );
          const dup = await db.$queryRawUnsafe(
            'SELECT usuario_id,clave,count(*) FROM eps_notificaciones_compartidas GROUP BY usuario_id,clave HAVING count(*)>1',
          );
          assert.equal(dup.length, 0);
        },
      );
      if (process.env.EPS_ROLES_BROWSER === '1')
        await t.test(
          'existing four-role pages expose integration using the real isolated API',
          async () => {
            browser = await require('./support/afiliados-edge.cjs').abrirEdge();
            const { send, evaluate, until } = browser;
            t.after(() => { process.env.FARMACIA_OPERACION_ENABLED = 'false'; });
            for (const [id, page] of [
              [1, 'admin'],
              [2, 'historial'],
              [3, 'farmacia'],
              [4, 'eps-convenios#inventario'],
            ]) {
              const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
                source:
                  'sessionStorage.setItem("saludclick_token",' +
                  JSON.stringify(token(id)) +
                  ');sessionStorage.setItem("saludclick_user",JSON.stringify({id:' +
                  id +
                  ',rol:' +
                  roleMap[id] +
                  ',nombre:"Fixture"}));',
              });
              process.env.FARMACIA_OPERACION_ENABLED = id === 3 ? 'true' : 'false';
              const [file, fragment] = page.split('#');
              await send('Page.navigate', { url: origin + '/pages/' + file + '.html' + (fragment ? '#' + fragment : '') });
              if (id === 4) {
                await until(() => evaluate('location.hash === "#inventario" && document.querySelector("#epsWorkspace")?.getAttribute("aria-busy") === "false"'));
                assert.equal(await evaluate('document.querySelectorAll("[data-eps-view=autorizaciones], [data-eps-view=pacientes]").length'), 0);
                await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
                continue;
              }
              await until(() =>
                evaluate('!!document.querySelector("[data-eps-integration] button")'),
              );
              await evaluate('document.querySelector("[data-eps-integration] button").click()');
              await until(() =>
                evaluate(
                  'document.querySelector("[data-eps-integration]").textContent.includes("Datos de integracion actualizados.")',
                ),
              );
              assert.ok(
                await evaluate(
                  'document.querySelector("[data-eps-integration]").textContent.includes(' +
                    JSON.stringify(
                      id === 1 ? 'VidaPlena - SIMULACION SIN VALIDEZ OPERATIVA' : id === 2 ? 'PRIVATE_CONCEPT' : 'Fixture medicine',
                    ) +
                    ')',
                ),
              );
              if (id === 3) {
                const extra = await db.medicamento.create({
                  data: { nombre: 'Catalog selection fixture', categoria_id: drug.categoria_id, precio: 20, stock: 0, requiere_formula: false },
                  select: { id: true },
                });
                await evaluate('[...document.querySelectorAll("[data-eps-integration] button")].find(b => b.textContent === "Registrar existencias").click()');
                await until(() => evaluate('[...document.querySelectorAll("dialog select[name=medicamento_id] option")].some(o => o.value === ' + JSON.stringify(String(extra.id)) + ')'));
                await evaluate('document.querySelector("dialog input[type=search]").value = "Catalog selection"; document.querySelector("dialog input[type=search]").dispatchEvent(new KeyboardEvent("keydown", {key:"Enter"}));');
                await until(() => evaluate('document.querySelector("dialog select[name=medicamento_id]")?.options.length === 2'));
                await evaluate('(() => { const form = document.querySelector("dialog form"); form.elements.medicamento_id.value = ' + JSON.stringify(String(extra.id)) + '; form.elements.stock.value = "7"; form.elements.minimo.value = "2"; form.requestSubmit(); })()');
                await until(() => evaluate('!document.querySelector("dialog[open]") && document.querySelector("[data-eps-integration]").textContent.includes("Catalog selection fixture")'));
                const eps = await req('/eps/inventario?farmacia=3&buscar=Catalog+selection', { id: 4 });
                assert.deepEqual(eps.datos.map(row => [row.medicamento.id, row.stock, row.minimo]), [[extra.id, 7, 2]]);
                assert.equal((await db.medicamento.findUnique({ where: { id: extra.id }, select: { stock: true } })).stock, 0);
              }
              await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
            }
            const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
              source: 'sessionStorage.setItem("saludclick_token",' + JSON.stringify(token(4)) +
                ');sessionStorage.setItem("saludclick_user",JSON.stringify({id:4,rol:4,nombre:"Fixture"}));',
            });
            await send('Page.navigate', { url: origin + '/pages/eps.html#notificaciones' });
            await until(() => evaluate('document.querySelector("[href=\'/pages/eps-v1.html\']") !== null'));
            await send('Page.navigate', { url: origin + '/pages/eps-v1.html#notificaciones' });
            await until(() => evaluate('document.querySelector("[data-eps-view=notificaciones]") !== null'));
            await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
            assert.deepEqual(browser.errores, []);
            await browser.cerrar();
            browser = null;
          },
        );
      await t.test(
        'revoked memberships, changed roles and expired tokens are rejected',
        async () => {
          await req('/integracion/admin/eps/A/acceso', {
            method: 'PUT',
            body: { usuario_id: 4, activo: false },
          });
          await req('/eps/dashboard', { id: 4, status: 403 });
          await req('/integracion/eps/autorizaciones/' + authorization.id + '/farmacia', {
            id: 4,
            method: 'PUT',
            status: 403,
            body: { farmacia_id: 3, version: 3 },
          });
          await db.usuario.update({ where: { id: 3 }, data: { estado: 'INACTIVO' } });
          await req('/integracion/farmacia/autorizaciones', { id: 3, status: 403 });
          await req('/farmacia/pedidos', { id: 3, status: 403 });
          assert.ok(await db.epsNotificacionCompartida.count({ where: { usuario_id: 3 } }));
          await db.usuario.update({ where: { id: 3 }, data: { estado: 'ACTIVO', rol_id: 2 } });
          const changedRole = jwt.sign({ id: 3, rol: 2 }, process.env.JWT_SECRET, {
            expiresIn: '10m',
          });
          assert.equal(
            (await req('/integracion/notificaciones', { id: 3, auth: changedRole })).paginacion
              .total,
            0,
          );
          await req('/integracion/admin/eps', {
            id: 1,
            auth: jwt.sign({ id: 1, rol: 1 }, process.env.JWT_SECRET, { expiresIn: -1 }),
            status: 401,
          });
        },
      );
      await t.test('patient formula persists privately and is only readable by its owner', async () => {
        const pdf = '%PDF-1.4\nPrivate test document';
        const body = {
          nombre: 'Test formula', descripcion: 'Fixture',
          archivo: 'data:application/pdf;base64,' + Buffer.from(pdf).toString('base64'),
        };
        const created = (await req('/formulas', { id: 2, method: 'POST', status: 201, body })).formula;
        assert.equal(created.estado, 'PENDIENTE');
        assert.equal((await req('/formulas', { id: 2 })).formulas[0].id, created.id);
        assert.equal((await req('/formulas', { id: 5 })).formulas.length, 0);
        await req('/formulas/' + created.id, { id: 5, status: 404 });
        await req('/formulas/' + created.id, { id: 3, status: 403 });
        const response = await fetch(origin + '/api/formulas/' + created.id, { headers: { Authorization: 'Bearer ' + token(2) } });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.equal(await response.text(), pdf);
      });
      await t.test('delivery requests validate addresses and persist the existing order and payment contracts', async () => {
        const beforeOrders=await db.solicitud.count(),beforePayments=await db.pago.count();
        const payment={numero:'4242424242424242',vencimiento:'12/30',cvv:'123',titular:'Titular de prueba'};
        const body={items:[{id:drug.id,cantidad:1}],tipoEntrega:'DOMICILIO',direccion:'corta',pago:payment};
        const invalid=await req('/pedidos/',{id:2,method:'POST',status:400,key:randomUUID(),body});
        assert.match(invalid.mensaje,/direcci/);
        assert.equal(await db.solicitud.count(),beforeOrders);
        assert.equal(await db.pago.count(),beforePayments);
        body.direccion='Direccion ficticia de pruebas 123';
        const key = randomUUID();
        const result = await req('/pedidos/', { id: 2, method: 'POST', status: 201, key, body });
        const order=await db.solicitud.findUnique({where:{id:result.solicitudId}});
        assert.equal(order.usuario_id,2);
        assert.equal(order.tipo_entrega,'DOMICILIO');
        assert.equal(order.direccion,body.direccion);
        assert.equal(await db.solicitud.count(),beforeOrders+1);
        assert.equal(await db.pago.count(),beforePayments+1);
        const persisted=await db.pago.findFirst({where:{solicitud_id:order.id,usuario_id:2}});
        assert.equal(persisted.estado,'APROBADO');
        assert.equal(persisted.simulacion,true);
        const beforeCancel = await db.medicamento.findUnique({ where: { id: drug.id }, select: { stock: true } });
        await req('/pedidos/' + order.id, { id: 5, method: 'DELETE', status: 404 });
        const cancellation = { id: 2, method: 'DELETE' };
        await Promise.all([
          req('/pedidos/' + order.id, cancellation),
          req('/pedidos/' + order.id, cancellation),
        ]);
        assert.equal((await db.medicamento.findUnique({ where: { id: drug.id }, select: { stock: true } })).stock, beforeCancel.stock + 1);
        assert.equal((await db.solicitud.findUnique({ where: { id: order.id } })).estado, 'CANCELADA');
        assert.equal(await db.pago.count(), beforePayments + 1);
        assert.equal(await db.detalleSolicitud.count({ where: { solicitud_id: order.id } }), 1);
        await req('/pedidos/', { id: 2, method: 'POST', status: 409, key, body });
        const environment = process.env.NODE_ENV;
        try {
          process.env.NODE_ENV = 'production';
          await req('/pedidos/', { id: 2, method: 'POST', status: 503, key: randomUUID(), body });
        } finally {
          if (environment === undefined) delete process.env.NODE_ENV;
          else process.env.NODE_ENV = environment;
        }
        assert.equal(await db.solicitud.count(), beforeOrders + 1);
        assert.equal((await db.medicamento.findUnique({ where: { id: drug.id }, select: { stock: true } })).stock, beforeCancel.stock + 1);
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
