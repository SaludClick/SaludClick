// require("dotenv").config();
// const app = require("./src/app");
// const pool = require("./src/config/database");

// const PORT = process.env.PORT || 3000;

// async function startServer() {
//     try {
//         const connection = await pool.getConnection();

//         console.log("✅ Conexión a MySQL exitosa");

//         connection.release();

//         app.listen(PORT, () => {
//             console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
//         });

//     } catch (error) {
//         console.error("❌ Error conectando a MySQL:");
//         console.error(error.message);
//     }
// }

// startServer();




require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await prisma.$connect();

        console.log("✅ Conexión a Neon PostgreSQL exitosa");

        app.listen(PORT, () => {
            console.log(
                `🚀 Servidor ejecutándose en http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error("❌ Error conectando a Neon PostgreSQL:");
        console.error(error.message);

        process.exitCode = 1;
    }
}

startServer();

async function shutdown() {
    await prisma.$disconnect();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
