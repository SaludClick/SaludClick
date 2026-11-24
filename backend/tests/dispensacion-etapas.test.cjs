const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID, createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createDispensacion } = require("../src/services/dispensacion.service");
const { createRouter } = require("../src/routes/dispensacion.routes");

test("la matriz aprobada controla convenios, etapas, visita y constancias", async () => {
    const db = new PGlite();
    const operations = createDispensacion({ connect: async () => ({ query: db.query.bind(db), release() {} }) });
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
            CREATE TABLE farmacia_asignaciones (solicitud_id int, activa boolean);
            CREATE TABLE afiliado_cuentas_origen (usuario_id int PRIMARY KEY, eps_id text);
            INSERT INTO usuarios (id,rol_id) VALUES (1,1),(2,2),(3,3),(4,4),(5,5),(6,4),(7,3),(8,2);
            UPDATE usuarios SET estado='INACTIVO', alta_diferenciada=true, correo_verificado_at=now() WHERE id=5;
            UPDATE usuarios SET correo_verificado_at=now() WHERE id=8;
            INSERT INTO eps_entidades VALUES ('EPS-x',true);
            INSERT INTO afiliado_cuentas_origen VALUES (2,'EPS-x');
            INSERT INTO solicitudes VALUES (10,2,'PENDIENTE','DOMICILIO','Dirección ficticia'), (11,2,'PENDIENTE','RECOGER',null);
            INSERT INTO detalle_solicitud VALUES (10,23,9),(11,23,4);
        `);
        for (const migration of ["20261123235000_revocacion_sesiones", "20261124000000_dispensacion_etapas"]) {
            await db.exec(readFileSync(resolve(__dirname, "../prisma/migrations", migration, "migration.sql"), "utf8"));
        }
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
        await preparar();
        let { visita_id } = await asignar();
        const visits = await operations.misVisitas(await actor(5));
        assert.deepEqual(Object.keys(visits[0]).sort(), ["direccion", "iniciada", "solicitud_id", "vence_at", "visita_id"]);
        await step(5, 10, "INICIAR_VISITA", { visita_id });
        await step(5, 10, "RESULTADO_VISITA", { visita_id, resultado: "AUSENCIA" });
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
        await step(5, 10, "RESULTADO_VISITA", delivery, deliveryKey);
        await step(5, 10, "RESULTADO_VISITA", delivery, deliveryKey);
        await assert.rejects(step(5, 10, "RESULTADO_VISITA", { ...delivery, resultado: "DEVOLUCION" }, deliveryKey), { status: 409 });
        const saved = (await db.query("SELECT estado,saldo,etapa_indice,saldo_etapa FROM dispensaciones_etapas WHERE solicitud_id=10")).rows[0];
        assert.deepEqual(saved, { estado: "PARCIAL", saldo: { 23: 5 }, etapa_indice: 1, saldo_etapa: { 23: 5 } });
        const copies = await operations.documentos(await actor(2), 10, true);
        assert.equal(copies.length, 2);
        for (const copy of copies) {
            assert.equal(createHash("sha256").update(copy.documento).digest("hex"), copy.sha256);
            assert.equal(JSON.parse(copy.documento).calidad, "RECEPTOR_AUTORIZADO");
        }
        const revoked = await actor(5);
        await grant(3, 5, "DOMICILIARIO", false);
        await assert.rejects(operations.misVisitas(revoked), { status: 401 });
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
