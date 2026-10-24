
const express = require("express");
const cors = require("cors");

const routes = require("./routes");

const app = express();

app.disable("x-powered-by");

app.use(cors({
    origin: [
        "http://localhost:4321",
        "http://127.0.0.1:4321"
    ]
}));

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

// Ruta principal de la API
app.get("/", (req, res) => {
    res.json({
        ok: true,
        mensaje: "API de SaludClick funcionando correctamente",
        baseDeDatos: "Neon PostgreSQL",
        frontend: "http://localhost:4321"
    });
});

// Rutas existentes de la API
app.use("/api", routes);

// Respuesta para rutas inexistentes
app.use((req, res) => {
    res.status(404).json({
        ok: false,
        mensaje: "Ruta de API no encontrada"
    });
});

module.exports = app;
