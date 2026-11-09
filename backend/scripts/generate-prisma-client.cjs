const { spawnSync } = require("node:child_process");
const path = require("node:path");

const prismaCli = path.resolve(
    __dirname,
    "..",
    "node_modules",
    "prisma",
    "build",
    "index.js"
);
const result = spawnSync(
    process.execPath,
    [prismaCli, "generate"],
    {
        cwd: path.resolve(__dirname, ".."),
        env: {
            ...process.env,
            DATABASE_URL: "postgresql://127.0.0.1:1/prisma_generate"
        },
        stdio: "inherit"
    }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
