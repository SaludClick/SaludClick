const prisma = require("./src/config/prisma");

async function probarConexion() {
    try {
        const resultado = await prisma.$queryRaw`SELECT NOW() AS fecha`;
        console.log("NEON OK:", resultado);
    } catch (error) {
        console.error("ERROR NEON:", error.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

probarConexion();
