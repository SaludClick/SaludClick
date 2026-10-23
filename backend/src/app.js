
const express = require("express");
const cors = require("cors");

const routes = require("./routes");

const app = express();

app.disable("x-powered-by");

app.use(
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:4321",
    })
);

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

// Estado de la API
app.get("/api/health", (req, res) => {
    res.status(200).json({
        ok: true,
        success: true,
        message: "API de SaludClick funcionando correctamente",
    });
});

// Mantener las rutas REST existentes
app.use("/api", routes);

module.exports = app;
