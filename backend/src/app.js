
const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const cors = require("cors");
const { getAllowedOrigins } = require("./config/cors");
const { resolvePublicFile } = require("./utils/public-assets");
const securityHeaders = require("./config/security-headers");

const routes = require("./routes");

const app = express();

const allowedOrigins = getAllowedOrigins();
app.use(securityHeaders);
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
app.use(express.json({ limit: "8mb" }));

// Archivos estáticos
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const frontendPublicPath = path.resolve(__dirname, "../../frontend/public");
// Serve the Astro build when available. Its generated login injects only the
// public reCAPTCHA site key from frontend/.env.local. Keep public as dev fallback.
const frontendPath = fs.existsSync(frontendDistPath)
    ? frontendDistPath
    : frontendPublicPath;
app.use(async (req, res, next) => {
    if (/^\/api(?:\/|$)/i.test(req.path) || !["GET", "HEAD"].includes(req.method)) return next();
    let pathname;
    try { pathname = decodeURIComponent(req.path); }
    catch { return res.sendStatus(400); }
    const file = await resolvePublicFile(frontendPath, pathname);
    if (!file) return res.sendStatus(404);
    if (path.basename(file) === "restablecer.html") res.set("Referrer-Policy", "no-referrer");
    return res.sendFile(file, { dotfiles: "deny" });
});

// API
app.use("/api", (req, res, next) => {
    if (req.headers.authorization || /^\/auth(?:\/|$)/i.test(req.path)) {
        res.set("Cache-Control", "no-store");
    }
    next();
}, routes);
app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, mensaje: 'Ruta de API no encontrada.' });
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(new Error("No se pudo completar la respuesta."));
    if (error?.message === "Origen no autorizado por CORS.") {
        return res.status(403).json({ ok: false, mensaje: error.message });
    }
    if (error?.type === "entity.parse.failed") {
        return res.status(400).json({
            ok: false,
            mensaje: "El cuerpo JSON no es válido."
        });
    }
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ ok: false, mensaje: 'El archivo o los datos enviados superan el tamaño permitido.' });
    }
    console.error('Error interno de API.');
    return res.status(500).json({ ok: false, mensaje: 'No se pudo completar la operación. Inténtalo nuevamente.' });
});

module.exports = app;
