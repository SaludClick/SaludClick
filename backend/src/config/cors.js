const DEVELOPMENT_ORIGINS = [
    "http://localhost:4321",
    "http://127.0.0.1:4321"
];

function getAllowedOrigins({
    nodeEnv = process.env.NODE_ENV,
    configuredOrigins = process.env.CORS_ORIGINS,
    backendPort = process.env.PORT || 3000
} = {}) {
    const origins = String(configuredOrigins || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin && origin !== "*");

    if (!origins.length && nodeEnv !== "production") {
        origins.push("http://localhost:4321");
    }
    if (nodeEnv !== "production") {
        origins.push(
            ...DEVELOPMENT_ORIGINS,
            `http://localhost:${backendPort}`,
            `http://127.0.0.1:${backendPort}`
        );
    }

    return new Set(origins);
}

module.exports = { getAllowedOrigins };
