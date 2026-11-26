const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID, createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const { Pool } = require("pg");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createDispensacion } = require("../src/services/dispensacion.service");
const { createRouter } = require("../src/routes/dispensacion.routes");

test("la matriz aprobada controla convenios, etapas, visita y constancias", async () => {
    const port = process.env.DISPENSACION_TEST_PORT;
    assert.ok(!port || (/^[1-9]\d{3,4}$/.test(port) && Number(port) <= 65535));
    const native = port && new Pool({
        host: "127.0.0.1", port: Number(port), user: "saludclick_test",
        database: "saludclick_dispensacion_test", max: 4
    });
    if (native) {
        const { rows: [target] } = await native.query("SELECT current_database() AS db, inet_server_addr()::text AS host");
        assert.deepEqual(target, { db: "saludclick_dispensacion_test", host: "127.0.0.1/32" });
    }
    const db = native ? { query: native.query.bind(native), exec: native.query.bind(native), close: () => native.end() } : new PGlite();
    const operations = createDispensacion(native || { connect: async () => ({ query: db.query.bind(db), release() {} }) });
    try {
        await db.exec(`
            CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO','INACTIVO');
            CREATE TABLE usuarios (id int PRIMARY KEY, rol_id int, estado "EstadoUsuario" DEFAULT 'ACTIVO',
                correo text, password text, correo_verificado_at timestamptz, alta_diferenciada boolean DEFAULT false);
            CREATE TABLE ips_entidades (id varchar(80) PRIMARY KEY, nombre text, nit text, activa boolean);
            CREATE TABLE eps_entidades (id text PRIMARY KEY, activa boolean);
            CREATE TABLE ips_eps (ips_id text, eps_id text, activa boolean, PRIMARY KEY(ips_id,eps_id));
            CREATE TABLE ips_accesos (usuario_id int PRIMARY KEY, ips_id varchar(80), activo boolean);
            CREATE TABLE eps_accesos (usuario_id int PRIMARY KEY, eps_id text, activo boolean);
            CREATE TABLE farmacia_sesiones (usuario_id int PRIMARY KEY, revocadas_at timestamptz);
            CREATE TABLE solicitudes (id int PRIMARY KEY, usuario_id int, estado text, tipo_entrega text,direccion text);
            CREATE TABLE detalle_solicitud (solicitud_id int, medicamento_id int, cantidad int);
            CREATE TABLE medicamentos (id int PRIMARY KEY, stock int);
            CREATE TABLE farmacia_asignaciones (solicitud_id int, activa boolean);
            CREATE TABLE afiliado_cuentas_origen (usuario_id int PRIMARY KEY, eps_id text);
            INSERT INTO usuarios (id,rol_id) VALUES (1,1),(2,2),(3,3),(4,4),(5,5),(6,4),(7,3),(8,2);
            UPDATE usuarios SET estado='INACTIVO', alta_diferenciada=true, correo_verificado_at=now() WHERE id=5;
            UPDATE usuarios SET correo_verificado_at=now() WHERE id=8;
            INSERT INTO eps_entidades VALUES ('EPS-x',true);
            INSERT INTO afiliado_cuentas_origen VALUES (2,'EPS-x');
            INSERT INTO solicitudes VALUES (10,2,'PENDIENTE','DOMICILIO','Dirección ficticia'), (11,2,'PENDIENTE','RECOGER',null);
            INSERT INTO detalle_solicitud VALUES (10,23,9),(11,23,4);
            INSERT INTO medicamentos VALUES (23,40);
        `);
        for (const migration of ["20261117180000_farmacia_inventario_propio", "20261123235000_revocacion_sesiones",
            "20261124000000_dispensacion_etapas", "20261124010000_stock_dispensacion", "20261125000000_adjuntos_visita"]) {
            await db.exec(readFileSync(resolve(__dirname, "../prisma/migrations", migration, "migration.sql"), "utf8"));
        }
        await db.exec("INSERT INTO farmacia_existencias (farmacia_id,medicamento_id,cantidad) VALUES (3,23,3)");
        const stock = async () => (await db.query("SELECT cantidad,reservado FROM farmacia_existencias WHERE farmacia_id=3 AND medicamento_id=23")).rows[0];
        const actor = async id => (await db.query("SELECT id,rol_id,session_version AS sv FROM usuarios WHERE id=$1", [id])).rows[0];
        const grant = async (id, target, perfil, activo = true) =>
            operations.habilitarFarmacia(await actor(id), target, { perfil, activo });
        const clinic = async (id, target, perfil, extra = {}) =>
            operations.habilitarIps(await actor(id), "IPS-x", target, { perfil, activo: true, ...extra });
        const step = async (id, order, action, data = {}, key = randomUUID()) =>
            operations.procesar(await actor(id), order, action, key, data);
        const future = new Date(Date.now() + 600000).toISOString();
        const plan = { cantidades: { 23: 9 }, etapas: [{ 23: 4 }, { 23: 5 }], vence_at: future };
        await operations.configurarIps(await actor(1), "IPS-x", {
            nombre: "Prestador ficticio", nit: "999", activa: true, eps_id: "EPS-x", convenio_activo: true
        });
        await clinic(1, 4, "RESPONSABLE");
        await assert.rejects(clinic(4, 4, "CLINICO", { revision: "credencial ficticia" }), { status: 403 });
        await clinic(4, 6, "OPERATIVO");
        await assert.rejects(step(6, 10, "AUTORIZAR", plan), { status: 403 });
        await clinic(4, 6, "CLINICO", { revision: "credencial ficticia" });
        await grant(1, 3, "RESPONSABLE");
        await grant(1, 7, "RESPONSABLE");
        await grant(3, 5, "DOMICILIARIO");
        await assert.rejects(grant(7, 5, "DOMICILIARIO"), { status: 409 });
        await assert.rejects(step(1, 10, "AUTORIZAR", plan), { status: 403 });
        await assert.rejects(step(6, 10, "AUTORIZAR", { ...plan, vence_at: "2000-01-01T00:00:00Z" }), { status: 409 });
        await step(6, 10, "AUTORIZAR", plan);
        assert.deepEqual(await step(1, 10, "ASIGNAR", { farmacia_id: 3 }),
            { solicitud_id: 10, estado: "ASIGNADA", farmacia_id: 3 });
        await assert.rejects(db.exec("UPDATE solicitudes SET estado='ENTREGADA' WHERE id=10"), { code: "23514" });
        await assert.rejects(db.exec("INSERT INTO farmacia_asignaciones VALUES (10,true)"), { code: "23514" });
        await assert.rejects(step(7, 10, "PREPARAR", { cantidades: { 23: 4 } }), { status: 403 });
        await assert.rejects(step(3, 10, "PREPARAR", { cantidades: { 23: 5 } }), { status: 409 });
        const preparar = () => step(3, 10, "PREPARAR", { cantidades: { 23: 4 } });
        const asignar = () => step(3, 10, "ASIGNAR_VISITA", { domiciliario_id: 5 });
        await assert.rejects(preparar(), /existencias libres/);
        assert.deepEqual(await stock(), { cantidad: 3, reservado: 0 });
        await db.exec("UPDATE farmacia_existencias SET cantidad=9");
        await preparar();
        assert.deepEqual(await stock(), { cantidad: 9, reservado: 4 });
        let { visita_id } = await asignar();
        const visits = await operations.misVisitas(await actor(5));
        assert.deepEqual(Object.keys(visits[0]).sort(), ["adjuntos", "direccion", "iniciada", "solicitud_id", "vence_at", "visita_id"]);
        await step(5, 10, "INICIAR_VISITA", { visita_id });
        const pdf = Buffer.from("%PDF-1.4\nDocumento ficticio\n%%EOF\n");
        const adjunto = { visita_id, nombre: "visita.pdf", contenido: pdf.toString("base64") };
        const courier = await actor(5);
        const patient = await actor(2);
        const otherPatient = await actor(8);
        await assert.rejects(operations.adjuntarVisita(courier, 10, { ...adjunto, contenido: "AAAA" }), { status: 400 });
        const archivo = await operations.adjuntarVisita(courier, 10, adjunto);
        assert.deepEqual(await operations.adjuntarVisita(courier, 10, adjunto), archivo);
        assert.equal((await operations.misVisitas(courier))[0].adjuntos, 1);
        assert.equal((await operations.adjuntosPaciente(patient, 10))[0].id, archivo.id);
        assert.deepEqual(await operations.adjuntosPaciente(patient, 10, archivo.id), pdf);
        await assert.rejects(operations.adjuntosPaciente(otherPatient, 10, archivo.id), { status: 404 });
        await step(5, 10, "RESULTADO_VISITA", { visita_id, resultado: "AUSENCIA" });
        assert.deepEqual(await stock(), { cantidad: 9, reservado: 0 });
        await preparar();
        ({ visita_id } = await asignar());
        await step(5, 10, "INICIAR_VISITA", { visita_id });
        await assert.rejects(step(5, 10, "RESULTADO_VISITA", { visita_id, resultado: "ENTREGADA" }), { status: 409 });
        await assert.rejects(operations.documentos(await actor(8), 10, false), { status: 404 });
        await step(2, 10, "AUTORIZAR_RECEPTOR", { visita_id, receptor_id: 8 });
        const { version } = await operations.documentos(await actor(8), 10, false);
        const signature = { visita_id, version, tratamiento: true, recepcion: true };
        const signatureKey = randomUUID();
        const signed = await step(8, 10, "FIRMAR", signature, signatureKey);
        assert.deepEqual(signed, { solicitud_id: 10, estado: "EN_REPARTO", visita_id });
        await step(8, 10, "FIRMAR", signature, signatureKey);
        const deliveryKey = randomUUID();
        const delivery = { visita_id, resultado: "ENTREGADA" };
        if (native) {
            const attempts = await Promise.allSettled([
                step(5, 10, "RESULTADO_VISITA", delivery, deliveryKey),
                step(5, 10, "RESULTADO_VISITA", delivery)
            ]);
            const winner = attempts.findIndex(attempt => attempt.status === "fulfilled");
            assert.equal(attempts.filter(attempt => attempt.status === "fulfilled").length, 1);
            assert.equal(attempts[1 - winner].reason.status, 409);
            if (winner === 1) await assert.rejects(step(5, 10, "RESULTADO_VISITA", delivery, deliveryKey), { status: 409 });
        } else await step(5, 10, "RESULTADO_VISITA", delivery, deliveryKey);
        const actualKey = (await db.query("SELECT clave FROM farmacia_stock_eventos WHERE solicitud_id=10 AND tipo='ENTREGA'")).rows[0].clave;
        await step(5, 10, "RESULTADO_VISITA", delivery, actualKey);
        assert.deepEqual(await stock(), { cantidad: 5, reservado: 0 });
        await assert.rejects(step(5, 10, "RESULTADO_VISITA", { ...delivery, resultado: "DEVOLUCION" }, deliveryKey), { status: 409 });
        const saved = (await db.query("SELECT estado,saldo,etapa_indice,saldo_etapa FROM dispensaciones_etapas WHERE solicitud_id=10")).rows[0];
        assert.deepEqual(saved, { estado: "PARCIAL", saldo: { 23: 5 }, etapa_indice: 1, saldo_etapa: { 23: 5 } });
        const copies = await operations.documentos(await actor(2), 10, true);
        assert.equal(copies.length, 2);
        for (const copy of copies) {
            assert.equal(createHash("sha256").update(copy.documento).digest("hex"), copy.sha256);
            assert.equal(JSON.parse(copy.documento).calidad, "RECEPTOR_AUTORIZADO");
        }
        await step(3, 10, "PREPARAR", { cantidades: { 23: 5 } });
        ({ visita_id } = await asignar());
        await step(5, 10, "INICIAR_VISITA", { visita_id });
        await step(2, 10, "FIRMAR", { ...signature, visita_id });
        const reconciliacion = { visita_id, referencia: "verificación ficticia de recepción" };
        await assert.rejects(step(7, 10, "CONCILIAR_VISITA", reconciliacion), { status: 403 });
        await assert.rejects(step(3, 10, "CONCILIAR_VISITA", reconciliacion), { status: 409 });
        await assert.rejects(step(5, 10, "RESULTADO_VISITA", { visita_id, resultado: "DEVOLUCION" }), { status: 409 });
        const revoked = await actor(5);
        await grant(3, 5, "DOMICILIARIO", false);
        await assert.rejects(operations.misVisitas(revoked), { status: 401 });
        const reconciliationKey = randomUUID();
        await db.exec(`
            CREATE FUNCTION fallar_cierre_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'fallo ficticio de bitácora'; END
            $$;
            CREATE TRIGGER fallar_cierre_prueba BEFORE INSERT ON dispensacion_eventos
            FOR EACH ROW WHEN (NEW.accion='CONCILIAR_VISITA') EXECUTE FUNCTION fallar_cierre_prueba();
        `);
        await assert.rejects(step(3, 10, "CONCILIAR_VISITA", reconciliacion, reconciliationKey), /fallo ficticio/);
        assert.deepEqual(await stock(), { cantidad: 5, reservado: 5 });
        assert.equal((await db.query("SELECT estado FROM dispensaciones_etapas WHERE solicitud_id=10")).rows[0].estado, "EN_REPARTO");
        assert.equal((await db.query("SELECT id FROM farmacia_stock_eventos WHERE clave=$1", [reconciliationKey])).rows.length, 0);
        await db.exec("DROP TRIGGER fallar_cierre_prueba ON dispensacion_eventos");
        const result = await step(3, 10, "CONCILIAR_VISITA", reconciliacion, reconciliationKey);
        assert.equal(result.estado, "ENTREGADA");
        assert.deepEqual(result.saldo, { 23: 0 });
        assert.deepEqual(await step(3, 10, "CONCILIAR_VISITA", reconciliacion, reconciliationKey),
            JSON.parse(JSON.stringify(result)));
        const audited = (await db.query("SELECT actor_id, entrada FROM dispensacion_eventos WHERE clave=$1", [reconciliationKey])).rows[0];
        assert.deepEqual(audited, { actor_id: 3, entrada: reconciliacion });
        assert.equal((await operations.documentos(await actor(2), 10, true)).length, 4);
        assert.deepEqual(await stock(), { cantidad: 0, reservado: 0 });
        assert.equal((await db.query("SELECT stock FROM medicamentos WHERE id=23")).rows[0].stock, 40);
        const movements = await db.query(`SELECT farmacia_id,etapa,cantidad,actor_id,domiciliario_id
            FROM farmacia_stock_eventos WHERE solicitud_id=10 AND tipo='ENTREGA' ORDER BY etapa`);
        assert.deepEqual(movements.rows, [
            { farmacia_id: 3, etapa: 1, cantidad: 4, actor_id: 5, domiciliario_id: 5 },
            { farmacia_id: 3, etapa: 2, cantidad: 5, actor_id: 3, domiciliario_id: 5 }
        ]);
        await db.query(`INSERT INTO farmacia_stock_eventos (farmacia_id,medicamento_id,solicitud_id,actor_id,tipo,cantidad,clave,huella,referencia)
            VALUES (3,23,11,3,'ENTREGA',1,$1,$2,'Movimiento histórico ficticio')`, [randomUUID(), "0".repeat(64)]);
        await assert.rejects(step(6, 11, "AUTORIZAR", { cantidades: { 23: 1 }, vence_at: future }), /movimientos históricos/);
        await grant(7, 5, "DOMICILIARIO");
        assert.equal((await operations.misVisitas(await actor(5))).length, 0);

        const app = express();
        app.use(express.json());
        app.use("/desactivada", createRouter({ service: operations, enabled: () => false }));
        app.use("/dispensacion", createRouter({ service: operations, enabled: () => true }));
        const server = app.listen(0, "127.0.0.1");
        try {
            await once(server, "listening");
            const base = `http://127.0.0.1:${server.address().port}`;
            process.env.JWT_SECRET = "dispensacion-isolated-test";
            const token = jwt.sign(await actor(5), process.env.JWT_SECRET, { expiresIn: "5m" });
            const headers = { Authorization: `Bearer ${token}` };
            assert.equal((await fetch(`${base}/desactivada/mis-visitas`, { headers })).status, 404);
            assert.equal((await fetch(`${base}/dispensacion/mis-visitas`)).status, 401);
            assert.deepEqual(await (await fetch(`${base}/dispensacion/mis-visitas`, { headers })).json(), { ok: true, datos: [] });
            assert.equal((await fetch(`${base}/dispensacion/solicitudes/10`, { headers })).status, 404);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    } finally {
        await db.close();
    }
});
