const jwt = require("jsonwebtoken");
const {
    configureApplicationDatabase
} = require("./support/postgres-test-safety.cjs");
const { sanitizeBackendError } = require("./support/sanitize-backend-error.cjs");

const TEST_JWT_SECRET = "saludclick-postgres-integration-only-secret";

async function main() {
    configureApplicationDatabase();
    process.env.PORT = "0";
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const { httpServer, io } = require("../server");
    const pool = require("../src/config/database");
    const prisma = require("../src/config/prisma");
    const [userId, medicationId, idempotencyKey] = process.argv.slice(2);

    if (!/^\d+$/.test(userId || "") || !/^\d+$/.test(medicationId || "") ||
        !/^[0-9a-f-]{36}$/i.test(idempotencyKey || "")) {
        throw new Error("Argumentos de prueba inválidos.");
    }

    try {
        await new Promise((resolve, reject) => {
            if (httpServer.listening) return resolve();
            const timeout = setTimeout(
                () => reject(new Error("El backend no inició a tiempo.")),
                15000
            );
            httpServer.once("listening", () => {
                clearTimeout(timeout);
                resolve();
            });
            httpServer.once("error", error => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        const port = httpServer.address().port;
        const token = jwt.sign(
            { id: Number(userId), correo: "integration@example.test", rol: 2 },
            TEST_JWT_SECRET,
            { expiresIn: "2m" }
        );
        const backendErrors = [];
        const originalConsoleError = console.error;
        let response;
        let body;
        console.error = (...args) => {
            const error = args.find(value => value instanceof Error);
            backendErrors.push(sanitizeBackendError(
                error || args.map(String).join(" "),
                [process.env.TEST_DATABASE_URL]
            ));
        };
        try {
            response = await fetch(`http://127.0.0.1:${port}/api/pedidos/`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey
                },
                body: JSON.stringify({
                    tipoEntrega: "RECOGER",
                    items: [{ id: Number(medicationId), cantidad: 1 }],
                    pago: {
                        numero: "4242 4242 4242 4242",
                        vencimiento: "12/30",
                        cvv: "123",
                        titular: "Prueba de integración"
                    }
                })
            });
            body = await response.json();
        } finally {
            console.error = originalConsoleError;
        }
        process.stdout.write(`INTEGRATION_RESULT:${JSON.stringify({
            status: response.status,
            ok: body.ok,
            solicitudId: body.solicitudId,
            replayed: body.replayed === true,
            backendErrors
        })}\n`);
    } finally {
        await new Promise(resolve => io.close(resolve));
        await pool.end();
        await prisma.$disconnect();
    }
}

main().catch(error => {
    const code = typeof error?.code === "string" ? ` (${error.code})` : "";
    console.error(`PostgreSQL integration worker failed${code}.`);
    process.exitCode = 1;
});
