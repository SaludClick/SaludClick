const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const pool = require("./database");

const prisma = new PrismaClient({
    adapter: new PrismaPg(pool)
});

module.exports = prisma;
