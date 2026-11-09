const REQUIRED_MIGRATIONS = [
    "20261016220827_init",
    "20261025170000_add_formulas_medicas",
    "20261106000000_add_chat",
    "20261107215000_add_order_idempotency"
];

function getTestDatabaseUrl() {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
        throw new Error("Falta TEST_DATABASE_URL; se cancela la suite PostgreSQL.");
    }

    let url;
    let database;
    try {
        url = new URL(connectionString);
        database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
        throw new Error("TEST_DATABASE_URL no es una URL PostgreSQL válida.");
    }

    if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        url.hostname !== "127.0.0.1" ||
        url.port !== "55432" ||
        database !== "saludclick_test" ||
        !url.username ||
        !url.password
    ) {
        throw new Error(
            "Destino rechazado: se requiere PostgreSQL autenticado en 127.0.0.1:55432/saludclick_test."
        );
    }

    const routingOverrides = new Set([
        "host", "hostaddr", "port", "database", "dbname",
        "user", "password", "service", "servicefile", "options"
    ]);
    if ([...url.searchParams.keys()].some(key => routingOverrides.has(key.toLowerCase()))) {
        throw new Error("TEST_DATABASE_URL contiene parámetros que pueden alterar el destino.");
    }

    return connectionString;
}

function configureApplicationDatabase() {
    const connectionString = getTestDatabaseUrl();
    process.env.DATABASE_URL = connectionString;
    return connectionString;
}

async function verifyTestDatabase(pool) {
    let identity;
    try {
        ({ rows: [identity] } = await pool.query(
            "SELECT current_database() AS database, current_schema() AS schema"
        ));
    } catch {
        throw new Error("Falló la conexión autenticada a la base PostgreSQL de pruebas.");
    }

    if (identity?.database !== "saludclick_test" || identity?.schema !== "public") {
        throw new Error("La conexión efectiva no está en saludclick_test.public.");
    }

    let applied;
    try {
        ({ rows: applied } = await pool.query(
            `SELECT migration_name
             FROM "_prisma_migrations"
             WHERE migration_name = ANY($1::text[])
               AND finished_at IS NOT NULL
               AND rolled_back_at IS NULL`,
            [REQUIRED_MIGRATIONS]
        ));
    } catch {
        throw new Error("No se pudo comprobar el historial de migraciones; no se escribirán fixtures.");
    }

    const appliedNames = new Set(applied.map(({ migration_name }) => migration_name));
    const missing = REQUIRED_MIGRATIONS.filter(name => !appliedNames.has(name));
    if (missing.length) {
        throw new Error(`Migraciones requeridas pendientes: ${missing.join(", ")}.`);
    }
}

module.exports = {
    configureApplicationDatabase,
    getTestDatabaseUrl,
    verifyTestDatabase
};
