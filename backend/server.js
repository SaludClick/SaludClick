
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const pool = require("./src/config/database");
const epsPool = require("./src/config/epsDatabase");
const prisma = require("./src/config/prisma");
const app = require("./src/app");
const http = require("node:http");
const { Server } = require("socket.io");
const { attachChatSocket } = require("./src/sockets/chat.socket");
const { getAllowedOrigins } = require("./src/config/cors");

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);
const allowedOrigins = getAllowedOrigins();

const io = new Server(httpServer, {
    cors: {
        origin(origin, callback) {
            callback(
                null,
                !origin || allowedOrigins.has(origin)
            );
        },
        methods: ["GET", "POST"]
    }
});

attachChatSocket(io);

async function startServer() {
    try {
        // Conexión de SaludClick
        await pool.query("SELECT 1");
        console.log("✅ Conexión a PostgreSQL de SaludClick exitosa");

        await prisma.$connect();
        console.log("✅ Conexión de Prisma a PostgreSQL exitosa");

        // Conexión de EPS VidaPlena
        await epsPool.query("SELECT 1");
        console.log("✅ Conexión a PostgreSQL de EPS VidaPlena exitosa");

        // Consultar afiliados de EPS
        const resultadoEPS = await epsPool.query(
            "SELECT COUNT(*) AS total FROM afiliados"
        );

        console.log(
            "👥 Afiliados registrados en EPS VidaPlena:",
            resultadoEPS.rows[0].total
        );

        // Iniciar servidor
        httpServer.listen(PORT, () => {
            console.log(
                `🚀 Servidor ejecutándose en http://localhost:${PORT}`
            );
        });

    } catch (error) {
        console.error("❌ Error conectando a las bases de datos:");
        console.error(error.message);

        process.exitCode = 1;
    }
}

async function shutdown() {
    console.log("Cerrando conexiones...");

    await pool.end();
    await epsPool.end();
    await prisma.$disconnect();

    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();

module.exports = { httpServer, io };
