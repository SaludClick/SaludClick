
const prisma = require("../config/prisma");

const health = async () => {
    const resultado = await prisma.$queryRaw`SELECT NOW() AS fecha`;

    return {
        ok: true,
        mensaje: "API funcionando correctamente",
        servidor: resultado[0].fecha
    };
};

module.exports = {
    health
};
