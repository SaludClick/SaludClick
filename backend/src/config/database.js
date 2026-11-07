
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

// pg-connection-string advierte que estos modos serán alias de semántica
// libpq. Normalizarlos evita el cambio futuro a una validación más débil y
// deja la comprobación del certificado habilitada sin opciones SSL inseguras.
const databaseUrl = new URL(process.env.DATABASE_URL);
const sslmode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
if (["prefer", "require", "verify-ca"].includes(sslmode)) {
    databaseUrl.searchParams.set("sslmode", "verify-full");
    process.env.DATABASE_URL = databaseUrl.toString();
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
    console.error("Error en la conexión con Neon:", error.message);
});

module.exports = pool;
