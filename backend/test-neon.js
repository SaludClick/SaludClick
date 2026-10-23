
require("dotenv").config();

const prisma = require("./src/config/prisma");

async function main() {
    try {
        await prisma.$connect();
        console.log("✅ Conexión a Neon correcta");
    } catch (error) {
        console.error("❌ Error conectando a Neon:");
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
