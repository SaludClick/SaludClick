const { Pool } = require("pg");
const path = require("path");

require("dotenv").config({
    path: path.resolve(__dirname, "../../.env")
});

if (!process.env.EPS_DATABASE_URL) {
    throw new Error("Falta EPS_DATABASE_URL en el archivo .env");
}

const epsPool = new Pool({
    connectionString: process.env.EPS_DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

epsPool.on("error", (error) => {
    console.error("Error en conexión EPS:", error.message);
});

module.exports = epsPool;