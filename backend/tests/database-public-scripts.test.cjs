const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { provisionAdmin } = require("../scripts/provision-admin");

const databaseDir = path.join(__dirname, "..", "database");
const installSql = fs.readFileSync(path.join(databaseDir, "install_schema_public.sql"), "utf8");
const upgradeSql = fs.readFileSync(path.join(databaseDir, "upgrade_schema_public.sql"), "utf8");
const seedSql = fs.readFileSync(path.join(databaseDir, "seed_demo_public.sql"), "utf8");
const provisionScript = fs.readFileSync(path.join(__dirname, "..", "scripts", "provision-admin.js"), "utf8");

test("el esquema público declara las tablas que usa la API y sus relaciones", () => {
  for (const table of ["roles", "categorias", "usuarios", "medicamentos", "solicitudes", "detalle_solicitud", "recordatorios", "tokens_recuperacion", "pagos", "formulas_medicas"]) {
    assert.ok(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${table}\\s*\\(`, "i").test(installSql), `Falta la tabla ${table}`);
  }
  assert.match(installSql, /numero_documento\s+VARCHAR\(30\)\s+NULL\s+UNIQUE/i);
  assert.ok(/CONSTRAINT fk_usuario_rol\s+FOREIGN KEY \(rol_id\)\s+REFERENCES roles\(id\)/i.test(installSql));
  assert.ok(/CONSTRAINT fk_solicitud_usuario\s+FOREIGN KEY \(usuario_id\)\s+REFERENCES usuarios\(id\)/i.test(installSql));
  assert.ok(/CONSTRAINT fk_formula_usuario\s+FOREIGN KEY \(usuario_id\)\s+REFERENCES usuarios\(id\)/i.test(installSql));
  assert.doesNotMatch(installSql, /cedula\s+VARCHAR/i);
});

test("la actualización es explícita y conserva tablas requeridas sin repetir opciones SQL", () => {
  assert.match(upgradeSql, /CHANGE COLUMN cedula numero_documento VARCHAR\(30\) NULL UNIQUE/i);
  assert.match(upgradeSql, /CREATE TABLE IF NOT EXISTS pagos/i);
  assert.match(upgradeSql, /CREATE TABLE IF NOT EXISTS formulas_medicas/i);
  assert.doesNotMatch(upgradeSql, /IF NOT EXISTS IF NOT EXISTS/i);
  assert.doesNotMatch(upgradeSql, /^\s*(INSERT|UPDATE|DELETE)\s/im);
});

test("el seed usa solo roles y catálogo ficticio, sin cuentas ni datos de usuarios", () => {
  assert.match(seedSql, /\(1, 'Administrador'/);
  assert.match(seedSql, /\(3, 'Farmacia'/);
  assert.match(seedSql, /Producto ficticio de demostración/);
  assert.doesNotMatch(seedSql, /INSERT\s+(?:IGNORE\s+)?INTO\s+(?:usuarios|solicitudes|detalle_solicitud|formulas_medicas|pagos)/i);
  assert.doesNotMatch(seedSql, /@|\$2[aby]\$|eyJ[A-Za-z0-9_-]{10,}/);
});

test("los artefactos SQL y de aprovisionamiento no incluyen credenciales ni cuentas insertadas", () => {
  for (const artifact of [installSql, upgradeSql, seedSql, provisionScript]) {
    assert.doesNotMatch(artifact, /\$2[aby]\$\d\d\$/);
    assert.doesNotMatch(artifact, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/);
    assert.doesNotMatch(artifact, /[A-Za-z0-9._%+-]+@(?!example\.(?:com|invalid)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i);
  }
  for (const sql of [installSql, upgradeSql, seedSql]) assert.doesNotMatch(sql, /INSERT\s+INTO\s+usuarios/i);
});

test("el aprovisionamiento guarda bcrypt, restringe roles y no pasa la contraseña en claro", async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT id FROM roles/.test(sql)) return [[{ id: params[0] }]];
    if (/SELECT id FROM usuarios/.test(sql)) return [[]];
    return [{ insertId: 42 }];
  } };
  const bcrypt = { hash: async (password, cost) => {
    assert.equal(password, "local-test-password-2026");
    assert.equal(cost, 10);
    return "$2b$10$synthetic-test-hash";
  } };

  await provisionAdmin({
    pool,
    bcrypt,
    admin: { name: "Local", surname: "Admin", email: "admin@example.invalid", documentNumber: "", roleId: 1 },
    password: "local-test-password-2026"
  });

  const insert = calls.find(({ sql }) => /INSERT INTO usuarios/.test(sql));
  assert.ok(insert);
  assert.ok(insert.params.includes("$2b$10$synthetic-test-hash"));
  assert.ok(!insert.params.includes("local-test-password-2026"));
  assert.equal(calls.length, 3);
});

test("el aprovisionamiento rechaza roles fuera de 1/3 antes de consultar o insertar", async () => {
  let queried = false;
  await assert.rejects(provisionAdmin({
    pool: { query: async () => { queried = true; return [[]]; } },
    bcrypt: { hash: async () => "unused" },
    admin: { name: "Local", surname: "Admin", email: "admin@example.invalid", roleId: 2 },
    password: "local-test-password-2026"
  }), /Rol administrativo no permitido/);
  assert.equal(queried, false);
});

test("el aprovisionamiento no crea duplicados de correo", async () => {
  let inserted = false;
  const pool = { query: async (sql) => {
    if (/SELECT id FROM roles/.test(sql)) return [[{ id: 3 }]];
    if (/SELECT id FROM usuarios/.test(sql)) return [[{ id: 9 }]];
    inserted = true;
    return [[]];
  } };
  await assert.rejects(provisionAdmin({
    pool,
    bcrypt: { hash: async () => "unused" },
    admin: { name: "Local", surname: "Admin", email: "admin@example.invalid", roleId: 3 },
    password: "local-test-password-2026"
  }), /El correo ya está registrado/);
  assert.equal(inserted, false);
});
