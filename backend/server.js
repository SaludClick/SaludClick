const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const pool = require("./src/config/database");
const prisma = require("./src/config/prisma");
const app = require("./src/app");
const http = require("node:http");
const { Server } = require("socket.io");
const { attachChatSocket } = require("./src/sockets/chat.socket");
const { getAllowedOrigins } = require("./src/config/cors");

const PORT = process.env.PORT || 3000;
const httpServer = http.createServer(app);
const allowedOrigins = getAllowedOrigins();
const io = new Server(httpServer, { cors: { origin(origin, callback) { callback(null, !origin || allowedOrigins.has(origin)); }, methods: ["GET", "POST"] } });

attachChatSocket(io);
require('./src/sockets/administrative.socket').attachAdministrativeSocket(io,app);

async function startServer() {
    try {
        await pool.query("SELECT 1");
        console.log("✅ Conexión a PostgreSQL exitosa");
        await prisma.$connect();
        console.log("✅ Conexión de Prisma a PostgreSQL exitosa");

        httpServer.listen(PORT, () => {
            console.log(
                `🚀 Servidor ejecutándose en http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error("❌ Error conectando a PostgreSQL:");
        console.error(`${error.name}${error.code ? ` (${error.code})` : ""}`);

        process.exitCode = 1;
    }
}

startServer();

async function shutdown() {
    await require("./src/config/eps-prisma").cerrarConexionEPS();
    await pool.end();
    await prisma.$disconnect();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = { httpServer, io };
