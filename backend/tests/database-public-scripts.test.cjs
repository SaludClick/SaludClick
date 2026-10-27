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



