
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

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
    console.error("Error en la conexión con Neon:", error.message);
});

module.exports = pool;
