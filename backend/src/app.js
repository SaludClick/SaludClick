
const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const cors = require("cors");
const { getAllowedOrigins } = require("./config/cors");

const routes = require("./routes");

const app = express();

const allowedOrigins = getAllowedOrigins();
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error("Origen no autorizado por CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    optionsSuccessStatus: 204
}));

app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
    );
    next();
});

app.use(express.json({ limit: "8mb" }));

// Archivos estáticos
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const frontendPublicPath = path.resolve(__dirname, "../../frontend/public");
// Serve the Astro build when available. Its generated login injects only the
// public reCAPTCHA site key from frontend/.env.local. Keep public as dev fallback.
const frontendPath = fs.existsSync(frontendDistPath)
    ? frontendDistPath
    : frontendPublicPath;
app.use(express.static(frontendPath));

// API
app.use("/api", routes);

// Página principal
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.message === "Origen no autorizado por CORS.") {
        return res.status(403).json({ ok: false, mensaje: error.message });
    }
    if (error?.type === "entity.parse.failed") {
        return res.status(400).json({
            ok: false,
            mensaje: "El cuerpo JSON no es válido."
        });
    }
    return next(error);
});

module.exports = app;
