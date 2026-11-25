const { randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const database = "saludclick_domicilio_demo";
const port = Number(process.env.SALUDCLICK_DEMO_PG_PORT);
const user = "saludclick_demo";
const webPort = 4324;
const email = "domiciliario@gmail.com";
const base = path.join(__dirname, "..");
const password = process.env.SALUDCLICK_DEMO_PASSWORD;
if (process.env.NODE_ENV === "production" || !Number.isInteger(port) || port < 1024 || port > 65535 || !password) {
    throw new Error("Define SALUDCLICK_DEMO_PG_PORT y SALUDCLICK_DEMO_PASSWORD para la demo local.");
}
if (!fs.existsSync(path.join(base, "../frontend/dist/pages/dispensacion.html"))) {
    throw new Error("Compila el frontend antes de iniciar la demo.");
}

const url = `postgresql://${user}@127.0.0.1:${port}/${database}?sslmode=disable`;
Object.assign(process.env, {
    DATABASE_URL: url, EPS_DATABASE_URL: url, EPS_DATABASE_SCHEMA: "public", AFILIADOS_EXPECTED_HOST: "127.0.0.1",
    JWT_SECRET: randomBytes(48).toString("hex"), NODE_ENV: "development", PORT: String(webPort),
    DISPENSACION_ETAPAS_ENABLED: "true", FRONTEND_URL: `http://127.0.0.1:${webPort}`,
    RESEND_API_KEY: "", RESEND_FROM: "", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1",
    SMTP_USER: "", SMTP_PASSWORD: "", GOOGLE_CLIENT_ID: "", MAIL_FROM: ""
});
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });

async function schema() {
    const { rows: [identity] } = await pool.query("SELECT current_database() AS db, current_user AS usr, host(inet_server_addr()) AS host");
    if (identity.db !== database || identity.usr !== user || identity.host !== "127.0.0.1") throw new Error("Destino demo rechazado.");
    const { rows: [result] } = await pool.query("SELECT to_regclass('public.saludclick_demo_marker') AS marker, to_regclass('public.usuarios') AS users");
    if (result.marker) return false;
    if (result.users) throw new Error("La base demo debe estar vacía antes del primer inicio.");
    const migrations = path.join(base, "prisma/migrations");
    const files = fs.readdirSync(migrations, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const [index, name] of files.entries()) {
        await pool.query(fs.readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
        if (index === 0) await pool.query("INSERT INTO roles(id,nombre) VALUES(1,'ADMINISTRADOR'),(2,'PACIENTE'),(3,'FARMACIA')");
    }
    await pool.query(fs.readFileSync(path.join(base, "database/seed_demo_public.sql"), "utf8"));
    return true;
}

async function seed() {
    if (!await schema()) return;
    const hash = await bcrypt.hash(password, 12);
    const actors = {};
    for (const [name, address, role] of [
        ["Administración", "admin@example.test", 1], ["Paciente", "paciente@example.test", 2],
        ["Farmacia", "farmacia@example.test", 3], ["Responsable IPS", "responsable@example.test", 4],
        ["Profesional IPS", "ips@example.test", 4], ["Domiciliario", email, 5]
    ]) {
        const { rows: [row] } = await pool.query(`INSERT INTO usuarios (nombre,apellido,correo,password,rol_id,estado,correo_verificado_at)
            VALUES ($1,'Demo',$2,$3,$4,'ACTIVO',now()) RETURNING id`, [name, address, hash, role]);
        actors[address] = row.id;
    }
    const admin = actors["admin@example.test"], patient = actors["paciente@example.test"], pharmacy = actors["farmacia@example.test"],
        lead = actors["responsable@example.test"], clinic = actors["ips@example.test"], courier = actors[email];
    await pool.query(`INSERT INTO eps_entidades (id,nombre,nit,correo,telefono,direccion,ciudad)
        VALUES ('eps-demo','Aseguradora ficticia','900000001','eps@example.test','0000000','Calle ficticia','Bogotá')`);
    await pool.query("INSERT INTO afiliado_cuentas_origen(usuario_id,afiliado_id,eps_id,verificado_por) VALUES ($1,'afiliado-demo','eps-demo',$2)", [patient, admin]);
    const svc = require("../src/services/dispensacion.service").createDispensacion(pool);
    const actor = async id => (await pool.query("SELECT id,rol_id,session_version AS sv FROM usuarios WHERE id=$1", [id])).rows[0];
    const step = async (id, order, action, data) => svc.procesar(await actor(id), order, action, randomUUID(), data);
    await svc.configurarIps(await actor(admin), "ips-demo", { nombre: "IPS de demostración", nit: "900000002",
        activa: true, eps_id: "eps-demo", convenio_activo: true });
    await svc.habilitarIps(await actor(admin), "ips-demo", lead, { perfil: "RESPONSABLE", activo: true });
    await svc.habilitarIps(await actor(lead), "ips-demo", clinic, { perfil: "OPERATIVO", activo: true });
    await svc.habilitarIps(await actor(lead), "ips-demo", clinic, { perfil: "CLINICO", activo: true, revision: "Credencial ficticia" });
    await svc.habilitarFarmacia(await actor(admin), pharmacy, { perfil: "RESPONSABLE", activo: true });
    await svc.habilitarFarmacia(await actor(pharmacy), courier, { perfil: "DOMICILIARIO", activo: true });
    const { rows: [item] } = await pool.query("SELECT id FROM medicamentos ORDER BY id LIMIT 1");
    await pool.query("INSERT INTO farmacia_existencias(farmacia_id,medicamento_id,cantidad) VALUES($1,$2,24)", [pharmacy, item.id]);
    const orderIds = [];
    for (const type of ["visita", "conciliación", "pendiente IPS"]) {
        const { rows: [order] } = await pool.query(`INSERT INTO solicitudes(usuario_id,estado,tipo_entrega,direccion)
            VALUES($1,'PENDIENTE','DOMICILIO',$2) RETURNING id`, [patient, `Dirección ficticia · ${type}`]);
        orderIds.push(order.id);
        await pool.query("INSERT INTO detalle_solicitud(solicitud_id,medicamento_id,cantidad,precio,subtotal) VALUES($1,$2,4,1,4)", [order.id, item.id]);
        if (type === "pendiente IPS") continue;
        await step(clinic, order.id, "AUTORIZAR", { cantidades: { [item.id]: 4 }, etapas: [{ [item.id]: 2 }, { [item.id]: 2 }],
            vence_at: new Date(Date.now() + 7 * 86400000).toISOString() });
        await step(admin, order.id, "ASIGNAR", { farmacia_id: pharmacy });
        await step(pharmacy, order.id, "PREPARAR", { cantidades: { [item.id]: 2 } });
        await step(pharmacy, order.id, "ASIGNAR_VISITA", { domiciliario_id: courier });
    }
    await pool.query("CREATE TABLE saludclick_demo_marker (creada_at timestamptz DEFAULT now()); INSERT INTO saludclick_demo_marker DEFAULT VALUES");
    console.log("Solicitudes demo:", orderIds.join(", "), "farmacia", pharmacy, "domiciliario", courier, "medicamento", item.id);
}

async function start() {
    await seed();
    const express = require("express");
    const app = require("../src/app");
    const controller = require("../src/controllers/auth.controller");
    const authority = require("../src/services/session-authority").createSessionAuthority(pool.query.bind(pool));
    app.set("sessionAuthority", authority);
    const demo = express();
    demo.use((req, res, next) => {
        if (!["127.0.0.1", "localhost"].includes(req.hostname)) return res.sendStatus(403);
        next();
    });
    demo.use(express.json({ limit: "8kb" }));
    const mail = /\/(?:recuperar|register|google)\/?$/i;
    demo.use((req, res, next) => {
        if (req.method === "POST" && (mail.test(req.path) ||
            /^\/api\/(?:administrativo\/usuarios|admin\/cuentas)\/?$/i.test(req.path))) {
            return res.status(403).json({ ok: false, mensaje: "Esta demo no envía correos ni crea cuentas desde el navegador." });
        }
        next();
    });
    const { recoveryRateLimit } = require("../src/middlewares/recovery-rate-limit.middleware");
    demo.post("/demo/login", recoveryRateLimit(30), controller.login);
    demo.get("/login.html", (_req, res) => res.redirect("/demo-login.html"));
    demo.get("/demo-login.html", (_req, res) => res.sendFile(path.join(__dirname, "demo-login.html")));
    demo.get("/demo-login.js", (_req, res) => res.sendFile(path.join(__dirname, "demo-login.js")));
    demo.use(app);
    const server = require("node:http").createServer(demo);
    const { Server } = require("socket.io");
    const origin = `http://127.0.0.1:${webPort}`;
    const io = new Server(server, { allowRequest(req, callback) {
        callback(null, ["127.0.0.1", "localhost"].includes(req.headers.host?.split(":")[0]) &&
            (!req.headers.origin || [origin, `http://localhost:${webPort}`].includes(req.headers.origin)));
    } });
    authority.socket(io.of("/"));
    authority.socket(io.of("/administrativo"), { visitors: true });
    authority.socket(io.of("/farmacia-notificaciones"));
    require("../src/sockets/chat.socket").attachChatSocket(io);
    require("../src/sockets/administrative.socket").attachAdministrativeSocket(io, app);
    require("../src/sockets/farmacia-notificaciones.socket").attachFarmaciaNotifications(io, app);
    server.listen(webPort, "127.0.0.1", () => console.log(`Demo aislada: ${origin}/demo-login.html`));
}

start().catch(async error => {
    console.error("Demo no disponible:", error.code || error.name, error.message);
    await pool.end();
    process.exitCode = 1;
});
