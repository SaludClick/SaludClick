
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const app = require("./src/app");
const pool = require("./src/config/database");

const PORT = process.env.PORT || 3000;

async function startServer() {
    let client;

    try {
        client = await pool.connect();

        await client.query("SELECT 1");

        console.log("✅ Conexión a Neon PostgreSQL exitosa");

        client.release();
        client = null;

        app.listen(PORT, () => {
            console.log(
                `🚀 Servidor ejecutándose en http://localhost:${PORT}`
            );
        });
    } catch (error) {
        if (client) {
            client.release();
        }

        console.error("❌ Error conectando a Neon PostgreSQL:");
        console.error(error.message);

        process.exitCode = 1;
    }
}

startServer();
