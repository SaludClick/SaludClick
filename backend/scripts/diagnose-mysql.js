// Diagnostico independiente: no importa la aplicacion ni modifica datos.
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

const keys = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const envPath = path.resolve(__dirname, "../.env");

async function probe(config, label) {
    let connection;
    try {
        connection = await mysql.createConnection(config);
        await connection.query("SELECT 1");
        console.log(`${label}: conexion y SELECT 1 correctos.`);
        return "OK";
    } catch (error) {
        // No imprimir message, stack, sql ni el objeto de conexion.
        const descriptions = {
            ER_ACCESS_DENIED_ERROR: "MySQL rechazo la autenticacion de la cuenta desde este origen.",
            ER_DBACCESS_DENIED_ERROR: "La cuenta no tiene acceso al esquema solicitado.",
            ER_BAD_DB_ERROR: "El esquema solicitado no existe en este servidor.",
            ECONNREFUSED: "El destino rechazo la conexion TCP.",
            ENOTFOUND: "No se pudo resolver el host.",
            ETIMEDOUT: "Tiempo de conexion agotado.",
            HANDSHAKE_SSL_ERROR: "Fallo de negociacion TLS."
        };
        const code = Object.hasOwn(descriptions, error.code) ? error.code : "ERROR_NO_CLASIFICADO";
        console.log(`${label}: ${code}. ${descriptions[code] || "Fallo interno sanitizado."}`);
        return code;
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch {
                connection.destroy();
                console.log("Cierre normal fallido; conexion destruida localmente.");
            }
        }
    }
}

async function main() {
    let fileValues;
    try {
        fileValues = dotenv.parse(fs.readFileSync(envPath));
    } catch {
        console.log("No se pudo leer el .env de la raiz del proyecto.");
        process.exitCode = 1;
        return;
    }

    // Misma prioridad que dotenv.config(): el entorno heredado prevalece.
    const values = {};
    for (const key of keys) {
        const inherited = process.env[key] !== undefined;
        values[key] = inherited ? process.env[key] : fileValues[key];
        const present = typeof values[key] === "string" && values[key].length > 0;
        const different = inherited && fileValues[key] !== undefined && values[key] !== fileValues[key];
        console.log(`${key}: ${present ? "presente" : "ausente o vacia"}; origen=${inherited ? "entorno heredado" : ".env"}${different ? "; difiere del archivo" : ""}.`);
    }
    console.log(`Directorio de ejecucion coincide con raiz: ${path.resolve(process.cwd()) === path.dirname(envPath)}.`);
    const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
    if (required.some(key => !values[key] || !values[key].trim())) {
        console.log("Diagnostico detenido: falta configuracion explicita; no se intentan credenciales alternativas.");
        process.exitCode = 1;
        return;
    }
    const port = values.DB_PORT === undefined ? 3306 : Number(values.DB_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.log("Diagnostico detenido: DB_PORT invalido.");
        process.exitCode = 1;
        return;
    }
    const config = {
        host: values.DB_HOST,
        port,
        user: values.DB_USER,
        password: values.DB_PASSWORD,
        database: values.DB_NAME,
        connectTimeout: 5000
    };
    const result = await probe(config, "Con esquema configurado");
    if (result !== "OK") process.exitCode = 1;
    if (["ER_ACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"].includes(result)) {
        const { database, ...serverConfig } = config;
        const serverResult = await probe(serverConfig, "Misma cuenta y destino, sin seleccionar esquema");
        if (serverResult === "ER_ACCESS_DENIED_ERROR") {
            console.log("El rechazo ocurre incluso sin seleccionar esquema. No es posible distinguir password incorrecta, cuenta/origen o politica de autenticacion solo con este error; requiere revision administrativa de MySQL.");
        }
    }
}

if (require.main === module) {
    main().catch(() => {
        console.log("Diagnostico interrumpido por un error interno; detalles omitidos.");
        process.exitCode = 1;
    });
}
