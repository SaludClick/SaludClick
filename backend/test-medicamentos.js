
require("dotenv").config();

const prisma = require("./src/config/prisma");

async function main() {
    try {
        const medicamentos = await prisma.medicamento.findMany({
            take: 5,
            include: {
                categoria: true
            }
        });

        console.log(
            "Medicamentos encontrados:",
            medicamentos.length
        );

        console.dir(medicamentos, { depth: 2 });
    } catch (error) {
        console.error("Error consultando medicamentos:");
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
