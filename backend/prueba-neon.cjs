const prisma = require("./src/config/prisma");

async function probarConexion() {
    try {
        const resultado = await prisma.$queryRaw`SELECT NOW() AS fecha`;
        console.log("NEON OK:", resultado);
    } catch (error) {
        console.error("No se pudo consultar Neon.");
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

probarConexion();
