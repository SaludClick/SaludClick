const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { provisionAdmin } = require("../scripts/provision-admin");

test("el aprovisionamiento guarda bcrypt, restringe roles y no pasa la contraseÃ±a en claro", async () => {
  const calls = [];

  const prisma = {
    rol: {
      findUnique: async ({ where }) => {
        calls.push({ operation: "rol.findUnique", where });
        return { id: where.id };
      }
    },
    usuario: {
      findFirst: async ({ where }) => {
        calls.push({ operation: "usuario.findFirst", where });
        return null;
      },
      create: async ({ data }) => {
        calls.push({ operation: "usuario.create", data });
        return { id: 42 };
      }
    }
  };

  const password = "local-test-password-2026";
  const passwordHash = "$2b$10$synthetic-test-hash";

  const bcrypt = {
    hash: async (receivedPassword, cost) => {
      assert.equal(receivedPassword, password);
      assert.equal(cost, 10);
      return passwordHash;
    }
  };

  await provisionAdmin({
    prisma,
    bcrypt,
    admin: {
      name: "Local",
      surname: "Admin",
      email: "ADMIN@example.invalid",
      documentNumber: "",
      roleId: 1
    },
    password
  });

  const createCall = calls.find(
    ({ operation }) => operation === "usuario.create"
  );

  assert.ok(createCall);
  assert.equal(createCall.data.correo, "admin@example.invalid");
  assert.equal(createCall.data.password, passwordHash);
  assert.equal(createCall.data.rol_id, 1);
  assert.equal(createCall.data.estado, "ACTIVO");
  assert.equal(createCall.data.cedula, null);
  assert.notEqual(createCall.data.password, password);
  assert.equal(calls.length, 3);
});

test("el aprovisionamiento rechaza roles fuera de 1/3 antes de consultar o insertar", async () => {
  let queried = false;

  const prisma = {
    rol: {
      findUnique: async () => {
        queried = true;
        return { id: 2 };
      }
    },
    usuario: {
      findFirst: async () => {
        queried = true;
        return null;
      },
      create: async () => {
        queried = true;
      }
    }
  };

  await assert.rejects(
    provisionAdmin({
      prisma,
      bcrypt: { hash: async () => "unused" },
      admin: {
        name: "Local",
        surname: "Admin",
        email: "admin@example.invalid",
        roleId: 2
      },
      password: "local-test-password-2026"
    }),
    /Rol administrativo no permitido/
  );

  assert.equal(queried, false);
});

test("el aprovisionamiento no crea duplicados de correo", async () => {
  let inserted = false;

  const prisma = {
    rol: {
      findUnique: async ({ where }) => ({ id: where.id })
    },
    usuario: {
      findFirst: async ({ where }) => {
        assert.equal(where.correo, "admin@example.invalid");
        return { id: 9 };
      },
      create: async () => {
        inserted = true;
      }
    }
  };

  await assert.rejects(
    provisionAdmin({
      prisma,
      bcrypt: { hash: async () => "unused" },
      admin: {
        name: "Local",
        surname: "Admin",
        email: "admin@example.invalid",
        roleId: 3
      },
      password: "local-test-password-2026"
    }),
    /El correo ya/
  );

  assert.equal(inserted, false);
});

test("los scripts públicos usan PostgreSQL y el esquema generado incluye defaults e idempotencia", () => {
  const databaseDir = path.resolve(__dirname, "../database");
  const install = fs.readFileSync(
    path.join(databaseDir, "install_schema_public.sql"),
    "utf8"
  );
  const compatibilitySchema = fs.readFileSync(
    path.join(databaseDir, "saludclick.sql"),
    "utf8"
  );
  const seed = fs.readFileSync(
    path.join(databaseDir, "seed_demo_public.sql"),
    "utf8"
  );

  for (const sql of [install, compatibilitySchema]) {
    assert.match(sql, /CREATE TABLE "usuarios"/);
    assert.match(sql, /DEFAULT 'ACTIVO'/);
    assert.match(sql, /"idempotency_key" UUID/);
    assert.match(sql, /"solicitudes_usuario_id_idempotency_key_key"/);
    assert.doesNotMatch(sql, /AUTO_INCREMENT|USE saludclick|ENGINE=|ON UPDATE CURRENT_TIMESTAMP/i);
  }
  assert.match(seed, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(seed, /INSERT IGNORE|USE saludclick/i);

  for (const legacy of ["migration_v2.sql", "upgrade_schema_public.sql"]) {
    const retired = fs.readFileSync(path.join(databaseDir, legacy), "utf8");
    assert.match(retired, /RAISE EXCEPTION/);
    assert.doesNotMatch(retired, /UPDATE medicamentos|ALTER TABLE usuarios CHANGE/i);
  }
});


