const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const Module = require("node:module");
const { PGlite } = require("@electric-sql/pglite");

test("consumir la invitación verifica el correo y conserva inactivo al personal", async () => {
    const db = new PGlite();
    const originalLoad = Module._load;
    let repository;
    try {
        Module._load = function (request, parent, isMain) {
            if (request === "../config/database" && parent?.filename.endsWith("auth.repository.js")) {
                return { connect: async () => ({ query: db.query.bind(db), release() {} }) };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        repository = require("../src/repositories/auth.repository");
    } finally {
        Module._load = originalLoad;
    }
    try {
        await db.exec(`
            CREATE TABLE roles (id serial PRIMARY KEY, nombre text NOT NULL, descripcion text);
            INSERT INTO roles(id,nombre) VALUES (1,'ADMINISTRADOR'),(2,'PACIENTE'),(3,'FARMACIA'),(4,'EPS');
            CREATE TABLE usuarios (id int PRIMARY KEY, rol_id int, estado text, password text);
            CREATE TABLE tokens_recuperacion (id serial PRIMARY KEY, usuario_id int, expira_en timestamp);
        `);
        const migration = resolve(__dirname, "../prisma/migrations/20261123235500_alta_diferenciada/migration.sql");
        await db.exec(readFileSync(migration, "utf8"));
        await db.exec(`
            INSERT INTO usuarios (id, rol_id, estado, password, alta_diferenciada)
            SELECT rol, rol, 'INACTIVO', '!ACTIVACION_PENDIENTE', true FROM generate_series(2,5) rol;
            INSERT INTO tokens_recuperacion (id,usuario_id,expira_en)
            SELECT id,id,(now() AT TIME ZONE 'UTC')+ interval '15 minutes' FROM usuarios;
        `);
        for (const id of [2, 3, 4, 5]) await repository.actualizarPassword(id, "hash-ficticio", id);
        const { rows } = await db.query("SELECT id, estado, correo_verificado_at FROM usuarios ORDER BY id");
        assert.deepEqual(rows.map(row => row.estado), ["ACTIVO", "INACTIVO", "INACTIVO", "INACTIVO"]);
        assert.ok(rows.every(row => row.correo_verificado_at));
        await assert.rejects(repository.actualizarPassword(2, "otro-hash", 2), /inválido o ya expiró/);
    } finally {
        await db.close();
    }
});
