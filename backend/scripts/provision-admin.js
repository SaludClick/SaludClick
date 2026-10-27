
const MIN_PASSWORD_LENGTH = 16;
const ALLOWED_ADMIN_ROLES = new Set([1, 3]);

async function provisionAdmin({ prisma, bcrypt, admin, password }) {
  const name = String(admin.name || "").trim();
  const surname = String(admin.surname || "").trim();
  const email = String(admin.email || "").trim().toLowerCase();
  const documentNumber = String(admin.documentNumber || "").trim();
  const roleId = Number(admin.roleId);

  if (!name || !surname || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Datos administrativos inválidos.");
  }

  if (!ALLOWED_ADMIN_ROLES.has(roleId)) {
    throw new Error("Rol administrativo no permitido.");
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("La contraseña no cumple la longitud mínima.");
  }

  const rol = await prisma.rol.findUnique({
    where: { id: roleId },
    select: { id: true }
  });

  if (!rol) {
    throw new Error("El rol seleccionado no existe.");
  }

  const existing = await prisma.usuario.findFirst({
    where: { correo: email },
    select: { id: true }
  });

  if (existing) {
    throw new Error("El correo ya está registrado.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.usuario.create({
    data: {
      nombre: name,
      apellido: surname,
      correo: email,
      telefono: null,
      tipo_documento: null,
      cedula: documentNumber || null,
      ciudad: null,
      password: passwordHash,
      rol_id: roleId,
      estado: "ACTIVO"
    }
  });
}

function promptLine(readline, question) {
  return new Promise((resolve) => readline.question(question, resolve));
}

function promptHidden(rl, prompt, stdin, stdout) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(
      new Error("El aprovisionamiento requiere una terminal interactiva.")
    );
  }

  return new Promise((resolve, reject) => {
    let value = "";

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    const onData = (buffer) => {
      const key = buffer.toString("utf8");

      if (key === "\u0003") {
        cleanup();
        reject(new Error("Operación cancelada."));
      } else if (key === "\r" || key === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (key === "\u0008" || key === "\u007f") {
        value = value.slice(0, -1);
      } else if (key >= " " && key !== "\u007f") {
        value += key;
      }
    };

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    }

    stdin.on("data", onData);
  });
}

async function main() {
  const readline = require("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let prisma;

  try {
    const name = await promptLine(rl, "Nombre: ");
    const surname = await promptLine(rl, "Apellido: ");
    const email = await promptLine(rl, "Correo: ");
    const documentNumber = await promptLine(rl, "Documento (opcional): ");
    const roleId = await promptLine(rl, "Rol administrativo (1 o 3): ");

    rl.close();

    const password = await promptHidden(
      rl,
      "Contraseña (no se mostrará): ",
      process.stdin,
      process.stdout
    );

    const confirmation = await promptHidden(
      rl,
      "Repita la contraseña: ",
      process.stdin,
      process.stdout
    );

    if (password !== confirmation) {
      throw new Error("Las contraseñas no coinciden.");
    }

    prisma = require("../src/config/prisma");
    const bcrypt = require("bcrypt");

    await provisionAdmin({
      prisma,
      bcrypt,
      admin: { name, surname, email, documentNumber, roleId },
      password
    });

    console.log("Aprovisionamiento completado.");
  } catch (error) {
    console.error(
      "No se pudo completar el aprovisionamiento:",
      error.message
    );
    process.exitCode = 1;
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => {});
    }

    rl.close();
  }
}

module.exports = { provisionAdmin, MIN_PASSWORD_LENGTH };

if (require.main === module) {
  main();
}
