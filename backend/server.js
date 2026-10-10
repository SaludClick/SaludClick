const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const app = require("./src/app");
const pool = require("./src/config/database");

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        const connection = await pool.getConnection();

        console.log("✅ Conexión a MySQL exitosa");

        connection.release();

        app.listen(PORT, () => {
            console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("❌ Error conectando a MySQL:");
        console.error(error.message);
    }
}

startServer();
