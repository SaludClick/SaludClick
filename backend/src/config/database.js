
const { Pool } = require("pg");
const path = require("path");

require("dotenv").config({
    path: path.resolve(__dirname, "../../.env")
});

if (!process.env.DATABASE_URL) {
    throw new Error(
        "Falta DATABASE_URL en el archivo .env del backend"
    );
}

let databaseUrl;
try {
    databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
    throw new Error("DATABASE_URL no es una conexión PostgreSQL válida.");
}
const overrides = new Set(["host", "hostaddr", "port", "user", "password", "database", "dbname", "service", "servicefile"]);
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.hostname ||
    [...databaseUrl.searchParams.keys()].some(key => overrides.has(key.toLowerCase()))) {
    throw new Error("DATABASE_URL no es una conexión PostgreSQL válida.");
}
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname);
if (!loopback) {
    databaseUrl.searchParams.set("sslmode", "verify-full");
} else if (["prefer", "require", "verify-ca"].includes(databaseUrl.searchParams.get("sslmode"))) {
    databaseUrl.searchParams.set("sslmode", "verify-full");
}

const pool = new Pool({
    connectionString: databaseUrl.toString(),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on("error", () => {
    console.error("Error en la conexión con Neon.");
});

module.exports = pool;
